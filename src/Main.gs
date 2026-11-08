// Main.gs — menú, Step/Run/Stop/Reset y preparación de la copia.
// onOpen solo crea el menú. No hay disparadores instalables,
// ni UrlFetch, ni Drive, ni web app.
// Toda escritura exige la hoja copia y el script copia.
// Antes de pegar estos 8 archivos en el proyecto nuevo, borrar
// SOLO en esa copia los 29 .gs heredados. No ejecutarlos.

var SIM_VIEJOS = [
  "Config", "CPU", "Util", "Decoder", "ALU", "Registros", "Buses", "Microcodigo",
  "animaciones", "loader", "ProgramLoader", "Assembler", "Editor", "Catalog",
  "Disassembler", "FetchBytes", "MemoriaFisica", "MarcosRAM", "MUU", "SwapVM",
  "ReemplazoPaginas", "CacheEstructura", "CacheLogica", "CacheVisual",
  "loCycles", "IoCycle", "Keyboard", "LCD", "Issue22", "UI"
];

function simLibro_() {
  if (typeof SpreadsheetApp === "undefined" || typeof ScriptApp === "undefined") {
    throw new Error("Esta función solo corre dentro de la copia de Apps Script.");
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No hay una hoja activa.");
  simExigirIds(ss.getId(), ScriptApp.getScriptId());
  return ss;
}

function simHoja_(ss, nombre) {
  var exacta = ss.getSheetByName(nombre);
  if (exacta) return exacta;
  var todas = ss.getSheets();
  var i;
  for (i = 0; i < todas.length; i++) {
    var actual = String(todas[i].getName());
    if (actual.toLowerCase() === String(nombre).toLowerCase()) {
      if (actual !== nombre) todas[i].setName(nombre);
      return todas[i];
    }
  }
  return ss.insertSheet(nombre);
}

function simMedirMatriz_(matriz) {
  if (!matriz || !matriz.length) return { filas: 0, cols: 0 };
  var cols = matriz[0].length;
  var i;
  for (i = 1; i < matriz.length; i++) {
    if (!matriz[i] || matriz[i].length !== cols) {
      throw new Error("Matriz irregular: la fila " + (i + 1) + " tiene " + (matriz[i] ? matriz[i].length : 0) + " columnas y la primera tiene " + cols + ".");
    }
  }
  return { filas: matriz.length, cols: cols };
}

function simPegar_(hoja, fila, col, matriz) {
  var med = simMedirMatriz_(matriz);
  if (!med.filas || !med.cols) return;
  hoja.getRange(fila, col, med.filas, med.cols).setValues(matriz);
}

function simDescombinar_(hoja) {
  if (!hoja.getMaxRows || !hoja.getRange) return;
  var rango = hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns());
  if (!rango.getMergedRanges) return;
  var grupos = rango.getMergedRanges();
  var i;
  for (i = 0; i < grupos.length; i++) {
    if (grupos[i].breakApart) grupos[i].breakApart();
  }
}

function simLimpiarLienzo_(hoja) {
  simDescombinar_(hoja);
  var todo = hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns());
  if (todo.clearDataValidations) todo.clearDataValidations();
  if (todo.removeCheckboxes) todo.removeCheckboxes();
  hoja.clear();
  if (hoja.setConditionalFormatRules) hoja.setConditionalFormatRules([]);
}

function simLeerStop_(ss) {
  var hoja = ss.getSheetByName("_ESTADO");
  if (!hoja) return 0;
  return Number(hoja.getRange(simFilaEscalar("stop"), 2).getValue()) ? 1 : 0;
}

function simEscribirEstado_(ss, e) {
  var hoja = simHoja_(ss, "_ESTADO");
  var bloques = simExportar(e);
  var esc = [];
  var i;
  for (i = 0; i < bloques.escalares.length; i++) esc.push([bloques.escalares[i][1]]);
  hoja.getRange(1, 1).setValue(SIM_MAGIA);
  hoja.getRange(simFilaEscalar("bits"), 2).setNumberFormat("@");
  simPegar_(hoja, SIM_FILA_ESC, 2, esc);
  simPegar_(hoja, SIM_FILA_RAM, 1, bloques.ram);
  simPegar_(hoja, SIM_FILA_SWAP, 1, bloques.swap);
  simPegar_(hoja, SIM_FILA_PAG, 1, bloques.paginas);
  simPegar_(hoja, SIM_FILA_CACHE, 1, bloques.cache);
  var nTraza = e.trace.length;
  if (nTraza > SIM_TRAZA_MAX) nTraza = SIM_TRAZA_MAX;
  if (nTraza) simPegar_(hoja, SIM_FILA_TRAZA, 1, bloques.traza.slice(0, nTraza));
  if (nTraza < SIM_TRAZA_MAX) {
    hoja.getRange(SIM_FILA_TRAZA + nTraza, 1, SIM_TRAZA_MAX - nTraza, 19).clearContent();
  }
  var vista = simVistaFilas(e);
  var izq = [];
  var der = [];
  var iVista;
  for (iVista = 0; iVista < vista.length; iVista++) {
    if (iVista < 16) izq.push(vista[iVista]);
    else der.push(vista[iVista]);
  }
  hoja.getRange(SIM_FILA_VISTA, 6, 16, 1).setNumberFormat("@");
  if (der.length) hoja.getRange(SIM_FILA_VISTA, 8, der.length, 1).setNumberFormat("@");
  hoja.getRange(SIM_FILA_BITS, 1, 1, SIM_SENALES.length).setNumberFormat("@");
  simPegar_(hoja, SIM_FILA_VISTA, 5, izq);
  if (der.length) simPegar_(hoja, SIM_FILA_VISTA, 7, der);
  var bits = String(e.bits || "");
  var filaBits = [];
  for (iVista = 0; iVista < SIM_SENALES.length; iVista++) filaBits.push(bits.charAt(iVista) || "0");
  simPegar_(hoja, SIM_FILA_BITS, 1, [filaBits]);
  var lcd = [];
  for (iVista = 0; iVista < 8; iVista++) lcd.push(simGlifo(e.ram[0xF8 + iVista]));
  simPegar_(hoja, 76, 1, [lcd]);
  simEscribirRecientes_(hoja, e);
}

function simEscribirRecientes_(hoja, e) {
  var recs = e.recs || [];
  var filas = [];
  var i;
  var desde = recs.length > 12 ? recs.length - 12 : 0;
  for (i = desde; i < recs.length; i++) {
    var r = recs[i];
    filas.push([r.seq, r.fase, r.bus, r.emisor, String(r.receptor || "").slice(0, 80)]);
  }
  while (filas.length < 12) filas.push(["", "", "", "", ""]);
  simPegar_(hoja, SIM_FILA_LOG, 1, filas);
}

