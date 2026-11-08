// CPU.gs — un micro-paso por llamada. ISA de 2 bytes.
// Buses: dirección interna 9 b, datos internos 8 b,
// dirección externa física 8 b, datos externos 8 b,
// control Read, Write, Clock, IO.
// Un emisor por bus. Dos emisores: ERROR y el destino no se escribe.
// La micro-palabra se publica en cada paso.

var SIM_OPNOMBRE = {
  0: "NOP", 1: "HLT",
  2: "MOV_I", 3: "MOV_R",
  4: "LD", 5: "ST",
  6: "ADD_I", 7: "ADD_R",
  8: "SUB_I", 9: "SUB_R",
  10: "AND_I", 11: "AND_R",
  12: "OR_I", 13: "OR_R",
  14: "CMP_I", 15: "CMP_R",
  16: "INC", 17: "DEC",
  18: "JMP", 19: "JZ", 20: "JNZ", 21: "JC",
  22: "IN", 23: "OUT"
};

var SIM_ALU_COD = { MOV: 0, ADD: 1, SUB: 2, AND: 3, OR: 4, CMP: 5, INC: 6, DEC: 7 };

function simPrepararPaso(e) {
  e.senales = simSenalesVacias();
  e.buffers = {};
  e.buses.dirInt = { emisor: "", valor: "" };
  e.buses.datInt = { emisor: "", valor: "" };
  e.buses.dirExt = { emisor: "", valor: "" };
  e.buses.datExt = { emisor: "", valor: "" };
  e.buses.rd = 0;
  e.buses.wr = 0;
  e.buses.ck = 0;
  e.buses.io = 0;
  e.cacheNota = "";
  e.ultimaVA = "";
  e.ultimaPA = "";
  e.reclasificar = "";
  e.faseError = 0;
  e.evento = "";
}

function simPoner(e, mapa) {
  var k;
  for (k in mapa) {
    if (Object.prototype.hasOwnProperty.call(mapa, k)) e.senales[k] = mapa[k] ? 1 : 0;
  }
}

function simAluBits(e, codigo) {
  e.senales.ALU2 = (codigo >> 2) & 1;
  e.senales.ALU1 = (codigo >> 1) & 1;
  e.senales.ALU0 = codigo & 1;
}

function simEmitir(e, bus, fuentes) {
  if (!fuentes || !fuentes.length) {
    e.buses[bus] = { emisor: "", valor: "" };
    return true;
  }
  if (fuentes.length > 1) {
    var nombres = [];
    var i;
    for (i = 0; i < fuentes.length; i++) nombres.push(fuentes[i].nombre);
    e.error = "Contención en " + bus + ": " + nombres.join(" y ");
    e.faseError = 1;
    e.buses[bus] = { emisor: "CONTENCION", valor: "" };
    return false;
  }
  e.buses[bus] = { emisor: fuentes[0].nombre, valor: fuentes[0].valor };
  e.buffers[fuentes[0].nombre] = { en: 1, ld: 0 };
  return true;
}

function simCargarBuf(e, nombre) {
  if (!e.buffers[nombre]) e.buffers[nombre] = { en: 0, ld: 0 };
  e.buffers[nombre].ld = 1;
}

function simPulso(e) {
  var s = e.senales;
  var carga = s.Ld_MAR || s.Ld_MDR || s.Ld_IRH || s.Ld_IRL || s.Ld_AX || s.Ld_BX || s.Ld_CX || s.Ld_DX || s.Ld_PC || s.Ld_ALU || s.Ld_LCD || s.INC_PC || s.Mem_R || s.Mem_W;
  e.buses.ck = carga ? 1 : 0;
  e.buses.rd = s.Mem_R ? 1 : 0;
  e.buses.wr = s.Mem_W ? 1 : 0;
  e.buses.io = s.IO ? 1 : 0;
  e.palabra = simPalabraHex(e.senales);
  e.bits = simBitsTexto(e.senales);
}

