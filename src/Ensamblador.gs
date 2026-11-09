// Ensamblador.gs — una sola copia del catálogo, ISA fija de 2 bytes.
// Byte 0 = opcode[4:0] en bits 7:3, registro en bits 2:1, A8 en bit 0.
// Byte 1 = inmediato, dirección baja o registro fuente.
// LD, ST, saltos y DB rechazan la VPN 15 (1E0H-1FFH).

var SIM_OPCOD = {
  NOP: 0, HLT: 1, MOV_I: 2, MOV_R: 3, LD: 4, ST: 5,
  ADD_I: 6, ADD_R: 7, SUB_I: 8, SUB_R: 9, AND_I: 10, AND_R: 11,
  OR_I: 12, OR_R: 13, CMP_I: 14, CMP_R: 15, INC: 16, DEC: 17,
  JMP: 18, JZ: 19, JNZ: 20, JC: 21, IN: 22, OUT: 23
};

function simEmpaquetar(op, reg, a8, b1) {
  var b0 = ((op & 31) << 3) | ((reg & 3) << 1) | (a8 & 1);
  return [b0 & 255, b1 & 255];
}

function simParseNumero(texto) {
  var t = String(texto || "").trim().toUpperCase();
  if (!t) return NaN;
  if (t === "AX" || t === "BX" || t === "CX" || t === "DX" || t === "KBD" || t === "LCD") return NaN;
  if (/^[0-9A-F]+H$/.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^[01]+B$/.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/^0X[0-9A-F]+$/.test(t)) return parseInt(t.slice(2), 16);
  if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
  return NaN;
}

function simParseLinea(raw) {
  var texto = String(raw === null || typeof raw === "undefined" ? "" : raw);
  var corte = texto.split(";")[0].split("//")[0].trim();
  if (!corte) return { vacia: 1, etiqueta: "", mnemonico: "", resto: "" };
  var etiqueta = "";
  var m = corte.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
  if (m) {
    etiqueta = m[1].toUpperCase();
    corte = (m[2] || "").trim();
  }
  if (!corte) return { vacia: 0, etiqueta: etiqueta, mnemonico: "", resto: "" };
  var partes = corte.split(/\s+/);
  var mn = (partes[0] || "").toUpperCase();
  var resto = corte.substring(partes[0].length).trim();
  return { vacia: 0, etiqueta: etiqueta, mnemonico: mn, resto: resto };
}

function simPartirOperandos(resto) {
  if (!resto) return [];
  if (resto.indexOf(",") < 0) return [resto.trim()];
  var trozos = resto.split(",");
  var out = [];
  var i;
  for (i = 0; i < trozos.length; i++) {
    var t = trozos[i].trim();
    if (t) out.push(t);
  }
  return out;
}

function simLimpiarToken(tok) {
  return String(tok || "").replace(/[\[\]]/g, "").trim().toUpperCase();
}

function simCatalogo() {
  return [
    {
      id: "P1",
      nombre: "Aritmetica AX BX CX DX",
      lineas: [
        "; P1. AX = BX * CX por sumas. DX conserva BX.",
        "MOV AX, 00H",
        "MOV BX, 04H",
        "MOV CX, 03H",
        "MOV DX, BX",
        "loop:",
        "ADD AX, DX",
        "DEC CX",
        "JNZ loop",
        "HLT"
      ]
    },
    {
      id: "P2",
      nombre: "Eco teclado LCD",
      lineas: [
        "; P2. Ocho IN/OUT con la memoria virtual encendida.",
        "; La cola vacia entrega 00H y no mueve la cabeza.",
        "MOV CX, 08H",
        "echo:",
        "IN AX, [KBD]",
        "OUT [LCD], AX",
        "DEC CX",
        "JNZ echo",
        "HLT"
      ]
    },
    {
      id: "P3",
      nombre: "Accesos dispersos",
      lineas: [
        "; P3. Nueve paginas distintas sin usar la VPN 15.",
        "; Riesgo R1: el marco 7 esta reservado para E/S.",
        "; Solo 7 marcos son paginables. FIFO puede desalojar el codigo.",
        "; No se afirma la nota plena de G3/G4 sin el docente.",
        "LD AX, [40H]",
        "LD BX, [A0H]",
        "ADD AX, BX",
        "ST [120H], AX",
        "ST [1C0H], BX",
        "LD CX, [60H]",
        "ST [E0H], CX",
        "LD DX, [160H]",
        "ST [180H], DX",
        "LD AX, [80H]",
        "HLT",
        "ORG 40H",
        "DB 01H",
        "ORG 60H",
        "DB 03H",
        "ORG 80H",
        "DB 0AH",
        "ORG A0H",
        "DB 02H",
        "ORG E0H",
        "DB 05H",
        "ORG 120H",
        "DB 06H",
        "ORG 160H",
        "DB 04H",
        "ORG 180H",
        "DB 09H",
        "ORG 1C0H",
        "DB 07H"
      ]
    }
  ];
}