function simLeerEstado_(ss) {
  var hoja = ss.getSheetByName("_ESTADO");
  if (!hoja || String(hoja.getRange(1, 1).getValue()) !== SIM_MAGIA) {
    throw new Error("Falta preparar la copia. Use el menú Simulador > Preparar esta copia.");
  }
  var e = simEstadoInicial();
  var escVals = hoja.getRange(SIM_FILA_ESC, 1, SIM_ESCALARES.length, 2).getValues();
  var escalares = [];
  var i;
  for (i = 0; i < escVals.length; i++) escalares.push([String(escVals[i][0] || SIM_ESCALARES[i]), escVals[i][1]]);
  simImportar(e, {
    escalares: escalares,
    ram: hoja.getRange(SIM_FILA_RAM, 1, 16, 16).getValues(),
    swap: hoja.getRange(SIM_FILA_SWAP, 1, 16, 32).getValues(),
    paginas: hoja.getRange(SIM_FILA_PAG, 1, 16, 7).getValues(),
    cache: hoja.getRange(SIM_FILA_CACHE, 1, 6, 12).getValues(),
    traza: hoja.getRange(SIM_FILA_TRAZA, 1, SIM_TRAZA_MAX, 19).getValues()
  });
  return e;
}

function simConCandado_(fn) {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(1500)) throw new Error("Candado ocupado. Reintente Step o Run.");
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function simColumna_(n) {
  var s = "";
  var x = n;
  while (x > 0) {
    var r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function simProteger_(hoja, libres) {
  var protecciones = hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  var i;
  for (i = 0; i < protecciones.length; i++) protecciones[i].remove();
  var p = hoja.protect();
  p.setDescription("Presentación del simulador");
  p.setWarningOnly(false);
  if (libres && libres.length) p.setUnprotectedRanges(libres);
  try { p.removeEditors(p.getEditors()); } catch (err) {}
  return p;
}

function simRefVista_(nombre) {
  return "=_ESTADO!" + simCeldaVista(nombre);
}

function simRefEsc_(nombre) {
  return "=_ESTADO!B" + simFilaEscalar(nombre);
}

function simOcultarSiExiste_(ss, nombre) {
  var hoja = ss.getSheetByName(nombre);
  if (hoja && hoja.hideSheet) hoja.hideSheet();
}

function simPrepararEstaCopia() {
  var ss = simLibro_();
  var estado = simHoja_(ss, "_ESTADO");
  var ya = String(estado.getRange(1, 1).getValue()) === SIM_MAGIA;
  simPintarEstado_(estado, ya);
  simPintarPanel_(ss);
  simPintarProgramas_(ss);
  simBotonesPrograma_(ss.getSheetByName("PROGRAMAS"));
  simPintarPerifericos_(ss);
  simPintarTraza_(ss);
  var ocultar = ["CPU", "BUSES", "CACHE", "MEMORIA", "ES"];
  var i;
  for (i = 0; i < ocultar.length; i++) simOcultarSiExiste_(ss, ocultar[i]);
  var orden = ["PANEL", "PROGRAMAS", "PERIFERICOS", "TRACE"];
  for (i = 0; i < orden.length; i++) {
    var h = ss.getSheetByName(orden[i]);
    if (h) {
      ss.setActiveSheet(h);
      ss.moveActiveSheet(i + 1);
    }
  }
  estado.hideSheet();
  simRepararBinarios_(ss);
  ss.setActiveSheet(ss.getSheetByName("PANEL"));
  return ya ? "Presentación recuperada. El estado existente se conservó." : "Copia preparada con el estado inicial.";
}

function simPintarEstado_(hoja, conservar) {
  simDescombinar_(hoja);
  hoja.getRange(1, 1).setValue(SIM_MAGIA);
  var etiquetas = [];
  var i;
  for (i = 0; i < SIM_ESCALARES.length; i++) etiquetas.push([SIM_ESCALARES[i]]);
  simPegar_(hoja, SIM_FILA_ESC, 1, etiquetas);
  if (!conservar) simEscribirEstado_(hoja.getParent(), simEstadoInicial());
  hoja.setFrozenRows(2);
  simPegar_(hoja, 2, 1, [["campo", "valor"]]);
  hoja.getRange(2, 1, 1, 2).setFontWeight("bold");
  simProteger_(hoja, []);
}

function simEstiloTitulo_(rango) {
  rango.setBackground("#1F4E78").setFontColor("#FFFFFF").setFontWeight("bold");
}

function simCheck_(hoja, fila, texto) {
  var celda = hoja.getRange(fila, 3);
  celda.insertCheckboxes();
  hoja.getRange(fila, 2).setValue(texto);
  celda.setBackground("#C8E6C9");
  return celda;
}

function simIdPrograma_(valor) {
  var id = String(valor || "").trim().toUpperCase();
  if (id === "P1" || id === "P2" || id === "P3") return id;
  return "";
}

function simRefUnidos_(fila, desdeCol, n, conEspacio) {
  var s = "=";
  var i;
  for (i = 0; i < n; i++) {
    if (i) s += conEspacio ? "&\" \"&" : "&";
    s += "_ESTADO!" + simColumna_(desdeCol + i) + fila;
  }
  return s;
}

function simPosA1_(a1) {
  var m = /^([A-Z]+)(\d+)$/.exec(String(a1 || ""));
  var col = 0;
  var i;
  if (!m) return { fila: 1, col: 1 };
  for (i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
  return { fila: Number(m[2]), col: col };
}

function simRepararBinarios_(ss) {
  var hoja = ss.getSheetByName("_ESTADO");
  if (!hoja || String(hoja.getRange(1, 1).getValue()) !== SIM_MAGIA) return;
  var pares = [
    ["pc", 9, "pcBin"], ["mar", 9, "marBin"], ["mdr", 8, "mdrBin"], ["ir", 16, "irBin"],
    ["ax", 8, "axBin"], ["bx", 8, "bxBin"], ["cx", 8, "cxBin"], ["dx", 8, "dxBin"]
  ];
  var i;
  for (i = 0; i < pares.length; i++) {
    var n = Number(hoja.getRange(simFilaEscalar(pares[i][0]), 2).getValue()) || 0;
    var pos = simPosA1_(simCeldaVista(pares[i][2]));
    var celda = hoja.getRange(pos.fila, pos.col);
    celda.setNumberFormat("@");
    celda.setValue(simBin(n, pares[i][1]));
  }
}

function simUnir_(hoja, fila, col, nFilas, nCols) {
  var rango = hoja.getRange(fila, col, nFilas, nCols);
  if (rango.merge) rango.merge();
  if (rango.setWrap) rango.setWrap(true);
  return rango;
}

function simPintarPanel_(ss) {
  var previa = ss.getSheetByName("PANEL");
  var prog = "P1";
  var delay = 1000;
  if (previa) {
    prog = simIdPrograma_(previa.getRange(3, 4).getValue()) || simIdPrograma_(previa.getRange(9, 2).getValue()) || "P1";
    var d = Number(previa.getRange(3, 5).getValue());
    if (d >= 50 && d <= 5000) delay = d;
  }
  var hoja = simHoja_(ss, "PANEL");
  simLimpiarLienzo_(hoja);
  simPegar_(hoja, 1, 1, [["UNIDAD CENTRAL DE PROCESO - CPU", "", "", "", "", "", "", ""]]);
  simPegar_(hoja, 2, 1, [[
    "STEP", "RUN", "LOAD", "Programa", "DELAY", "PAUSE", "RESET", "ISA actual: LD, no LOAD"
  ]]);
  simPegar_(hoja, 3, 1, [["", "", "", prog, delay, "", "", ""]]);
  var casillas = [[3, 1], [3, 2], [3, 3], [3, 6], [3, 7]];
  var i;
  for (i = 0; i < casillas.length; i++) {
    hoja.getRange(casillas[i][0], casillas[i][1]).insertCheckboxes();
    hoja.getRange(casillas[i][0], casillas[i][1]).setBackground("#C8E6C9");
  }
  var lista = SpreadsheetApp.newDataValidation().requireValueInList(["P1", "P2", "P3"], true).setAllowInvalid(false).build();
  hoja.getRange(3, 4).setDataValidation(lista).setBackground("#FFF9C4");
  hoja.getRange(3, 5).setBackground("#FFF9C4");

  var regs = [
    ["Registro", "Decimal", "Hex", "Binario"],
    ["PC", simRefEsc_("pc"), simRefVista_("pcHex"), simRefVista_("pcBin")],
    ["AX", simRefEsc_("ax"), simRefVista_("axHex"), simRefVista_("axBin")],
    ["BX", simRefEsc_("bx"), simRefVista_("bxHex"), simRefVista_("bxBin")],
    ["CX", simRefEsc_("cx"), simRefVista_("cxHex"), simRefVista_("cxBin")],
    ["DX", simRefEsc_("dx"), simRefVista_("dxHex"), simRefVista_("dxBin")],
    ["MAR", simRefEsc_("mar"), simRefVista_("marHex"), simRefVista_("marBin")],
    ["MDR", simRefEsc_("mdr"), simRefVista_("mdrHex"), simRefVista_("mdrBin")],
    ["IR", simRefEsc_("ir"), simRefVista_("irHex"), simRefVista_("irBin")]
  ];
  simPegar_(hoja, 5, 1, regs);
  simPegar_(hoja, 14, 1, [[
    "Palabra",
    simRefEsc_("palabra"),
    simRefUnidos_(SIM_FILA_BITS, 1, SIM_SENALES.length, false),
    "28 bits"
  ]]);
  hoja.getRange(6, 4, 8, 1).setNumberFormat("@");
  hoja.getRange(14, 3).setNumberFormat("@");

  simPegar_(hoja, 16, 1, [
    ["UNIDAD ARITMETICO-LOGICA", "", "", ""],
    ["Operando #1", simRefEsc_("aluA"), "Operando #2", simRefEsc_("aluB")],
    ["Resultado", simRefEsc_("aluR"), "Op", simRefEsc_("aluOp")]
  ]);
  simPegar_(hoja, 16, 7, [
    ["ZERO FLAG", simRefEsc_("zf")],
    ["CARRY FLAG", simRefEsc_("cf")],
    ["SIGN FLAG", simRefEsc_("sf")],
    ["Último fallo", simRefEsc_("banner")]
  ]);
  hoja.getRange(19, 8).setBackground("#FFF8E1");

  var buses = [
    ["Buses", "Emisor", "Valor", "Lectura"],
    ["Dirección interna", simRefEsc_("emDirI"), simRefVista_("dirI"), "EN o High-Z (ZZ)"],
    ["Datos internos", simRefEsc_("emDatI"), simRefVista_("datI"), "EN o High-Z (ZZ)"],
    ["Dirección memoria", simRefEsc_("emDirE"), simRefVista_("dirE"), "física"],
    ["Datos memoria", simRefEsc_("emDatE"), simRefVista_("datE"), "RAM o MDR"],
    ["Read", simRefEsc_("rd"), "", "1 activo, 0 inactivo"],
    ["Write", simRefEsc_("wr"), "", "1 activo, 0 inactivo"],
    ["Clock", simRefEsc_("ck"), "", "1 pulso"],
    ["IO", simRefEsc_("io"), "", "1 si IN u OUT"]
  ];
  simPegar_(hoja, 21, 1, buses);

  simPegar_(hoja, 4, 10, [[
    "Caché", "L1I", simRefVista_("l1iTasa"), "L1D", simRefVista_("l1dTasa"), "L2", simRefVista_("l2Tasa"), "Mant.", simRefEsc_("mant"),
    "", "", "", "", "", "", ""
  ]]);
  var cache = [["Línea", "V", "Tag", "Base", "Bytes"]];
  var f;
  for (f = 0; f < 6; f++) {
    var base = SIM_FILA_CACHE + f;
    cache.push([
      "=_ESTADO!A" + base,
      "=_ESTADO!B" + base,
      "=_ESTADO!C" + base,
      "=_ESTADO!D" + base,
      simRefUnidos_(base, 5, 8, true)
    ]);
  }
  simPegar_(hoja, 5, 10, cache);

  var ramHead = ["Memoria RAM"];
  var h;
  for (h = 0; h < 16; h++) ramHead.push(h.toString(16).toUpperCase());
  simPegar_(hoja, 12, 10, [ramHead]);
  var ram = [];
  for (f = 0; f < 16; f++) {
    var fila = [simHex(f * 16, 2) + "h"];
    var c;
    for (c = 0; c < 16; c++) fila.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_RAM + f));
    ram.push(fila);
  }
  simPegar_(hoja, 13, 10, ram);

  simPegar_(hoja, 30, 10, [[
    "Memoria virtual 512 B. Marcos 0-6 paginables. El marco 7 es E/S fija. No se afirma la nota plena de 8 marcos.",
    "", "", "", "", "", "", ""
  ]]);
  hoja.getRange(30, 10).setWrap(true);
  simPegar_(hoja, 31, 10, [[
    "VM activa, VPN 15",
    "=_ESTADO!" + simColumna_(1) + (SIM_FILA_PAG + 15),
    "marco",
    "=_ESTADO!" + simColumna_(2) + (SIM_FILA_PAG + 15),
    "", "", "", ""
  ]]);
  var pag = [["VPN", "P", "PFN", "Dirty", "Ref", "Orden", "Uso", "Fija"]];
  for (f = 0; f < 16; f++) {
    var fp = [String(f)];
    for (c = 0; c < 7; c++) fp.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_PAG + f));
    pag.push(fp);
  }
  simPegar_(hoja, 32, 10, pag);

  var log = [["Paso", "Fase", "Bus", "Emisor", "Detalle"]];
  for (f = 0; f < 12; f++) {
    var fl = [];
    for (c = 0; c < 5; c++) fl.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_LOG + f));
    log.push(fl);
  }
  simPegar_(hoja, 50, 10, log);
  var vm = [];
  var mitad;
  for (f = 0; f < 16; f++) {
    var baja = ["VPN" + f + " +00"];
    var alta = ["VPN" + f + " +10"];
    for (c = 0; c < 16; c++) baja.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_SWAP + f));
    for (c = 0; c < 16; c++) alta.push("=_ESTADO!" + simColumna_(c + 17) + (SIM_FILA_SWAP + f));
    vm.push(baja);
    vm.push(alta);
  }
  simPegar_(hoja, 64, 10, vm);
  hoja.getRange(64, 10, 32, 17).setBackground("#10243f").setFontColor("#d6e8ff").setFontSize(9);

  simEstiloTitulo_(hoja.getRange(1, 1, 1, 8));
  hoja.getRange(2, 1, 1, 7).setBackground("#263238").setFontColor("#FFFFFF").setFontWeight("bold");
  hoja.getRange(5, 1, 1, 4).setBackground("#1565C0").setFontColor("#FFFFFF");
  hoja.getRange(6, 1, 8, 4).setBackground("#1A2332").setFontColor("#E3F2FD");
  hoja.getRange(16, 1, 1, 4).setBackground("#37474F").setFontColor("#FFFFFF");
  hoja.getRange(17, 2).setBackground("#A5D6A7");
  hoja.getRange(17, 4).setBackground("#90CAF9");
  hoja.getRange(18, 2).setBackground("#CE93D8");
  hoja.getRange(16, 7, 4, 2).setBackground("#263238").setFontColor("#FFFFFF");
  hoja.getRange(4, 10, 1, 16).setBackground("#4A148C").setFontColor("#FFFFFF");
  hoja.getRange(5, 10, 1, 5).setBackground("#6A1B9A").setFontColor("#FFFFFF");
  hoja.getRange(12, 10, 1, 17).setBackground("#0D47A1").setFontColor("#FFFFFF");
  hoja.getRange(13, 11, 16, 16).setBackground("#1565C0").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  hoja.getRange(30, 10, 1, 8).setBackground("#FFF3E0");
  hoja.getRange(32, 10, 1, 8).setBackground("#EF6C00").setFontColor("#FFFFFF");
  hoja.getRange(50, 10, 1, 5).setBackground("#263238").setFontColor("#FFFFFF");
  if (hoja.setRowHeight) hoja.setRowHeight(30, 48);
  var col;
  for (col = 11; col <= 26; col++) hoja.setColumnWidth(col, 36);
  hoja.setColumnWidth(1, 150);
  hoja.setColumnWidth(2, 120);
  hoja.setColumnWidth(3, 120);
  hoja.setColumnWidth(4, 140);
  hoja.setColumnWidth(10, 160);
  hoja.setFrozenRows(3);
  simProteger_(hoja, [
    hoja.getRange(3, 1, 1, 7),
    hoja.getRange(3, 4, 1, 2)
  ]);
}