function simAlu(kind, a, b, flags) {
  a = a & 255;
  b = b & 255;
  var r = 0;
  var cf = flags.cf ? 1 : 0;
  var zf = flags.zf ? 1 : 0;
  var sf = flags.sf ? 1 : 0;
  if (kind === "MOV") r = b;
  else if (kind === "ADD") {
    var s = a + b;
    r = s & 255;
    cf = s > 255 ? 1 : 0;
  } else if (kind === "SUB" || kind === "CMP") {
    var d = a - b;
    r = d & 255;
    cf = d < 0 ? 1 : 0;
  } else if (kind === "AND") r = a & b;
  else if (kind === "OR") r = a | b;
  else if (kind === "INC") {
    var s2 = a + 1;
    r = s2 & 255;
    cf = s2 > 255 ? 1 : 0;
  } else if (kind === "DEC") {
    var d2 = a - 1;
    r = d2 & 255;
    cf = d2 < 0 ? 1 : 0;
  }
  r = r & 255;
  if (kind !== "MOV") {
    zf = r === 0 ? 1 : 0;
    sf = (r & 0x80) ? 1 : 0;
    if (kind === "AND" || kind === "OR") cf = flags.cf ? 1 : 0;
  }
  return { r: r, zf: zf, cf: cf, sf: sf };
}

function simTextoDec(d) {
  var rd = simNombreReg(d.reg);
  var rs = simNombreReg(d.fuente);
  var dir = simHex(d.addr & 0x1FF, 3) + "H";
  var imm = simHex(d.imm & 255, 2) + "H";
  var n = d.nombre;
  if (n === "NOP" || n === "HLT") return n;
  if (n === "MOV_I") return "MOV " + rd + ", " + imm;
  if (n === "MOV_R") return "MOV " + rd + ", " + rs;
  if (n === "LD") return "LD " + rd + ", [" + dir + "]";
  if (n === "ST") return "ST [" + dir + "], " + rd;
  if (n === "ADD_I") return "ADD " + rd + ", " + imm;
  if (n === "ADD_R") return "ADD " + rd + ", " + rs;
  if (n === "SUB_I") return "SUB " + rd + ", " + imm;
  if (n === "SUB_R") return "SUB " + rd + ", " + rs;
  if (n === "AND_I") return "AND " + rd + ", " + imm;
  if (n === "AND_R") return "AND " + rd + ", " + rs;
  if (n === "OR_I") return "OR " + rd + ", " + imm;
  if (n === "OR_R") return "OR " + rd + ", " + rs;
  if (n === "CMP_I") return "CMP " + rd + ", " + imm;
  if (n === "CMP_R") return "CMP " + rd + ", " + rs;
  if (n === "INC") return "INC " + rd;
  if (n === "DEC") return "DEC " + rd;
  if (n === "JMP" || n === "JZ" || n === "JNZ" || n === "JC") return n + " " + dir;
  if (n === "IN") return "IN " + rd + ", [KBD]";
  if (n === "OUT") return "OUT [LCD], " + rd;
  return n;
}

function simAccesoOFallo(e, va, escritura, tipo, reanudar) {
  va = va & 0x1FF;
  if ((va >> 5) === 15 && tipo !== "IO") {
    e.error = "Acceso de CPU a la ventana de E/S (VPN 15). Use IN u OUT.";
    e.faseError = 1;
    return null;
  }
  var t = simTraducir(e, va);
  if (t.fallo) return simIniciarFallo(e, va, reanudar, escritura, tipo);
  e.ultimaVA = va;
  e.ultimaPA = t.pa;
  return t;
}

function simPasoF1(e) {
  simPoner(e, { En_PC: 1, Ld_MAR: 1 });
  if (!simEmitir(e, "dirInt", [{ nombre: "PC", valor: e.pc & 0x1FF }])) return "ERROR";
  simCargarBuf(e, "MAR");
  e.mar = e.pc & 0x1FF;
  e.evento = "F1 PC a MAR";
  return "F2";
}

