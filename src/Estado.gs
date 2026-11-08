// Estado.gs — única fuente de verdad del simulador simplificado.
// Hoja _ESTADO. Sin segunda copia de RAM, tabla o caché.
// Este archivo no abre hojas. Las guardas de identidad viven aquí
// para que Main las aplique antes de cualquier escritura.

var SIM_HOJA_COPIA = "1CKb2nxVO2tstUjwY1s5clJ1ME9Di0lNIpk8voLzeS20";
var SIM_SCRIPT_COPIA = "1yTRwU6iB3LEfVmbfgtJ4zxun26nDwDUNQB5t3nJ_WPCnoJQD6WwEQvzD";
var SIM_HOJA_ORIGINAL = "1RnR5stD-B3N6SorOEXixn78WR9USc9oh7loojdVo1MI";
var SIM_SCRIPT_ORIGINAL = "14Z9zSg63sOpY7e9bKD3cAHff-_WMHwkqPyQpdqSdh2pGYiVscZlmhNvP";
var SIM_MAGIA = "SIM-ESTADO-v1";
var SIM_TRAZA_MAX = 200;
var SIM_RUN_PASOS = 120;
var SIM_RUN_MS = 25000;

var SIM_ESCALARES = [
  "pc", "mar", "mdr", "ir", "ax", "bx", "cx", "dx", "zf", "cf", "sf",
  "fase", "sub", "evento", "error", "stop", "programa", "politica",
  "relojFifo", "relojUso", "kbdHead", "kbdTail", "kbdCount", "lcdCursor",
  "fallos", "writebacks", "palabra", "banner", "textoIR",
  "aluA", "aluB", "aluOp", "aluR",
  "l1iH", "l1iM", "l1dRH", "l1dRM", "l1dWH", "l1dWM", "l2H", "l2M", "mant",
  "emDirI", "valDirI", "emDatI", "valDatI", "emDirE", "valDirE", "emDatE", "valDatE",
  "rd", "wr", "ck", "io", "bits", "pasos", "continuacion"
];

var SIM_FILA_ESC = 3;
var SIM_FILA_VISTA = 60;
var SIM_FILA_BITS = 78;
var SIM_FILA_RAM = 80;
var SIM_FILA_SWAP = 100;
var SIM_FILA_PAG = 120;
var SIM_FILA_CACHE = 140;
var SIM_FILA_TRAZA = 150;
var SIM_FILA_LOG = 360;

var SIM_SENALES = [
  "En_PC", "Ld_MAR", "Mem_R", "Mem_W", "Ld_MDR", "En_MDR", "Ld_IRH", "Ld_IRL",
  "En_ALU", "Ld_ALU", "Ld_AX", "En_AX", "Ld_BX", "En_BX", "Ld_CX", "En_CX",
  "Ld_DX", "En_DX", "Ld_PC", "En_IR", "En_MAR", "INC_PC", "IO", "En_KBD", "Ld_LCD",
  "ALU2", "ALU1", "ALU0"
];

var SIM_REGS = ["AX", "BX", "CX", "DX"];

function simCeros(n) {
  var a = [];
  var i;
  for (i = 0; i < n; i++) a.push(0);
  return a;
}

function simLineaCache() {
  return { v: 0, tag: 0, base: -1, b: simCeros(8) };
}

function simExigirIds(hojaId, scriptId) {
  var hoja = String(hojaId || "");
  var script = String(scriptId || "");
  if (hoja === SIM_HOJA_ORIGINAL || script === SIM_SCRIPT_ORIGINAL) {
    throw new Error("ID original prohibido. No se escribió nada.");
  }
  if (!hoja || !script) {
    throw new Error("Falta la hoja o el proyecto activo. No se escribió nada.");
  }
  return true;
}