function simPintarPerifericos_(ss) {
  var hoja = simHoja_(ss, "PERIFERICOS");
  simLimpiarLienzo_(hoja);
  simPegar_(hoja, 1, 1, [[
    "PERIFERICOS",
    "Cada letra es una tecla. La casilla de abajo también la encola. No hay cuadro de texto.",
    "", "", "", "", "", "", "", "", "", "", ""
  ]]);
  var fila1 = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
  var fila2 = ["N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
  var fila3 = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "Espacio", "Borrar", ""];
  simPegar_(hoja, 3, 1, [fila1]);
  simPegar_(hoja, 5, 1, [fila2]);
  simPegar_(hoja, 7, 1, [fila3]);
  var c;
  for (c = 1; c <= 13; c++) {
    hoja.getRange(4, c).insertCheckboxes();
    hoja.getRange(6, c).insertCheckboxes();
  }
  for (c = 1; c <= 12; c++) hoja.getRange(8, c).insertCheckboxes();
  hoja.getRange(3, 1, 1, 13).setBackground("#263238").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  hoja.getRange(5, 1, 1, 13).setBackground("#263238").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  hoja.getRange(7, 1, 1, 12).setBackground("#263238").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  simPegar_(hoja, 10, 1, [[
    "Cabeza", simRefEsc_("kbdHead"),
    "Cola", simRefEsc_("kbdTail"),
    "Cuenta", simRefEsc_("kbdCount"),
    "", "", "", "", "", "", ""
  ]]);
  var lcd = ["LCD"];
  for (c = 0; c < 8; c++) lcd.push("=_ESTADO!" + simColumna_(c + 1) + "76");
  while (lcd.length < 13) lcd.push("");
  simPegar_(hoja, 12, 1, [lcd]);
  hoja.getRange(12, 2, 1, 8).setBackground("#000000").setFontColor("#39FF14").setFontSize(18).setHorizontalAlignment("center");
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 2));
  hoja.setFrozenRows(1);
  simProteger_(hoja, [hoja.getRange(4, 1, 1, 13), hoja.getRange(6, 1, 1, 13), hoja.getRange(8, 1, 1, 12)]);
}