function simLecturaCodigo(e, reanudar, siguiente) {
  var acc = simAccesoOFallo(e, e.mar, false, "I", reanudar);
  if (typeof acc === "string") return acc;
  if (!acc) return "ERROR";
  var byte = simCacheLeer(e, acc.pa, "I");
  simPoner(e, { Mem_R: 1, En_MAR: 1, Ld_MDR: 1, INC_PC: 1 });
  if (!simEmitir(e, "dirExt", [{ nombre: "MAR", valor: acc.pa }])) return "ERROR";
  if (!simEmitir(e, "datExt", [{ nombre: "RAM", valor: byte }])) return "ERROR";
  simCargarBuf(e, "MDR");
  e.mdr = byte & 255;
  e.pc = (e.pc + 1) & 0x1FF;
  simMarcarAcceso(e, acc.vpn, false);
  e.evento = reanudar + " " + e.cacheNota;
  return siguiente;
}

function simPasoF2(e) { return simLecturaCodigo(e, "F2", "F3"); }

function simPasoF3(e) {
  simPoner(e, { En_MDR: 1, Ld_IRH: 1 });
  if (!simEmitir(e, "datInt", [{ nombre: "MDR", valor: e.mdr & 255 }])) return "ERROR";
  simCargarBuf(e, "IR");
  e.ir = (e.mdr & 255) << 8;
  e.evento = "F3 MDR a IR_H";
  return "F4";
}

function simPasoF4(e) {
  simPoner(e, { En_PC: 1, Ld_MAR: 1 });
  if (!simEmitir(e, "dirInt", [{ nombre: "PC", valor: e.pc & 0x1FF }])) return "ERROR";
  simCargarBuf(e, "MAR");
  e.mar = e.pc & 0x1FF;
  e.evento = "F4 PC a MAR";
  return "F5";
}

function simPasoF5(e) { return simLecturaCodigo(e, "F5", "F6"); }

function simPasoF6(e) {
  simPoner(e, { En_MDR: 1, Ld_IRL: 1 });
  if (!simEmitir(e, "datInt", [{ nombre: "MDR", valor: e.mdr & 255 }])) return "ERROR";
  simCargarBuf(e, "IR");
  e.ir = (e.ir & 0xFF00) | (e.mdr & 255);
  e.evento = "F6 MDR a IR_L";
  return "DECODE";
}

function simConstruirDec(e) {
  var b0 = (Number(e.ir) >> 8) & 255;
  var op = b0 >> 3;
  var nombre = SIM_OPNOMBRE[op];
  if (!nombre) return null;
  var b1 = Number(e.ir) & 255;
  return {
    op: op, nombre: nombre,
    reg: (b0 >> 1) & 3,
    a8: b0 & 1,
    imm: b1,
    fuente: b1 & 3,
    addr: ((b0 & 1) << 8) | b1
  };
}

function simPasoDECODE(e) {
  var dec = simConstruirDec(e);
  if (!dec) {
    e.error = "Opcode desconocido";
    e.faseError = 1;
    return "ERROR";
  }
  e.dec = dec;
  e.textoIR = simTextoDec(e.dec);
  e.evento = "DECODE " + e.textoIR;
  e.sub = 1;
  return "EX";
}