function simBuscarPrograma(id) {
  var cat = simCatalogo();
  var i;
  var clave = String(id || "").trim().toUpperCase();
  for (i = 0; i < cat.length; i++) {
    if (cat[i].id === clave || cat[i].nombre.toUpperCase() === clave) return cat[i];
  }
  return null;
}

function simResolverNumero(token, simbolos, linea, errores, permitirPendiente) {
  var limpio = simLimpiarToken(token);
  var n = simParseNumero(limpio);
  if (!isNaN(n)) return n;
  if (/^[A-Z_][A-Z0-9_]*$/.test(limpio)) {
    if (simbolos && Object.prototype.hasOwnProperty.call(simbolos, limpio)) return simbolos[limpio];
    if (permitirPendiente) return 0;
    errores.push("Linea " + linea + ": etiqueta indefinida " + limpio);
    return 0;
  }
  errores.push("Linea " + linea + ": operando invalido " + token);
  return 0;
}

function simVentanaES(dir, linea, errores) {
  if ((dir & 0x1FF) >= 0x1E0) {
    errores.push("Linea " + linea + ": la VPN 15 (1E0H-1FFH) es E/S. Use IN u OUT.");
    return true;
  }
  return false;
}

function simEmitirInstr(mn, ops, simbolos, linea, errores, pendiente) {
  var reg = 0;
  var a8 = 0;
  var b1 = 0;
  var op = -1;
  function regDe(tok) {
    var i = simIndiceReg(simLimpiarToken(tok));
    if (i < 0) errores.push("Linea " + linea + ": se esperaba AX, BX, CX o DX");
    return i < 0 ? 0 : i;
  }
  if (mn === "NOP" || mn === "HLT") {
    op = SIM_OPCOD[mn];
  } else if (mn === "INC" || mn === "DEC") {
    if (ops.length !== 1) errores.push("Linea " + linea + ": " + mn + " pide un registro");
    reg = regDe(ops[0] || "");
    op = SIM_OPCOD[mn];
  } else if (mn === "JMP" || mn === "JZ" || mn === "JNZ" || mn === "JC") {
    if (ops.length !== 1) errores.push("Linea " + linea + ": " + mn + " pide una direccion");
    var dirJ = simResolverNumero(ops[0] || "0", simbolos, linea, errores, pendiente) & 0x1FF;
    simVentanaES(dirJ, linea, errores);
    reg = 0;
    a8 = (dirJ >> 8) & 1;
    b1 = dirJ & 255;
    op = SIM_OPCOD[mn];
  } else if (mn === "IN") {
    if (ops.length !== 2 || simLimpiarToken(ops[1]) !== "KBD") {
      errores.push("Linea " + linea + ": la forma es IN reg, [KBD]");
    }
    reg = regDe(ops[0] || "");
    op = SIM_OPCOD.IN;
  } else if (mn === "OUT") {
    if (ops.length !== 2 || simLimpiarToken(ops[0]) !== "LCD") {
      errores.push("Linea " + linea + ": la forma es OUT [LCD], reg");
    }
    reg = regDe(ops[1] || "");
    op = SIM_OPCOD.OUT;
  } else if (mn === "LD") {
    if (ops.length !== 2) errores.push("Linea " + linea + ": LD reg, [dir]");
    reg = regDe(ops[0] || "");
    var dirL = simResolverNumero(ops[1] || "0", simbolos, linea, errores, pendiente) & 0x1FF;
    simVentanaES(dirL, linea, errores);
    a8 = (dirL >> 8) & 1;
    b1 = dirL & 255;
    op = SIM_OPCOD.LD;
  } else if (mn === "ST") {
    if (ops.length !== 2) errores.push("Linea " + linea + ": ST [dir], reg");
    reg = regDe(ops[1] || "");
    var dirS = simResolverNumero(ops[0] || "0", simbolos, linea, errores, pendiente) & 0x1FF;
    simVentanaES(dirS, linea, errores);
    a8 = (dirS >> 8) & 1;
    b1 = dirS & 255;
    op = SIM_OPCOD.ST;
  } else if (mn === "MOV" || mn === "ADD" || mn === "SUB" || mn === "AND" || mn === "OR" || mn === "CMP") {
    if (ops.length !== 2) errores.push("Linea " + linea + ": " + mn + " pide destino y origen");
    reg = regDe(ops[0] || "");
    var origen = simLimpiarToken(ops[1] || "");
    if (simIndiceReg(origen) >= 0) {
      b1 = simIndiceReg(origen);
      op = SIM_OPCOD[mn + "_R"];
    } else {
      var imm = simResolverNumero(ops[1] || "0", simbolos, linea, errores, pendiente);
      if (imm < 0 || imm > 255) errores.push("Linea " + linea + ": inmediato fuera de 00H-FFH");
      b1 = imm & 255;
      op = SIM_OPCOD[mn + "_I"];
    }
  } else if (mn) {
    errores.push("Linea " + linea + ": mnemonico desconocido " + mn);
    return null;
  } else return null;
  if (op < 0) return null;
  return simEmpaquetar(op, reg, a8, b1);
}