function simPintarCpu_(ss) {
  var hoja = simHoja_(ss, "CPU");
  simLimpiarLienzo_(hoja);
  var nombres = ["PC", "MAR", "MDR", "IR", "AX", "BX", "CX", "DX", "ZF", "CF", "SF"];
  var claves = ["pc", "mar", "mdr", "ir", "ax", "bx", "cx", "dx", "zf", "cf", "sf"];
  var bits = [9, 9, 8, 16, 8, 8, 8, 8, 1, 1, 1];
  var cuerpo = [["Registro", "Decimal", "HEX", "Binario", "Bits"]];
  var i;
  for (i = 0; i < nombres.length; i++) {
    var fila = simFilaEscalar(claves[i]);
    var hex = "=_ESTADO!B" + fila;
    var bin = "=_ESTADO!B" + fila;
    if (claves[i] === "zf" || claves[i] === "cf" || claves[i] === "sf") {
      hex = "=_ESTADO!B" + fila;
      bin = "=_ESTADO!B" + fila;
    } else {
      hex = "=_ESTADO!" + simCeldaVista(claves[i] + "Hex");
      bin = "=_ESTADO!" + simCeldaVista(claves[i] + "Bin");
    }
    cuerpo.push([nombres[i], "=_ESTADO!B" + fila, hex, bin, bits[i]]);
  }
  simPegar_(hoja, 1, 1, cuerpo);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 5));
  simPegar_(hoja, 14, 1, [
    ["Texto IR", "=_ESTADO!B" + simFilaEscalar("textoIR")],
    ["ALU A", "=_ESTADO!B" + simFilaEscalar("aluA")],
    ["ALU B / op / R", "=_ESTADO!" + simCeldaVista("aluTxt")],
    ["Micro-paso", "=_ESTADO!B" + simFilaEscalar("fase")]
  ]);
  hoja.setColumnWidth(1, 160);
  hoja.setColumnWidth(4, 220);
  simProteger_(hoja, []);
}

function simPintarBuses_(ss) {
  var hoja = simHoja_(ss, "BUSES");
  simLimpiarLienzo_(hoja);
  var lineas = [
    ["Bus", "Bits", "Emisor", "Valor o ZZ"],
    ["Dirección interna", "9", "=_ESTADO!B" + simFilaEscalar("emDirI"), "=_ESTADO!" + simCeldaVista("dirI")],
    ["Datos internos", "8", "=_ESTADO!B" + simFilaEscalar("emDatI"), "=_ESTADO!" + simCeldaVista("datI")],
    ["Dirección externa", "8", "=_ESTADO!B" + simFilaEscalar("emDirE"), "=_ESTADO!" + simCeldaVista("dirE")],
    ["Datos externos", "8", "=_ESTADO!B" + simFilaEscalar("emDatE"), "=_ESTADO!" + simCeldaVista("datE")],
    ["Read", "1", "", "=_ESTADO!B" + simFilaEscalar("rd")],
    ["Write", "1", "", "=_ESTADO!B" + simFilaEscalar("wr")],
    ["Clock", "1", "", "=_ESTADO!B" + simFilaEscalar("ck")],
    ["IO", "1", "", "=_ESTADO!B" + simFilaEscalar("io")],
    ["Micro-palabra", "28", "", "=_ESTADO!B" + simFilaEscalar("palabra")]
  ];
  simPegar_(hoja, 1, 1, lineas);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 4));
  var bits = [["Señal", "Bit"]];
  var i;
  for (i = 0; i < SIM_SENALES.length; i++) {
    bits.push([SIM_SENALES[i], "=_ESTADO!" + simColumna_(i + 1) + SIM_FILA_BITS]);
  }
  simPegar_(hoja, 12, 1, bits);
  simEstiloTitulo_(hoja.getRange(12, 1, 1, 2));
  var reglas = [
    hoja.getRange(2, 4, 4, 1)
  ];
  var iReg;
  for (iReg = 0; iReg < reglas.length; iReg++) {
    var alta = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("ZZ").setBackground("#B0BEC5").setRanges([reglas[iReg]]).build();
    var viva = SpreadsheetApp.newConditionalFormatRule().whenTextDoesNotContain("ZZ").setBackground("#C8E6C9").setRanges([reglas[iReg]]).build();
    var actuales = hoja.getConditionalFormatRules();
    actuales.push(alta);
    actuales.push(viva);
    hoja.setConditionalFormatRules(actuales);
  }
  hoja.setColumnWidth(1, 200);
  simProteger_(hoja, []);
}