function simExAlu(e) {
  var d = e.dec;
  var kind = d.nombre.indexOf("_") > 0 ? d.nombre.split("_")[0] : d.nombre;
  if (e.sub === 1) {
    var a = simLeerReg(e, d.reg);
    var b = 0;
    var fuente = null;
    if (kind === "INC") b = 1;
    else if (kind === "DEC") b = 1;
    else if (d.nombre.indexOf("_R") > 0) {
      b = simLeerReg(e, d.fuente);
      fuente = { nombre: simNombreReg(d.fuente), valor: b };
    } else {
      b = d.imm & 255;
      fuente = { nombre: "IR", valor: b };
    }
    simAluBits(e, SIM_ALU_COD[kind]);
    simPoner(e, { Ld_ALU: 1 });
    if (fuente) {
      if (fuente.nombre === "IR") simPoner(e, { En_IR: 1 });
      else e.senales["En_" + fuente.nombre] = 1;
      if (!simEmitir(e, "datInt", [fuente])) return "ERROR";
    }
    simCargarBuf(e, "ALU");
    var res = simAlu(kind, a, kind === "INC" || kind === "DEC" ? 0 : b, e);
    if (kind === "INC") res = simAlu("INC", a, 0, e);
    if (kind === "DEC") res = simAlu("DEC", a, 0, e);
    e.aluA = a;
    e.aluB = (kind === "INC" || kind === "DEC") ? 1 : b;
    e.aluOp = kind;
    e.aluR = res.r;
    e.zf = res.zf;
    e.cf = res.cf;
    e.sf = res.sf;
    e.evento = "ALU " + kind;
    if (kind === "CMP") return "F1";
    e.sub = 2;
    return "EX";
  }
  var dest = simNombreReg(d.reg);
  simPoner(e, { En_ALU: 1 });
  e.senales["Ld_" + dest] = 1;
  if (!simEmitir(e, "datInt", [{ nombre: "ALU", valor: e.aluR & 255 }])) return "ERROR";
  simCargarBuf(e, dest);
  simEscribirReg(e, d.reg, e.aluR);
  e.evento = "ALU a " + dest;
  return "F1";
}

function simExLD(e) {
  var d = e.dec;
  if (e.sub === 1) {
    simPoner(e, { En_IR: 1, Ld_MAR: 1 });
    if (!simEmitir(e, "dirInt", [{ nombre: "IR", valor: d.addr & 0x1FF }])) return "ERROR";
    simCargarBuf(e, "MAR");
    e.mar = d.addr & 0x1FF;
    e.evento = "LD direccion";
    e.sub = 2;
    return "EX";
  }
  if (e.sub === 2) {
    var acc = simAccesoOFallo(e, e.mar, false, "D", "EX");
    if (typeof acc === "string") return acc;
    if (!acc) return "ERROR";
    var byte = simCacheLeer(e, acc.pa, "D");
    simPoner(e, { Mem_R: 1, En_MAR: 1, Ld_MDR: 1 });
    if (!simEmitir(e, "dirExt", [{ nombre: "MAR", valor: acc.pa }])) return "ERROR";
    if (!simEmitir(e, "datExt", [{ nombre: "RAM", valor: byte }])) return "ERROR";
    simCargarBuf(e, "MDR");
    e.mdr = byte & 255;
    simMarcarAcceso(e, acc.vpn, false);
    e.evento = "LD dato " + e.cacheNota;
    e.sub = 3;
    return "EX";
  }
  var dest = simNombreReg(d.reg);
  simPoner(e, { En_MDR: 1 });
  e.senales["Ld_" + dest] = 1;
  if (!simEmitir(e, "datInt", [{ nombre: "MDR", valor: e.mdr & 255 }])) return "ERROR";
  simCargarBuf(e, dest);
  simEscribirReg(e, d.reg, e.mdr);
  e.evento = "LD " + dest;
  return "F1";
}

function simExST(e) {
  var d = e.dec;
  if (e.sub === 1) {
    simPoner(e, { En_IR: 1, Ld_MAR: 1 });
    if (!simEmitir(e, "dirInt", [{ nombre: "IR", valor: d.addr & 0x1FF }])) return "ERROR";
    simCargarBuf(e, "MAR");
    e.mar = d.addr & 0x1FF;
    e.evento = "ST direccion";
    e.sub = 2;
    return "EX";
  }
  if (e.sub === 2) {
    var valor = simLeerReg(e, d.reg);
    var nombre = simNombreReg(d.reg);
    e.senales["En_" + nombre] = 1;
    simPoner(e, { Ld_MDR: 1 });
    if (!simEmitir(e, "datInt", [{ nombre: nombre, valor: valor }])) return "ERROR";
    simCargarBuf(e, "MDR");
    e.mdr = valor & 255;
    e.evento = "ST " + nombre + " a MDR";
    e.sub = 3;
    return "EX";
  }
  var acc = simAccesoOFallo(e, e.mar, true, "D", "EX");
  if (typeof acc === "string") return acc;
  if (!acc) return "ERROR";
  simPoner(e, { Mem_W: 1, En_MAR: 1, En_MDR: 1 });
  if (!simEmitir(e, "dirExt", [{ nombre: "MAR", valor: acc.pa }])) return "ERROR";
  if (!simEmitir(e, "datExt", [{ nombre: "MDR", valor: e.mdr & 255 }])) return "ERROR";
  simCacheEscribir(e, acc.pa, e.mdr);
  simMarcarAcceso(e, acc.vpn, true);
  e.evento = "ST RAM " + e.cacheNota;
  return "F1";
}