function simEnsamblar(texto) {
  var lineas = String(texto || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var errores = [];
  var simbolos = {};
  var pc = 0;
  var i;
  for (i = 0; i < lineas.length; i++) {
    var p = simParseLinea(lineas[i]);
    var nro = i + 1;
    if (p.etiqueta) {
      if (Object.prototype.hasOwnProperty.call(simbolos, p.etiqueta)) errores.push("Linea " + nro + ": etiqueta repetida");
      else simbolos[p.etiqueta] = pc;
    }
    if (p.vacia || !p.mnemonico) continue;
    if (p.mnemonico === "ORG") {
      var dest = simParseNumero(simLimpiarToken(simPartirOperandos(p.resto)[0] || ""));
      if (isNaN(dest) || dest < 0 || dest > 0x1FF) errores.push("Linea " + nro + ": ORG invalido");
      else pc = dest & 0x1FF;
      continue;
    }
    if (p.mnemonico === "DB") {
      var bytes = simEmitirDb(p.resto, nro, errores);
      pc = (pc + bytes.length) & 0x3FF;
      if (pc > 0x1FF) errores.push("Linea " + nro + ": el programa pasa de 1FFH");
      continue;
    }
    pc = (pc + 2) & 0x3FF;
    if (pc > 0x1FF && pc !== 0) errores.push("Linea " + nro + ": instruccion fuera del espacio virtual");
  }
  var imagen = simCeros(512);
  var listado = [];
  pc = 0;
  for (i = 0; i < lineas.length; i++) {
    var q = simParseLinea(lineas[i]);
    var num = i + 1;
    if (q.vacia || !q.mnemonico) continue;
    if (q.mnemonico === "ORG") {
      pc = simParseNumero(simLimpiarToken(simPartirOperandos(q.resto)[0] || "")) & 0x1FF;
      continue;
    }
    if (q.mnemonico === "DB") {
      var datos = simEmitirDb(q.resto, num, errores);
      var k;
      for (k = 0; k < datos.length; k++) {
        if (pc >= 0x1E0 && pc <= 0x1FF) errores.push("Linea " + num + ": DB dentro de la VPN 15");
        if (pc <= 0x1FF) imagen[pc] = datos[k] & 255;
        listado.push({ linea: num, va: pc, bytes: [datos[k] & 255], texto: lineas[i].trim() });
        pc++;
      }
      continue;
    }
    var ops = simPartirOperandos(q.resto);
    var antes = errores.length;
    var par = simEmitirInstr(q.mnemonico, ops, simbolos, num, errores, false);
    if (par && pc <= 0x1FE) {
      imagen[pc] = par[0];
      imagen[pc + 1] = par[1];
      listado.push({ linea: num, va: pc, bytes: par.slice(), texto: lineas[i].trim() });
    } else if (errores.length === antes) {
      errores.push("Linea " + num + ": no cabe la instruccion");
    }
    pc += 2;
  }
  var vistos = {};
  var unicos = [];
  for (i = 0; i < errores.length; i++) {
    if (!vistos[errores[i]]) { vistos[errores[i]] = 1; unicos.push(errores[i]); }
  }
  return { ok: unicos.length === 0, errores: unicos, imagen: imagen, listado: listado, simbolos: simbolos };
}

function simEmitirDb(resto, linea, errores) {
  var partes = String(resto || "").split(",");
  var out = [];
  var i;
  if (!resto || !String(resto).trim()) {
    errores.push("Linea " + linea + ": DB vacio");
    return out;
  }
  for (i = 0; i < partes.length; i++) {
    var n = simParseNumero(simLimpiarToken(partes[i]));
    if (isNaN(n) || n < 0 || n > 255) errores.push("Linea " + linea + ": byte DB invalido");
    else out.push(n & 255);
  }
  return out;
}

function simCargarTexto(e, texto, nombre) {
  var asm = simEnsamblar(texto);
  if (!asm.ok) return { ok: false, errores: asm.errores, listado: asm.listado };
  var nuevo = simEstadoInicial();
  nuevo.politica = e.politica || "FIFO";
  nuevo.programa = nombre || "";
  var i;
  for (i = 0; i < 512; i++) nuevo.swap[i] = asm.imagen[i] & 255;
  for (i = 0; i < asm.listado.length; i++) {
    if (asm.listado[i].bytes && asm.listado[i].bytes.length === 2) {
      nuevo.pc = asm.listado[i].va & 0x1FF;
      break;
    }
  }
  simReemplazarEstado(e, nuevo);
  return { ok: true, errores: [], listado: asm.listado, programa: e.programa };
}

function simCargarCatalogo(e, id) {
  var prog = simBuscarPrograma(id);
  if (!prog) return { ok: false, errores: ["Programa desconocido"], listado: [] };
  return simCargarTexto(e, prog.lineas.join("\n"), prog.id);
}