function simPintarCache_(ss) {
  var hoja = simHoja_(ss, "CACHE");
  simLimpiarLienzo_(hoja);
  var cab = ["Línea", "V", "Tag", "Base", "B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7"];
  var cuerpo = [cab];
  var i;
  var c;
  for (i = 0; i < 6; i++) {
    var fila = [];
    for (c = 0; c < 12; c++) fila.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_CACHE + i));
    cuerpo.push(fila);
  }
  simPegar_(hoja, 1, 1, cuerpo);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 12));
  simPegar_(hoja, 9, 1, [
    ["Nivel", "Hits", "Miss", "Tasa"],
    ["L1I", "=_ESTADO!B" + simFilaEscalar("l1iH"), "=_ESTADO!B" + simFilaEscalar("l1iM"), "=_ESTADO!" + simCeldaVista("l1iTasa")],
    ["L1D lectura", "=_ESTADO!B" + simFilaEscalar("l1dRH"), "=_ESTADO!B" + simFilaEscalar("l1dRM"), "=_ESTADO!" + simCeldaVista("l1dRTasa")],
    ["L1D escritura", "=_ESTADO!B" + simFilaEscalar("l1dWH"), "=_ESTADO!B" + simFilaEscalar("l1dWM"), "=_ESTADO!" + simCeldaVista("l1dWTasa")],
    ["L1D total", "=_ESTADO!" + simCeldaVista("l1dHits"), "=_ESTADO!" + simCeldaVista("l1dMiss"), "=_ESTADO!" + simCeldaVista("l1dTasa")],
    ["L2 demanda", "=_ESTADO!B" + simFilaEscalar("l2H"), "=_ESTADO!B" + simFilaEscalar("l2M"), "=_ESTADO!" + simCeldaVista("l2Tasa")]
  ]);
  simPegar_(hoja, 15, 1, [["Mantenimiento write-through", "=_ESTADO!B" + simFilaEscalar("mant")]]);
  hoja.getRange(16, 1).setValue("El mantenimiento no entra en ninguna tasa. IN y OUT no cuentan.");
  simEstiloTitulo_(hoja.getRange(9, 1, 1, 4));
  simProteger_(hoja, []);
}

function simPintarMemoria_(ss) {
  var hoja = simHoja_(ss, "MEMORIA");
  simLimpiarLienzo_(hoja);
  simPegar_(hoja, 1, 1, [
    ["VA", ""],
    ["Traducción", "000H → VPN 0 offset 0"],
    ["Aviso", "=_ESTADO!B" + simFilaEscalar("banner")],
    ["Fallos / write-back", "=_ESTADO!B" + simFilaEscalar("fallos") + "&\" / \"&_ESTADO!B" + simFilaEscalar("writebacks")]
  ]);
  hoja.getRange(3, 2).setBackground("#FFCDD2");
  var cab = ["VPN", "P", "PFN", "Dirty", "Ref", "Orden", "Uso", "Fija"];
  simPegar_(hoja, 6, 1, [cab]);
  simEstiloTitulo_(hoja.getRange(6, 1, 1, 8));
  var filas = [];
  var i;
  var c;
  for (i = 0; i < 16; i++) {
    var fila = [i];
    for (c = 0; c < 7; c++) fila.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_PAG + i));
    filas.push(fila);
  }
  simPegar_(hoja, 7, 1, filas);
  simPegar_(hoja, 24, 1, [
    ["Editar VA (0-511)", ""],
    ["Editar valor (0-255)", ""]
  ]);
  hoja.getRange(24, 2).setNumberFormat("0");
  hoja.getRange(25, 2).setNumberFormat("0");
  var aviso = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("PAGE FAULT")
    .setBackground("#B71C1C")
    .setFontColor("#FFFFFF")
    .setRanges([hoja.getRange(3, 2)])
    .build();
  hoja.setConditionalFormatRules([aviso]);
  hoja.setColumnWidth(1, 180);
  simProteger_(hoja, [hoja.getRange(1, 2), hoja.getRange(24, 2, 2, 1)]);
}

function simPintarEs_(ss) {
  var hoja = simHoja_(ss, "ES");
  simLimpiarLienzo_(hoja);
  simPegar_(hoja, 1, 1, [
    ["Tecla (un carácter o ENTER)", ""],
    ["Cabeza / cola / cuenta", "=_ESTADO!B" + simFilaEscalar("kbdHead") + "&\" / \"&_ESTADO!B" + simFilaEscalar("kbdTail") + "&\" / \"&_ESTADO!B" + simFilaEscalar("kbdCount")],
    ["Cursor LCD", "=_ESTADO!B" + simFilaEscalar("lcdCursor")],
    ["IO del último paso", "=_ESTADO!B" + simFilaEscalar("io")]
  ]);
  var cola = ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7"];
  var lcd = ["F8", "F9", "FA", "FB", "FC", "FD", "FE", "FF"];
  var vals = [];
  var i;
  for (i = 0; i < 8; i++) vals.push("=_ESTADO!" + simColumna_(i + 1) + (SIM_FILA_RAM + 15));
  var valsL = [];
  for (i = 0; i < 8; i++) valsL.push("=_ESTADO!" + simColumna_(i + 9) + (SIM_FILA_RAM + 15));
  simPegar_(hoja, 6, 1, [cola]);
  simPegar_(hoja, 7, 1, [vals]);
  hoja.getRange(8, 1).setValue("LCD");
  simPegar_(hoja, 9, 1, [lcd]);
  simPegar_(hoja, 10, 1, [valsL]);
  var glifos = [];
  for (i = 0; i < 8; i++) glifos.push("=_ESTADO!" + simColumna_(i + 1) + "76");
  simPegar_(hoja, 11, 1, [glifos]);
  hoja.getRange(11, 1, 1, 8).setFontSize(18).setBackground("#1565C0").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  hoja.getRange(13, 1).setValue("VA 1F0H = PA F0H. VA 1F8H = PA F8H. La VPN 15 no se pagina.");
  simProteger_(hoja, [hoja.getRange(1, 2)]);
}