function simExSalto(e) {
  var d = e.dec;
  var toma = d.nombre === "JMP" ||
    (d.nombre === "JZ" && e.zf === 1) ||
    (d.nombre === "JNZ" && e.zf === 0) ||
    (d.nombre === "JC" && e.cf === 1);
  if (!toma) {
    e.evento = d.nombre + " no tomado";
    return "F1";
  }
  if ((d.addr & 0x1FF) >= 0x1E0) {
    e.error = "Salto dentro de la ventana de E/S.";
    e.faseError = 1;
    return "ERROR";
  }
  simPoner(e, { En_IR: 1, Ld_PC: 1 });
  if (!simEmitir(e, "dirInt", [{ nombre: "IR", valor: d.addr & 0x1FF }])) return "ERROR";
  simCargarBuf(e, "PC");
  e.pc = d.addr & 0x1FF;
  e.evento = d.nombre + " tomado";
  return "F1";
}

function simExIN(e) {
  var d = e.dec;
  if (e.sub === 1) {
    var va = 0x1F0 + (e.kbdHead & 7);
    simPoner(e, { Ld_MAR: 1, IO: 1 });
    if (!simEmitir(e, "dirInt", [{ nombre: "KBD", valor: va }])) return "ERROR";
    simCargarBuf(e, "MAR");
    e.mar = va;
    e.evento = "IN puntero de cola";
    e.sub = 2;
    return "EX";
  }
  var vacia = e.kbdCount <= 0;
  var pa = 0xF0 + (e.kbdHead & 7);
  var byte = vacia ? 0 : (e.ram[pa] & 255);
  var dest = simNombreReg(d.reg);
  e.ultimaVA = e.mar & 0x1FF;
  e.ultimaPA = pa;
  e.cacheNota = "BYPASS";
  simPoner(e, { IO: 1, Mem_R: 1, En_KBD: 1, En_MAR: 1 });
  e.senales["Ld_" + dest] = 1;
  simPoner(e, { Ld_MDR: 1 });
  if (!simEmitir(e, "dirExt", [{ nombre: "MAR", valor: pa }])) return "ERROR";
  if (!simEmitir(e, "datExt", [{ nombre: "KBD", valor: byte }])) return "ERROR";
  if (!simEmitir(e, "datInt", [{ nombre: "KBD", valor: byte }])) return "ERROR";
  if (!vacia) {
    e.ram[pa] = 0;
    e.kbdHead = (e.kbdHead + 1) & 7;
    e.kbdCount--;
  }
  simCargarBuf(e, dest);
  simCargarBuf(e, "MDR");
  e.mdr = byte & 255;
  simEscribirReg(e, d.reg, byte);
  simMarcarAcceso(e, 15, false);
  e.evento = vacia ? "IN cola vacia 00H" : "IN " + dest;
  return "F1";
}