function simEstadoInicial() {
  var paginas = [];
  var i;
  for (i = 0; i < 16; i++) {
    paginas.push({ p: 0, pfn: -1, dirty: 0, ref: 0, orden: 0, uso: 0, fija: 0 });
  }
  paginas[15] = { p: 1, pfn: 7, dirty: 0, ref: 0, orden: 0, uso: 0, fija: 1 };
  return {
    pc: 0, mar: 0, mdr: 0, ir: 0,
    ax: 0, bx: 0, cx: 0, dx: 0,
    zf: 0, cf: 0, sf: 0,
    fase: "F1", sub: 1,
    evento: "", error: "", stop: 0,
    programa: "", politica: "FIFO",
    relojFifo: 0, relojUso: 0,
    kbdHead: 0, kbdTail: 0, kbdCount: 0, lcdCursor: 0,
    fallos: 0, writebacks: 0,
    palabra: "0000000H",
    banner: "", textoIR: "",
    aluA: 0, aluB: 0, aluOp: "", aluR: 0,
    cont: { l1iH: 0, l1iM: 0, l1dRH: 0, l1dRM: 0, l1dWH: 0, l1dWM: 0, l2H: 0, l2M: 0, mant: 0 },
    bits: "0000000000000000000000000000",
    buses: {
      dirInt: { emisor: "", valor: "" },
      datInt: { emisor: "", valor: "" },
      dirExt: { emisor: "", valor: "" },
      datExt: { emisor: "", valor: "" },
      rd: 0, wr: 0, ck: 0, io: 0
    },
    ram: simCeros(256),
    swap: simCeros(512),
    paginas: paginas,
    l1i: simLineaCache(),
    l1d: simLineaCache(),
    l2: [simLineaCache(), simLineaCache(), simLineaCache(), simLineaCache()],
    trace: [],
    registroFallos: [],
    senales: {},
    buffers: {},
    dec: null,
    reanudar: "F1",
    pf: null,
    cacheNota: "",
    visSeq: 0,
    visGen: 0,
    recs: [],
    ultimaVA: "",
    ultimaPA: "",
    pasos: 0,
    reclasificar: "",
    faseError: 0
  };
}

function simReemplazarEstado(dst, src) {
  var k;
  for (k in dst) {
    if (Object.prototype.hasOwnProperty.call(dst, k)) delete dst[k];
  }
  for (k in src) {
    if (Object.prototype.hasOwnProperty.call(src, k)) dst[k] = src[k];
  }
  return dst;
}

function simNombreReg(i) {
  return SIM_REGS[i & 3];
}

function simIndiceReg(nombre) {
  var n = String(nombre || "").toUpperCase();
  var i;
  for (i = 0; i < 4; i++) if (SIM_REGS[i] === n) return i;
  return -1;
}

function simLeerReg(e, i) {
  if (i === 0) return e.ax & 255;
  if (i === 1) return e.bx & 255;
  if (i === 2) return e.cx & 255;
  return e.dx & 255;
}

function simEscribirReg(e, i, v) {
  v = v & 255;
  if (i === 0) e.ax = v;
  else if (i === 1) e.bx = v;
  else if (i === 2) e.cx = v;
  else e.dx = v;
}

function simHex(n, ancho) {
  var h = (Number(n) >>> 0).toString(16).toUpperCase();
  while (h.length < ancho) h = "0" + h;
  return h;
}

function simBin(n, bits) {
  var v = Number(n) || 0;
  var s = (v & ((1 << bits) - 1)).toString(2);
  while (s.length < bits) s = "0" + s;
  return s;
}

function simTextoBus(bus, ancho) {
  if (!bus || !bus.emisor) return "ZZ";
  var n = Number(bus.valor);
  if (isNaN(n)) return "ZZ";
  return simHex(n, ancho) + "H";
}

function simTextoTasa(hits, misses) {
  var t = simTasa(hits, misses);
  return t === null ? "—" : String(t);
}