function simPintarProgramas_(ss) {
  var hoja = simHoja_(ss, "PROGRAMAS");
  if (String(hoja.getRange(4, 1).getValue()) === "Línea") {
    simBotonesPrograma_(hoja);
    return hoja;
  }
  simDescombinar_(hoja);
  simPegar_(hoja, 1, 1, [
    ["Programa", "P1"],
    ["Editor auxiliar. Cargar también está en PANEL. No se borra el texto ya escrito.", ""]
  ]);
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(["P1", "P2", "P3"], true).setAllowInvalid(false).build();
  hoja.getRange(1, 2).setDataValidation(regla);
  simPegar_(hoja, 4, 1, [["Línea", "Etiqueta", "Instrucción", "Comentario"]]);
  simEstiloTitulo_(hoja.getRange(4, 1, 1, 4));
  var nums = [];
  var i;
  for (i = 0; i < 40; i++) nums.push([i + 1]);
  if (!String(hoja.getRange(5, 1).getValue() || "")) simPegar_(hoja, 5, 1, nums);
  simPegar_(hoja, 4, 6, [["VA", "Bytes", "Texto"]]);
  simEstiloTitulo_(hoja.getRange(4, 6, 1, 3));
  hoja.getRange(4, 10).setValue("Errores").setFontWeight("bold");
  hoja.setColumnWidth(3, 280);
  hoja.setColumnWidth(8, 320);
  simBotonesPrograma_(hoja);
  simProteger_(hoja, [hoja.getRange(1, 2), hoja.getRange(3, 2, 1, 5), hoja.getRange(5, 2, 40, 3)]);
}

function simBotonesPrograma_(hoja) {
  if (!hoja) return;
  if (String(hoja.getRange(3, 1).getValue()) === "P1") return;
  simPegar_(hoja, 3, 1, [["P1", "", "P2", "", "P3"]]);
  hoja.getRange(3, 2).insertCheckboxes();
  hoja.getRange(3, 4).insertCheckboxes();
  hoja.getRange(3, 6).insertCheckboxes();
}

function simPintarTraza_(ss) {
  var hoja = simHoja_(ss, "TRACE");
  simLimpiarLienzo_(hoja);
  var cab = ["#", "Fase", "PC", "IR", "MAR", "MDR", "AX", "BX", "CX", "DX", "ZF", "CF", "SF", "Palabra", "VA", "PA", "PF", "Caché", "Evento"];
  simPegar_(hoja, 1, 1, [cab]);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, cab.length));
  var filas = [];
  var r;
  var c;
  for (r = 0; r < SIM_TRAZA_MAX; r++) {
    var fila = [];
    for (c = 0; c < cab.length; c++) {
      fila.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_TRAZA + r));
    }
    filas.push(fila);
  }
  simPegar_(hoja, 2, 1, filas);
  hoja.setFrozenRows(1);
  var pf = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Si")
    .setBackground("#FFCDD2")
    .setRanges([hoja.getRange(2, 17, SIM_TRAZA_MAX, 1)])
    .build();
  hoja.setConditionalFormatRules([pf]);
  simProteger_(hoja, []);
}

function simEditorTexto_(ss) {
  var hoja = ss.getSheetByName("PROGRAMAS");
  var vals = hoja.getRange(5, 2, 40, 3).getValues();
  var lineas = [];
  var i;
  for (i = 0; i < vals.length; i++) {
    var et = String(vals[i][0] || "").trim();
    var ins = String(vals[i][1] || "").trim();
    var com = String(vals[i][2] || "").trim();
    if (!et && !ins && !com) continue;
    var texto = "";
    if (et) texto += et.replace(/:$/, "") + ":";
    if (ins) texto += (texto ? " " : "") + ins;
    if (com) texto += (texto ? " " : "") + "; " + com;
    lineas.push(texto);
  }
  return lineas.join("\n");
}

function simVolcarListado_(ss, resultado) {
  var hoja = ss.getSheetByName("PROGRAMAS");
  hoja.getRange(5, 6, 40, 3).clearContent();
  hoja.getRange(5, 10, 40, 1).clearContent();
  var filas = [];
  var i;
  var lista = resultado.listado || [];
  for (i = 0; i < Math.min(lista.length, 40); i++) {
    var bytes = lista[i].bytes.map(function (b) { return simHex(b, 2); }).join(" ");
    filas.push([simHex(lista[i].va, 3) + "H", bytes, lista[i].texto]);
  }
  if (filas.length) {
    hoja.getRange(5, 6, filas.length, 3).setNumberFormat("@");
    simPegar_(hoja, 5, 6, filas);
  }
  var errs = resultado.errores || [];
  if (errs.length) {
    var col = [];
    for (i = 0; i < errs.length; i++) col.push([errs[i]]);
    simPegar_(hoja, 5, 10, col);
  }
}

function simTraerPrograma() {
  var ss = simLibro_();
  var id = String(ss.getSheetByName("PROGRAMAS").getRange(1, 2).getValue() || "P1");
  var prog = simBuscarPrograma(id);
  if (!prog) throw new Error("Elija P1, P2 o P3.");
  var filas = [];
  var i;
  for (i = 0; i < 40; i++) {
    if (i < prog.lineas.length) {
      var p = simParseLinea(prog.lineas[i]);
      var com = "";
      var crudo = prog.lineas[i];
      var semi = crudo.indexOf(";");
      if (semi >= 0) com = crudo.slice(semi + 1).trim();
      filas.push([p.etiqueta, p.mnemonico ? (p.mnemonico + (p.resto ? " " + p.resto : "")) : "", com]);
    } else filas.push(["", "", ""]);
  }
  simPegar_(ss.getSheetByName("PROGRAMAS"), 5, 2, filas);
}

function simEnsamblarHoja() {
  var ss = simLibro_();
  var texto = simEditorTexto_(ss);
  var asm = simEnsamblar(texto);
  simVolcarListado_(ss, asm);
  return asm.ok ? "Ensamblado correcto." : asm.errores.join("\n");
}

function simCargarHoja() {
  var ss = simLibro_();
  return simConCandado_(function () {
    var texto = simEditorTexto_(ss);
    if (!texto.trim()) return "El editor está vacío. Traiga un programa o use Cargar de cero en PANEL.";
    var e = simLeerEstado_(ss);
    var nombre = String(ss.getSheetByName("PROGRAMAS").getRange(1, 2).getValue() || "");
    var r = simCargarTexto(e, texto, nombre);
    simVolcarListado_(ss, r);
    if (!r.ok) return r.errores.join("\n");
    simEscribirEstado_(ss, e);
    return "Programa cargado en el swap. Las páginas de código siguen ausentes.";
  });
}

function simStep() {
  var ss = simLibro_();
  simConCandado_(function () {
    var e = simLeerEstado_(ss);
    if (e.fase === "HALT" || e.fase === "ERROR") return;
    e.stop = 0;
    simMicroPaso(e);
    simEscribirEstado_(ss, e);
  });
}

function simRun() {
  var ss = simLibro_();
  var t0 = Date.now();
  var n = 0;
  var seguir = true;
  var lote = 20;
  if (simLeerStop_(ss)) {
    ss.getSheetByName("_ESTADO").getRange(simFilaEscalar("stop"), 2).setValue(0);
  }
  while (seguir && n < SIM_RUN_PASOS && (Date.now() - t0) < SIM_RUN_MS) {
    simConCandado_(function () {
      if (simLeerStop_(ss)) {
        seguir = false;
        return;
      }
      var e = simLeerEstado_(ss);
      if (e.fase === "HALT" || e.fase === "ERROR") {
        seguir = false;
        return;
      }
      e.stop = 0;
      var k = 0;
      while (k < lote && n < SIM_RUN_PASOS) {
        simMicroPaso(e);
        n++;
        k++;
        if (e.fase === "HALT" || e.fase === "ERROR" || e.fase === "STOP") break;
      }
      if (e.fase === "HALT" || e.fase === "ERROR" || e.fase === "STOP") seguir = false;
      simEscribirEstado_(ss, e);
    });
    if (SpreadsheetApp.flush) SpreadsheetApp.flush();
  }
}