function simExOUT(e) {
  var d = e.dec;
  if (e.sub === 1) {
    var valor = simLeerReg(e, d.reg);
    var nombre = simNombreReg(d.reg);
    e.senales["En_" + nombre] = 1;
    simPoner(e, { Ld_MDR: 1 });
    if (!simEmitir(e, "datInt", [{ nombre: nombre, valor: valor }])) return "ERROR";
    simCargarBuf(e, "MDR");
    e.mdr = valor & 255;
    e.evento = "OUT " + nombre + " a MDR";
    e.sub = 2;
    return "EX";
  }
  if (e.lcdCursor >= 8) {
    e.evento = "LCD llena";
    e.banner = "LCD llena";
    return "F1";
  }
  var va = 0x1F8 + e.lcdCursor;
  var pa = 0xF8 + e.lcdCursor;
  e.ultimaVA = va;
  e.ultimaPA = pa;
  e.cacheNota = "BYPASS";
  simPoner(e, { IO: 1, Mem_W: 1, En_MDR: 1, En_MAR: 1, Ld_LCD: 1, Ld_MAR: 1 });
  if (!simEmitir(e, "dirInt", [{ nombre: "LCD", valor: va }])) return "ERROR";
  if (!simEmitir(e, "dirExt", [{ nombre: "MAR", valor: pa }])) return "ERROR";
  if (!simEmitir(e, "datExt", [{ nombre: "MDR", valor: e.mdr & 255 }])) return "ERROR";
  e.ram[pa] = e.mdr & 255;
  e.lcdCursor++;
  simCargarBuf(e, "MAR");
  simCargarBuf(e, "LCD");
  e.mar = va;
  simMarcarAcceso(e, 15, false);
  e.evento = "OUT LCD";
  return "F1";
}

function simPasoEX(e) {
  if (!e.dec || !e.dec.nombre) e.dec = simConstruirDec(e);
  var n = e.dec ? e.dec.nombre : "";
  if (n === "NOP") { e.evento = "NOP"; return "F1"; }
  if (n === "HLT") { e.evento = "HLT"; return "HALT"; }
  if (n === "LD") return simExLD(e);
  if (n === "ST") return simExST(e);
  if (n === "JMP" || n === "JZ" || n === "JNZ" || n === "JC") return simExSalto(e);
  if (n === "IN") return simExIN(e);
  if (n === "OUT") return simExOUT(e);
  return simExAlu(e);
}

function simAnotar(e, etiqueta) {
  var fila = [
    e.trace.length + 1, etiqueta, e.pc, e.ir, e.mar, e.mdr,
    e.ax, e.bx, e.cx, e.dx, e.zf, e.cf, e.sf, e.palabra,
    e.ultimaVA, e.ultimaPA,
    String(etiqueta).indexOf("PF") === 0 ? "Si" : "No",
    e.cacheNota, e.evento
  ];
  e.trace.push(fila);
  if (e.trace.length > SIM_TRAZA_MAX) e.trace.shift();
}

function simFaseTras_(hecha, e) {
  if (hecha === "F1") return "F2";
  if (hecha === "F2") return "F3";
  if (hecha === "F3") return "F4";
  if (hecha === "F4") return "F5";
  if (hecha === "F5") return "F6";
  if (hecha === "F6") return "DECODE";
  if (hecha === "DECODE") return "EX";
  if (hecha === "PF2") return "PF3";
  if (hecha === "PF3") return "PF4";
  if (hecha === "PF1") {
    if (!e.pf || typeof e.pf.vpn !== "number" || typeof e.pf.dirty === "undefined") return "";
    return e.pf.dirty ? "PF2" : "PF3";
  }
  if (hecha === "PF4") {
    if (e.reanudar === "F2" || e.reanudar === "F5" || e.reanudar === "EX") return e.reanudar;
  }
  return "";
}

function simRecuperarFasePausa_(e) {
  if (e.fase !== "STOP") return { ok: true, fase: e.fase };
  var i = e.trace.length - 1;
  var hecha = "";
  while (i >= 0) {
    var et = String(e.trace[i][1] || "");
    if (et !== "STOP" && et !== "PAUSA") { hecha = et; break; }
    i--;
  }
  var siguiente = simFaseTras_(hecha, e);
  if (!siguiente) {
    return {
      ok: false,
      error: "Pausa antigua sin microfase recuperable. Última completada: " + (hecha || "ninguna") + ". El CPU no se modificó. Cargar de cero solo si quiere reiniciar la prueba."
    };
  }
  e.fase = siguiente;
  e.evento = "Reanuda en " + siguiente;
  return { ok: true, fase: siguiente };
}