function simVistaFilas(e) {
  var lcd = "";
  var i;
  for (i = 0; i < 8; i++) lcd += simGlifo(e.ram[0xF8 + i]);
  return [
    ["pcHex", simHex(e.pc, 3) + "H"],
    ["marHex", simHex(e.mar, 3) + "H"],
    ["mdrHex", simHex(e.mdr, 2) + "H"],
    ["irHex", simHex(e.ir, 4)],
    ["axHex", simHex(e.ax, 2) + "H"],
    ["bxHex", simHex(e.bx, 2) + "H"],
    ["cxHex", simHex(e.cx, 2) + "H"],
    ["dxHex", simHex(e.dx, 2) + "H"],
    ["pcBin", simBin(e.pc, 9)],
    ["marBin", simBin(e.mar, 9)],
    ["mdrBin", simBin(e.mdr, 8)],
    ["irBin", simBin((e.ir >> 8) & 255, 8) + simBin(e.ir & 255, 8)],
    ["axBin", simBin(e.ax, 8)],
    ["bxBin", simBin(e.bx, 8)],
    ["cxBin", simBin(e.cx, 8)],
    ["dxBin", simBin(e.dx, 8)],
    ["dirI", simTextoBus(e.buses.dirInt, 3)],
    ["datI", simTextoBus(e.buses.datInt, 2)],
    ["dirE", simTextoBus(e.buses.dirExt, 2)],
    ["datE", simTextoBus(e.buses.datExt, 2)],
    ["l1iTasa", simTextoTasa(e.cont.l1iH, e.cont.l1iM)],
    ["l1dRTasa", simTextoTasa(e.cont.l1dRH, e.cont.l1dRM)],
    ["l1dWTasa", simTextoTasa(e.cont.l1dWH, e.cont.l1dWM)],
    ["l1dTasa", simTextoTasa(e.cont.l1dRH + e.cont.l1dWH, e.cont.l1dRM + e.cont.l1dWM)],
    ["l1dHits", String(e.cont.l1dRH + e.cont.l1dWH)],
    ["l1dMiss", String(e.cont.l1dRM + e.cont.l1dWM)],
    ["l2Tasa", simTextoTasa(e.cont.l2H, e.cont.l2M)],
    ["lcdTexto", lcd],
    ["flagsTxt", String(e.zf) + " " + String(e.cf) + " " + String(e.sf)],
    ["aluTxt", String(e.aluA) + " " + String(e.aluOp) + " " + String(e.aluR)]
  ];
}

function simCeldaVista(nombre) {
  var filas = [
    "pcHex", "marHex", "mdrHex", "irHex", "axHex", "bxHex", "cxHex", "dxHex",
    "pcBin", "marBin", "mdrBin", "irBin", "axBin", "bxBin", "cxBin", "dxBin",
    "dirI", "datI", "dirE", "datE", "l1iTasa", "l1dRTasa", "l1dWTasa", "l1dTasa",
    "l1dHits", "l1dMiss", "l2Tasa", "lcdTexto", "flagsTxt", "aluTxt"
  ];
  var i;
  for (i = 0; i < filas.length; i++) if (filas[i] === nombre) break;
  if (i === filas.length) return "A1";
  var col = i < 16 ? 6 : 8;
  var row = SIM_FILA_VISTA + (i < 16 ? i : i - 16);
  return simColumnaVista_(col) + row;
}