function simStop() {
  var ss = simLibro_();
  var hoja = ss.getSheetByName("_ESTADO");
  if (!hoja) throw new Error("Falta preparar la copia.");
  hoja.getRange(simFilaEscalar("stop"), 2).setValue(1);
}

function simResetHoja() {
  var ss = simLibro_();
  simConCandado_(function () {
    var e = simLeerEstado_(ss);
    simReset(e);
    simEscribirEstado_(ss, e);
  });
}

function simCargarDesdePanel() {
  var ss = simLibro_();
  var panel = ss.getSheetByName("PANEL");
  var id = simIdPrograma_(panel ? panel.getRange(3, 4).getValue() : "");
  if (!id) throw new Error("Elija P1, P2 o P3 en el selector.");
  return simConCandado_(function () {
    var e = simLeerEstado_(ss);
    var r = simCargarCatalogo(e, id);
    if (!r.ok) return r.errores.join("\n");
    simEscribirEstado_(ss, e);
    return "Cargado " + id + " desde el catálogo. El editor no se modificó.";
  });
}

function simTeclearHoja() {
  var ss = simLibro_();
  var panel = ss.getSheetByName("PANEL");
  var texto = panel ? panel.getRange(11, 2).getValue() : "";
  simConCandado_(function () {
    var e = simLeerEstado_(ss);
    var r = simTeclear(e, texto);
    if (!r.ok) e.evento = r.error;
    else if (r.n) e.evento = "Teclas " + r.n;
    else e.evento = "Tecla " + r.byte;
    simEscribirEstado_(ss, e);
  });
}

function simLimpiarColaHoja() {
  var ss = simLibro_();
  simConCandado_(function () {
    var e = simLeerEstado_(ss);
    simLimpiarCola(e);
    simEscribirEstado_(ss, e);
  });
}

function simEditarHoja() {
  var ss = simLibro_();
  var panel = ss.getSheetByName("PANEL");
  var va = Number(panel.getRange(14, 2).getValue());
  var valor = Number(panel.getRange(15, 2).getValue());
  if (!(va >= 0 && va <= 511) || !(valor >= 0 && valor <= 255)) {
    throw new Error("VA 0..511 y valor 0..255.");
  }
  simConCandado_(function () {
    var e = simLeerEstado_(ss);
    var r = simEditarDireccion(e, va, valor);
    e.evento = "Edición " + r.donde;
    simEscribirEstado_(ss, e);
  });
}

function simProbarEnCopia() {
  var ss = simLibro_();
  var r = simProbarTodo();
  var panel = ss.getSheetByName("PANEL");
  if (panel) {
    panel.getRange(96, 1).setValue(r.ok ? "Pruebas en memoria: OK" : "Pruebas con fallos");
    panel.getRange(96, 2).setValue(r.fallos.join(" | ").slice(0, 500));
  }
  return r.ok ? "OK " + r.total : r.fallos.join("\n");
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Simulador")
    .addItem("Preparar esta copia", "simPrepararEstaCopia")
    .addItem("Traer programa al editor", "simTraerPrograma")
    .addItem("Ensamblar", "simEnsamblarHoja")
    .addItem("Cargar selector (P1-P3)", "simCargarDesdePanel")
    .addItem("Cargar editor", "simCargarHoja")
    .addSeparator()
    .addItem("Step", "simStep")
    .addItem("Run", "simRun")
    .addItem("Stop", "simStop")
    .addItem("Reset", "simResetHoja")
    .addSeparator()
    .addItem("Teclear", "simTeclearHoja")
    .addItem("Limpiar cola", "simLimpiarColaHoja")
    .addItem("Editar memoria", "simEditarHoja")
    .addItem("Correr pruebas en memoria", "simProbarEnCopia")
    .addSeparator()
    .addItem("Laboratorio visual", "simAbrirLab")
    .addToUi();
}