function simMicroPaso(e) {
  if (e.fase === "HALT" || e.fase === "ERROR") return e;
  if (e.fase === "STOP") {
    var rec = simRecuperarFasePausa_(e);
    if (!rec.ok) {
      e.evento = rec.error;
      return e;
    }
  }
  simPrepararPaso(e);
  var etiqueta = e.fase;
  var fn = null;
  if (etiqueta === "F1") fn = simPasoF1;
  else if (etiqueta === "F2") fn = simPasoF2;
  else if (etiqueta === "F3") fn = simPasoF3;
  else if (etiqueta === "F4") fn = simPasoF4;
  else if (etiqueta === "F5") fn = simPasoF5;
  else if (etiqueta === "F6") fn = simPasoF6;
  else if (etiqueta === "DECODE") fn = simPasoDECODE;
  else if (etiqueta === "EX") fn = simPasoEX;
  else if (etiqueta === "PF2") fn = simPasoPF2;
  else if (etiqueta === "PF3") fn = simPasoPF3;
  else if (etiqueta === "PF4") fn = simPasoPF4;
  if (!fn) {
    e.error = "Fase desconocida " + etiqueta;
    e.fase = "ERROR";
    simPulso(e);
    simAnotar(e, etiqueta);
    simRegistrarVista_(e, etiqueta);
    return e;
  }
  var siguiente = fn(e);
  if (e.faseError || siguiente === "ERROR") {
    e.fase = "ERROR";
    if (!e.evento) e.evento = e.error;
    simPulso(e);
    simAnotar(e, e.reclasificar || etiqueta);
    simRegistrarVista_(e, e.reclasificar || etiqueta);
    return e;
  }
  simPulso(e);
  simAnotar(e, e.reclasificar || etiqueta);
  simRegistrarVista_(e, e.reclasificar || etiqueta);
  e.fase = siguiente;
  e.pasos++;
  return e;
}

function simCorrer(e, opts) {
  opts = opts || {};
  var maxP = typeof opts.maxPasos === "number" ? opts.maxPasos : 400;
  var maxMs = typeof opts.maxMs === "number" ? opts.maxMs : 20000;
  var ahora = opts.ahora || function () { return 0; };
  var t0 = ahora();
  var n = 0;
  while (n < maxP) {
    if (ahora() - t0 >= maxMs) {
      e.evento = "TOPE_TIEMPO";
      break;
    }
    if (e.stop && e.fase !== "STOP") break;
    if (e.fase === "HALT" || e.fase === "ERROR") break;
    simMicroPaso(e);
    n++;
    if (opts.cada) opts.cada(e, n);
    if (e.fase === "HALT" || e.fase === "ERROR" || e.fase === "STOP") break;
  }
  e.corridos = n;
  if (n >= maxP && e.fase !== "HALT" && e.fase !== "ERROR" && e.fase !== "STOP") {
    if (!e.evento) e.evento = "TOPE_PASOS";
  }
  return e;
}

function simReset(e) {
  var swap = e.swap.slice();
  var programa = e.programa;
  var politica = e.politica || "FIFO";
  var nuevo = simEstadoInicial();
  nuevo.swap = swap;
  nuevo.programa = programa;
  nuevo.politica = politica;
  simReemplazarEstado(e, nuevo);
  return e;
}

function simContencion(e) {
  var antes = e.mdr;
  simPrepararPaso(e);
  var ok = simEmitir(e, "datInt", [
    { nombre: "AX", valor: 1 },
    { nombre: "BX", valor: 2 }
  ]);
  if (!ok) e.mdr = antes;
  return { ok: ok, mdr: e.mdr, error: e.error };
}