function simColumnaVista_(n) {
  var s = "";
  var x = n;
  while (x > 0) {
    var r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function simTasa(hits, misses) {
  var t = hits + misses;
  if (!t) return null;
  return Math.round((1000 * hits) / t) / 10;
}

function simSenalesVacias() {
  var s = {};
  var i;
  for (i = 0; i < SIM_SENALES.length; i++) s[SIM_SENALES[i]] = 0;
  return s;
}

function simPalabraHex(senales) {
  var n = 0;
  var i;
  for (i = 0; i < SIM_SENALES.length; i++) {
    n = (n * 2) + (senales[SIM_SENALES[i]] ? 1 : 0);
  }
  return simHex(n, 7) + "H";
}

function simBitsTexto(senales) {
  var t = "";
  var i;
  for (i = 0; i < SIM_SENALES.length; i++) t += senales[SIM_SENALES[i]] ? "1" : "0";
  return t;
}

function simLineaVisual_(bus) {
  var emisor = bus && bus.emisor ? String(bus.emisor) : "";
  if (!emisor) return { estado: "High-Z", emisor: "", valor: "" };
  var valor = bus.valor;
  if (valor === null || typeof valor === "undefined") valor = "";
  return { estado: "EN", emisor: emisor, valor: valor };
}

function simEnablesVisual_(e) {
  var bits = String(e.bits || "");
  var out = {};
  var i;
  for (i = 0; i < SIM_SENALES.length; i++) {
    if (bits.length === SIM_SENALES.length) out[SIM_SENALES[i]] = bits.charAt(i) === "1" ? 1 : 0;
    else out[SIM_SENALES[i]] = e.senales && e.senales[SIM_SENALES[i]] ? 1 : 0;
  }
  return out;
}

function simEventoVisual(e) {
  var enables = simEnablesVisual_(e);
  return {
    fase: String(e.fase || ""),
    evento: String(e.evento || ""),
    pc: e.pc & 0x1FF,
    mar: e.mar & 0x1FF,
    mdr: e.mdr & 255,
    ir: e.ir & 0xFFFF,
    ax: e.ax & 255,
    bx: e.bx & 255,
    cx: e.cx & 255,
    dx: e.dx & 255,
    zf: e.zf ? 1 : 0,
    cf: e.cf ? 1 : 0,
    sf: e.sf ? 1 : 0,
    buses: {
      internoDir: simLineaVisual_(e.buses.dirInt),
      internoDat: simLineaVisual_(e.buses.datInt),
      memoriaDir: simLineaVisual_(e.buses.dirExt),
      memoriaDat: simLineaVisual_(e.buses.datExt)
    },
    control: {
      rd: e.buses.rd ? 1 : 0,
      wr: e.buses.wr ? 1 : 0,
      ck: e.buses.ck ? 1 : 0,
      io: e.buses.io ? 1 : 0
    },
    enables: enables,
    cache: String(e.cacheNota || ""),
    aviso: String(e.banner || ""),
    kbdCount: e.kbdCount || 0
  };
}

function simFilaEscalar(nombre) {
  var i;
  for (i = 0; i < SIM_ESCALARES.length; i++) {
    if (SIM_ESCALARES[i] === nombre) return SIM_FILA_ESC + i;
  }
  return 0;
}

function simTrocear(lista, ancho) {
  var filas = [];
  var i;
  for (i = 0; i < lista.length; i += ancho) filas.push(lista.slice(i, i + ancho));
  return filas;
}

function simValorEscalar(e, nombre) {
  if (nombre === "l1iH") return e.cont.l1iH;
  if (nombre === "l1iM") return e.cont.l1iM;
  if (nombre === "l1dRH") return e.cont.l1dRH;
  if (nombre === "l1dRM") return e.cont.l1dRM;
  if (nombre === "l1dWH") return e.cont.l1dWH;
  if (nombre === "l1dWM") return e.cont.l1dWM;
  if (nombre === "l2H") return e.cont.l2H;
  if (nombre === "l2M") return e.cont.l2M;
  if (nombre === "mant") return e.cont.mant;
  if (nombre === "emDirI") return e.buses.dirInt.emisor;
  if (nombre === "valDirI") return e.buses.dirInt.valor;
  if (nombre === "emDatI") return e.buses.datInt.emisor;
  if (nombre === "valDatI") return e.buses.datInt.valor;
  if (nombre === "emDirE") return e.buses.dirExt.emisor;
  if (nombre === "valDirE") return e.buses.dirExt.valor;
  if (nombre === "emDatE") return e.buses.datExt.emisor;
  if (nombre === "valDatE") return e.buses.datExt.valor;
  if (nombre === "rd") return e.buses.rd;
  if (nombre === "wr") return e.buses.wr;
  if (nombre === "ck") return e.buses.ck;
  if (nombre === "io") return e.buses.io;
  if (nombre === "continuacion") return simTextoContinuacion(e);
  return e[nombre];
}

function simTextoContinuacion(e) {
  return JSON.stringify({
    reanudar: e.reanudar || "",
    pf: e.pf || null,
    dec: e.dec || null,
    registroFallos: e.registroFallos || [],
    visSeq: e.visSeq || 0,
    visGen: e.visGen || 0,
    recs: e.recs || []
  });
}

function simLeerContinuacion(e, valor) {
  var texto = valor === null || typeof valor === "undefined" ? "" : String(valor);
  if (!texto || texto.charAt(0) !== "{") return;
  var obj = null;
  try { obj = JSON.parse(texto); } catch (err) { return; }
  if (!obj || typeof obj !== "object") return;
  if (typeof obj.reanudar === "string" && obj.reanudar) e.reanudar = obj.reanudar;
  if (obj.pf && typeof obj.pf.vpn === "number") e.pf = obj.pf;
  if (obj.dec && obj.dec.nombre) e.dec = obj.dec;
  if (obj.registroFallos && typeof obj.registroFallos.length === "number") e.registroFallos = obj.registroFallos;
  if (typeof obj.visSeq === "number") e.visSeq = obj.visSeq;
  if (typeof obj.visGen === "number") e.visGen = obj.visGen;
  if (obj.recs && typeof obj.recs.length === "number") e.recs = obj.recs;
}

function simRutaPaso_(etiqueta, e) {
  var et = String(etiqueta || "");
  var ev = String(e.evento || "");
  if (et === "F1" || et === "F4") return { id: "PC-MAR", desde: "pc", hasta: "mar", clase: "addr" };
  if (et === "F3" || et === "F6") return { id: "MDR-IR", desde: "mdr", hasta: "ir", clase: "data" };
  if (et === "PF2") return { id: "RAM-VM", desde: "ram", hasta: "vm", clase: "page" };
  if (et === "PF3") return { id: "VM-RAM", desde: "vm", hasta: "ram", clase: "page" };
  if (et === "PF4") return { id: "PT", desde: "pt", hasta: "vm", clase: "page" };
  if (et === "F2" || et === "F5") {
    if (String(e.cacheNota || "").indexOf("MISS") >= 0) return { id: "L1-L2-RAM", desde: "l1", hasta: "ram", clase: "addr" };
    return { id: "CPU-RAM", desde: "mar", hasta: "ram", clase: "addr" };
  }
  if (ev.indexOf("ALU") === 0) return { id: "ALU", desde: "ax", hasta: "alu", clase: "data" };
  if (ev.indexOf("OUT") === 0) return { id: "CPU-IO", desde: "mdr", hasta: "lcd", clase: "io" };
  if (ev.indexOf("IN") === 0 || ev.indexOf("Tecla") === 0) return { id: "IO-CPU", desde: "kbd", hasta: "ax", clase: "io" };
  if (ev.indexOf("ST") === 0) return { id: "CPU-RAM", desde: "mdr", hasta: "ram", clase: "data" };
  if (ev.indexOf("LD") === 0) return { id: "RAM-CPU", desde: "ram", hasta: "mdr", clase: "data" };
  return { id: "High-Z", desde: "", hasta: "", clase: "z" };
}

function simBytesLinea_(linea) {
  var b = [];
  var i;
  for (i = 0; i < 8; i++) b.push(linea && linea.b ? (linea.b[i] & 255) : 0);
  return { v: linea && linea.v ? 1 : 0, tag: linea && linea.tag ? linea.tag : 0, bytes: b };
}

function simSnapshotLab(e) {
  var ram = [];
  var swap = [];
  var pt = [];
  var kbd = [];
  var i;
  var p;
  for (i = 0; i < 256; i++) ram.push(e.ram[i] & 255);
  for (i = 0; i < 512; i++) swap.push(e.swap[i] & 255);
  for (i = 0; i < 16; i++) {
    p = e.paginas[i];
    pt.push({ vpn: i, p: p.p ? 1 : 0, pfn: p.pfn, d: p.dirty ? 1 : 0, r: p.ref ? 1 : 0, fija: p.fija ? 1 : 0 });
  }
  for (i = 0; i < 8; i++) kbd.push(e.ram[0xF0 + i] & 255);
  var lcd = "";
  for (i = 0; i < 8; i++) {
    var glifo = simGlifo(e.ram[0xF8 + i]);
    lcd += glifo === "" ? " " : glifo;
  }
  var rec = e.recs && e.recs.length ? e.recs[e.recs.length - 1] : null;
  return {
    gen: e.visGen || 0,
    seq: e.visSeq || 0,
    fase: String(e.fase || ""),
    evento: String(e.evento || ""),
    texto: String(e.textoIR || ""),
    regs: {
      pc: simHex(e.pc & 0x1FF, 3), ax: simHex(e.ax & 255, 2), bx: simHex(e.bx & 255, 2),
      cx: simHex(e.cx & 255, 2), dx: simHex(e.dx & 255, 2), ir: simHex(e.ir & 0xFFFF, 4),
      mar: simHex(e.mar & 0x1FF, 3), mdr: simHex(e.mdr & 255, 2)
    },
    alu: { a: e.aluA & 255, b: e.aluB & 255, op: String(e.aluOp || ""), r: e.aluR & 255, zf: e.zf ? 1 : 0, cf: e.cf ? 1 : 0, sf: e.sf ? 1 : 0 },
    control: { rd: e.buses.rd ? 1 : 0, wr: e.buses.wr ? 1 : 0, ck: e.buses.ck ? 1 : 0, io: e.buses.io ? 1 : 0 },
    buses: {
      internoDir: simLineaVisual_(e.buses.dirInt),
      internoDat: simLineaVisual_(e.buses.datInt),
      memoriaDir: simLineaVisual_(e.buses.dirExt),
      memoriaDat: simLineaVisual_(e.buses.datExt)
    },
    bits: String(e.bits || ""),
    ram: ram,
    swap: swap,
    pt: pt,
    l1i: simBytesLinea_(e.l1i),
    l1d: simBytesLinea_(e.l1d),
    l2: [simBytesLinea_(e.l2[0]), simBytesLinea_(e.l2[1]), simBytesLinea_(e.l2[2]), simBytesLinea_(e.l2[3])],
    rates: {
      l1i: simTextoTasa(e.cont.l1iH, e.cont.l1iM),
      l1d: simTextoTasa(e.cont.l1dRH + e.cont.l1dWH, e.cont.l1dRM + e.cont.l1dWM),
      l2: simTextoTasa(e.cont.l2H, e.cont.l2M)
    },
    kbd: kbd,
    kbdHead: e.kbdHead || 0,
    kbdTail: e.kbdTail || 0,
    kbdCount: e.kbdCount || 0,
    lcd: lcd,
    marca: { va: e.ultimaVA === "" || e.ultimaVA === null ? "" : e.ultimaVA, pa: e.ultimaPA === "" || e.ultimaPA === null ? "" : e.ultimaPA },
    rec: rec,
    aviso: String(e.banner || ""),
    cache: String(e.cacheNota || "")
  };
}

function simRegistrarVista_(e, etiqueta) {
  if (!e.recs) e.recs = [];
  e.visSeq = (Number(e.visSeq) || 0) + 1;
  var orden = [["dirInt", e.buses.dirInt], ["datInt", e.buses.datInt], ["dirExt", e.buses.dirExt], ["datExt", e.buses.datExt]];
  var bus = "High-Z";
  var emisor = "";
  var valor = "";
  var i;
  for (i = 0; i < orden.length; i++) {
    if (orden[i][1] && orden[i][1].emisor) {
      bus = orden[i][0];
      emisor = String(orden[i][1].emisor);
      valor = orden[i][1].valor;
      break;
    }
  }
  e.recs.push({
    seq: e.visSeq,
    fase: String(etiqueta || ""),
    bus: bus,
    emisor: emisor,
    receptor: String(e.evento || ""),
    valor: valor,
    cache: String(e.cacheNota || ""),
    aviso: String(e.banner || ""),
    ruta: simRutaPaso_(etiqueta, e)
  });
  if (e.recs.length > 24) e.recs = e.recs.slice(e.recs.length - 24);
}

function simPonerEscalar(e, nombre, valor) {
  if (nombre === "l1iH") e.cont.l1iH = Number(valor) || 0;
  else if (nombre === "l1iM") e.cont.l1iM = Number(valor) || 0;
  else if (nombre === "l1dRH") e.cont.l1dRH = Number(valor) || 0;
  else if (nombre === "l1dRM") e.cont.l1dRM = Number(valor) || 0;
  else if (nombre === "l1dWH") e.cont.l1dWH = Number(valor) || 0;
  else if (nombre === "l1dWM") e.cont.l1dWM = Number(valor) || 0;
  else if (nombre === "l2H") e.cont.l2H = Number(valor) || 0;
  else if (nombre === "l2M") e.cont.l2M = Number(valor) || 0;
  else if (nombre === "mant") e.cont.mant = Number(valor) || 0;
  else if (nombre === "emDirI") e.buses.dirInt.emisor = valor || "";
  else if (nombre === "valDirI") e.buses.dirInt.valor = valor === "" || valor === null ? "" : valor;
  else if (nombre === "emDatI") e.buses.datInt.emisor = valor || "";
  else if (nombre === "valDatI") e.buses.datInt.valor = valor === "" || valor === null ? "" : valor;
  else if (nombre === "emDirE") e.buses.dirExt.emisor = valor || "";
  else if (nombre === "valDirE") e.buses.dirExt.valor = valor === "" || valor === null ? "" : valor;
  else if (nombre === "emDatE") e.buses.datExt.emisor = valor || "";
  else if (nombre === "valDatE") e.buses.datExt.valor = valor === "" || valor === null ? "" : valor;
  else if (nombre === "rd") e.buses.rd = Number(valor) || 0;
  else if (nombre === "wr") e.buses.wr = Number(valor) || 0;
  else if (nombre === "ck") e.buses.ck = Number(valor) || 0;
  else if (nombre === "io") e.buses.io = Number(valor) || 0;
  else if (nombre === "continuacion") simLeerContinuacion(e, valor);
  else if (nombre === "stop") e.stop = Number(valor) ? 1 : 0;
  else if (typeof e[nombre] === "number") e[nombre] = Number(valor) || 0;
  else e[nombre] = valor === null || typeof valor === "undefined" ? "" : valor;
}

function simFilaCache(nombre, linea) {
  var fila = [nombre, linea.v ? 1 : 0, linea.v ? linea.tag : "", linea.base < 0 ? "" : linea.base];
  var i;
  for (i = 0; i < 8; i++) fila.push(linea.v ? linea.b[i] : "");
  return fila;
}

function simAplicarLinea(linea, fila) {
  linea.v = Number(fila[1]) ? 1 : 0;
  linea.tag = linea.v ? Number(fila[2]) || 0 : 0;
  linea.base = fila[3] === "" || fila[3] === null ? -1 : Number(fila[3]);
  var i;
  for (i = 0; i < 8; i++) linea.b[i] = linea.v ? (Number(fila[4 + i]) || 0) : 0;
}

function simExportar(e) {
  var esc = [];
  var i;
  for (i = 0; i < SIM_ESCALARES.length; i++) esc.push([SIM_ESCALARES[i], simValorEscalar(e, SIM_ESCALARES[i])]);
  var pag = [];
  for (i = 0; i < 16; i++) {
    var p = e.paginas[i];
    pag.push([p.p, p.pfn < 0 ? "" : p.pfn, p.dirty, p.ref, p.orden, p.uso, p.fija]);
  }
  var cache = [
    simFilaCache("L1I", e.l1i),
    simFilaCache("L1D", e.l1d),
    simFilaCache("L2.0", e.l2[0]),
    simFilaCache("L2.1", e.l2[1]),
    simFilaCache("L2.2", e.l2[2]),
    simFilaCache("L2.3", e.l2[3])
  ];
  var traza = [];
  for (i = 0; i < SIM_TRAZA_MAX; i++) {
    if (i < e.trace.length) traza.push(e.trace[i].slice());
    else traza.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);
  }
  return {
    escalares: esc,
    ram: simTrocear(e.ram, 16),
    swap: simTrocear(e.swap, 32),
    paginas: pag,
    cache: cache,
    traza: traza
  };
}

function simImportar(e, bloques) {
  var i;
  var c;
  for (i = 0; i < bloques.escalares.length; i++) {
    simPonerEscalar(e, bloques.escalares[i][0], bloques.escalares[i][1]);
  }
  for (i = 0; i < 16; i++) {
    for (c = 0; c < 16; c++) e.ram[i * 16 + c] = Number(bloques.ram[i][c]) || 0;
  }
  for (i = 0; i < 16; i++) {
    for (c = 0; c < 32; c++) e.swap[i * 32 + c] = Number(bloques.swap[i][c]) || 0;
  }
  for (i = 0; i < 16; i++) {
    var f = bloques.paginas[i];
    e.paginas[i] = {
      p: Number(f[0]) ? 1 : 0,
      pfn: f[1] === "" || f[1] === null ? -1 : Number(f[1]),
      dirty: Number(f[2]) ? 1 : 0,
      ref: Number(f[3]) ? 1 : 0,
      orden: Number(f[4]) || 0,
      uso: Number(f[5]) || 0,
      fija: Number(f[6]) ? 1 : 0
    };
  }
  simAplicarLinea(e.l1i, bloques.cache[0]);
  simAplicarLinea(e.l1d, bloques.cache[1]);
  for (i = 0; i < 4; i++) simAplicarLinea(e.l2[i], bloques.cache[2 + i]);
  e.trace = [];
  for (i = 0; i < bloques.traza.length; i++) {
    if (bloques.traza[i][0] === "" || bloques.traza[i][0] === null) continue;
    e.trace.push(bloques.traza[i].slice());
  }
  return e;
}

function simFirma(e) {
  return [
    e.pc, e.mar, e.mdr, e.ir, e.ax, e.bx, e.cx, e.dx, e.zf, e.cf, e.sf,
    e.fase, e.fallos, e.writebacks, e.cont.l1iH, e.cont.l1iM, e.cont.l2H, e.cont.l2M,
    e.ram.join(","), e.swap.join(","),
    e.paginas.map(function (p) { return p.p + ":" + p.pfn + ":" + p.dirty; }).join("|")
  ].join(";");
}