function simEscaparHtml_(texto) {
  return String(texto === null || typeof texto === "undefined" ? "" : texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function simCableLab_(nombre, linea, y) {
  var activo = linea && linea.estado === "EN";
  var color = activo ? "#7CFFB2" : "#8A93A0";
  var trazo = activo ? "" : ' stroke-dasharray="7 5"';
  var detalle = activo ? ("EN " + linea.emisor) : "High-Z";
  return '<text x="24" y="' + y + '" fill="#D5DDE6" font-size="14">' + simEscaparHtml_(nombre) + '</text>' +
    '<line x1="250" y1="' + (y - 4) + '" x2="620" y2="' + (y - 4) + '" stroke="' + color + '" stroke-width="4"' + trazo + '/>' +
    '<text x="640" y="' + y + '" fill="' + color + '" font-size="14">' + simEscaparHtml_(detalle) + '</text>';
}

function simPaginaLab_(evento) {
  var buses = evento.buses;
  var ctrl = evento.control;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#0E141B;color:#E8EEF4;font-family:sans-serif">' +
    '<svg viewBox="0 0 980 420" width="100%" height="420">' +
    '<rect x="16" y="16" width="280" height="250" rx="8" fill="#1A2332" stroke="#1565C0"/>' +
    '<text x="28" y="42" fill="#90CAF9" font-size="16">CPU</text>' +
    '<text x="28" y="78" fill="#E3F2FD" font-size="14">PC ' + evento.pc + '  AX ' + evento.ax + '  BX ' + evento.bx + '</text>' +
    '<text x="28" y="102" fill="#E3F2FD" font-size="14">CX ' + evento.cx + '  DX ' + evento.dx + '</text>' +
    '<text x="28" y="126" fill="#E3F2FD" font-size="14">MAR ' + evento.mar + '  MDR ' + evento.mdr + '</text>' +
    '<polygon points="40,190 150,160 260,190 220,240 80,240" fill="#37474F" stroke="#CE93D8"/>' +
    '<text x="118" y="210" fill="#E1BEE7" font-size="13">ALU</text>' +
    '<rect x="320" y="16" width="640" height="250" rx="8" fill="#0D2137" stroke="#1565C0"/>' +
    '<text x="340" y="42" fill="#90CAF9" font-size="16">RAM</text>' +
    simCableLab_("Dirección interna", buses.internoDir, 300) +
    simCableLab_("Datos internos", buses.internoDat, 334) +
    simCableLab_("Dirección a memoria", buses.memoriaDir, 368) +
    simCableLab_("Datos a memoria", buses.memoriaDat, 402) +
    '</svg>' +
    '<p style="padding:0 24px">Fase ' + simEscaparHtml_(evento.fase) +
    ' · RD ' + ctrl.rd + ' WR ' + ctrl.wr + ' CK ' + ctrl.ck + ' IO ' + ctrl.io +
    ' · AX ' + evento.ax + ' BX ' + evento.bx + ' CX ' + evento.cx + ' DX ' + evento.dx +
    ' · ' + simEscaparHtml_(evento.evento) + '</p>' +
    '<p style="padding:0 24px"><button onclick="acc(\'simStep\')">Step</button> <button onclick="acc(\'simRun\')">Run</button> <button onclick="acc(\'simStop\')">Pause</button> <button onclick="acc(\'simResetHoja\')">Reset</button></p>' +
    '<script>var ultimo=0;function acc(fn){google.script.run.withSuccessHandler(pintar)[fn]();}' +
    'function pintar(paquete){if(!paquete||paquete.seq===ultimo)return;ultimo=paquete.seq;}' +
    'function ciclo(){google.script.run.withSuccessHandler(function(p){pintar(p);setTimeout(ciclo,p&&p.delay?p.delay:400);}).simPaqueteVisual();}' +
    'ciclo();</script></body></html>';
}

function simAbrirLab() {
  var salida = HtmlService.createHtmlOutputFromFile("Laboratorio").setWidth(1280).setHeight(860);
  SpreadsheetApp.getUi().showModelessDialog(salida, "Laboratorio");
}

function simLabEstado() {
  var ss = simLibro_();
  var e = simLeerEstado_(ss);
  var delay = 280;
  var panel = ss.getSheetByName("PANEL");
  if (panel) {
    var n = Number(panel.getRange(3, 5).getValue());
    if (n >= 40 && n <= 2000) delay = n;
  }
  var rec = e.recs && e.recs.length ? e.recs[e.recs.length - 1] : null;
  return { gen: e.visGen || 0, seq: e.visSeq || 0, delay: delay, fase: e.fase, pausa: e.stop ? 1 : 0, rec: rec, snap: simSnapshotLab(e) };
}

function simLabPaso() {
  var ss = simLibro_();
  return simConCandado_(function () {
    var e = simLeerEstado_(ss);
    if (e.fase === "HALT" || e.fase === "ERROR") {
      return { gen: e.visGen || 0, seq: e.visSeq || 0, fase: e.fase, pausa: 0, rec: null, snap: simSnapshotLab(e) };
    }
    if (simLeerStop_(ss) && e.fase !== "STOP") {
      return { gen: e.visGen || 0, seq: e.visSeq || 0, fase: e.fase, pausa: 1, rec: null, snap: simSnapshotLab(e) };
    }
    var antes = e.visSeq || 0;
    e.stop = 0;
    simMicroPaso(e);
    simEscribirEstado_(ss, e);
    var rec = e.recs && e.recs.length && e.recs[e.recs.length - 1].seq !== antes ? e.recs[e.recs.length - 1] : null;
    return { gen: e.visGen || 0, seq: e.visSeq || 0, fase: e.fase, pausa: 0, error: e.error || "", rec: rec, snap: simSnapshotLab(e) };
  });
}

function simLabReset() {
  var ss = simLibro_();
  return simConCandado_(function () {
    var e = simLeerEstado_(ss);
    simReset(e);
    simEscribirEstado_(ss, e);
    return { gen: e.visGen || 0, seq: 0, snap: simSnapshotLab(e) };
  });
}

function simCargarFuente(id) {
  var ss = simLibro_();
  var prog = simBuscarPrograma(id);
  if (!prog) throw new Error("Elija P1, P2 o P3.");
  var hoja = simHoja_(ss, "PROGRAMAS");
  hoja.getRange(1, 2).setValue(prog.id);
  var filas = [];
  var i;
  for (i = 0; i < 40; i++) {
    if (i < prog.lineas.length) {
      var p = simParseLinea(prog.lineas[i]);
      var com = "";
      var semi = prog.lineas[i].indexOf(";");
      if (semi >= 0) com = prog.lineas[i].slice(semi + 1).trim();
      filas.push([p.etiqueta, p.mnemonico ? (p.mnemonico + (p.resto ? " " + p.resto : "")) : "", com]);
    } else filas.push(["", "", ""]);
  }
  simPegar_(hoja, 5, 2, filas);
  return simConCandado_(function () {
    var e = simLeerEstado_(ss);
    var r = simCargarCatalogo(e, prog.id);
    if (!r.ok) return r.errores.join("\n");
    simEscribirEstado_(ss, e);
    return prog.id;
  });
}

function simPaqueteVisual() {
  var ss = simLibro_();
  var e = simLeerEstado_(ss);
  var delay = 400;
  var panel = ss.getSheetByName("PANEL");
  if (panel) {
    var n = Number(panel.getRange(3, 5).getValue());
    if (n >= 50 && n <= 5000) delay = n;
  }
  return { seq: e.visSeq || 0, delay: delay, recs: e.recs || [], evento: simEventoVisual(e) };
}

function simPulsarDesdeLab(texto) {
  var ss = simLibro_();
  var crudo = String(texto || "");
  return simConCandado_(function () {
    var e = simLeerEstado_(ss);
    var r;
    if (crudo === "Borrar") r = simBorrarTecla(e);
    else if (crudo === "Espacio") r = simTeclear(e, " ");
    else r = simTeclear(e, crudo);
    if (!r.ok) e.evento = r.error;
    else if (crudo === "Borrar") e.evento = "Borrar";
    else if (r.n) e.evento = "Teclas " + r.n;
    else e.evento = "Tecla " + r.byte;
    simEscribirEstado_(ss, e);
    return e.evento;
  });
}

function onEdit(e) {
  if (!e || !e.range || String(e.value) !== "TRUE") return;
  var hoja = e.range.getSheet().getName();
  var fila = e.range.getRow();
  var col = e.range.getColumn();
  if (hoja === "PROGRAMAS" && fila === 3) {
    e.range.setValue(false);
    if (col === 2) simCargarFuente("P1");
    else if (col === 4) simCargarFuente("P2");
    else if (col === 6) simCargarFuente("P3");
    return;
  }
  if (hoja === "PERIFERICOS" && (fila === 4 || fila === 6 || fila === 8)) {
    var nombre = String(e.range.getSheet().getRange(fila - 1, col).getValue() || "");
    e.range.setValue(false);
    if (simEsTecla_(nombre)) simPulsarDesdeLab(nombre);
    return;
  }
  if (hoja !== "PANEL" || fila !== 3) return;
  if (col !== 1 && col !== 2 && col !== 3 && col !== 6 && col !== 7) return;
  e.range.setValue(false);
  if (col === 1) simStep();
  else if (col === 2) simRun();
  else if (col === 3) simCargarDesdePanel();
  else if (col === 6) simStop();
  else if (col === 7) simResetHoja();
}

function onSelectionChange(e) {
  if (!e || !e.range) return;
  if (e.range.getSheet().getName() !== "PERIFERICOS") return;
  var texto = String(e.range.getValue() || "");
  if (!simEsTecla_(texto)) return;
  var ahora = new Date().getTime();
  var marca = e.range.getA1Notation() + "|" + texto;
  if (typeof PropertiesService !== "undefined") {
    var props = PropertiesService.getDocumentProperties();
    var prev = String(props.getProperty("simUltimaTecla") || "");
    var partes = prev.split("|");
    if (partes.length >= 3 && partes[0] + "|" + partes[1] === marca && (ahora - Number(partes[2])) < 450) return;
    props.setProperty("simUltimaTecla", marca + "|" + ahora);
  }
  simPulsarDesdeLab(texto);
}
