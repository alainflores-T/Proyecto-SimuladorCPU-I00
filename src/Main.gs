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
  simPintarTraza_(ss);
  var ocultar = ["CPU", "BUSES", "CACHE", "MEMORIA", "ES"];
  var i;
  for (i = 0; i < ocultar.length; i++) simOcultarSiExiste_(ss, ocultar[i]);
  var orden = ["PANEL", "PROGRAMAS", "TRACE"];
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
    if (i) s += conEspacio ? "&\" \"" : "&";
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
  var recordar = { prog: "P1", tecla: "", va: "", valor: "" };
  if (previa) {
    recordar.prog = simIdPrograma_(previa.getRange(9, 2).getValue()) || "P1";
    var tecla = previa.getRange(11, 2).getValue();
    recordar.tecla = tecla === true || tecla === false ? "" : tecla;
    recordar.va = previa.getRange(14, 2).getValue();
    recordar.valor = previa.getRange(15, 2).getValue();
  }
  var hoja = simHoja_(ss, "PANEL");
  simLimpiarLienzo_(hoja);
  simPegar_(hoja, 1, 1, [[
    "Simulador CPU simplificado. Nombre y logo: pendientes.",
    "", "", "", "", "", "", ""
  ]]);
  simPegar_(hoja, 2, 1, [[
    "CPU, buses, memoria, RAM, caché y E/S caben en las columnas A-H. Programas y TRACE son auxiliares.",
    "", "", "", "", "", "", ""
  ]]);
  simPegar_(hoja, 4, 1, [
    ["Controles", "La casilla llama a la misma función que el menú."],
    ["Step", ""],
    ["Run", ""],
    ["Stop", ""],
    ["Reset", ""],
    ["Programa", recordar.prog],
    ["Cargar de cero", ""],
    ["Una letra", recordar.tecla],
    ["Teclear", ""],
    ["Limpiar cola", ""],
    ["VA 0-511", recordar.va],
    ["Valor 0-255", recordar.valor],
    ["Editar memoria", ""]
  ]);
  hoja.getRange(6, 3).setValue("Cada 20 pasos; Stop entre grupos.");
  hoja.getRange(10, 3).setValue("Catálogo. No toca el editor.");
  hoja.getRange(11, 3).setValue("ENTER o texto de hasta 8.");
  var casillas = [5, 6, 7, 8, 10, 12, 13, 16];
  var i;
  for (i = 0; i < casillas.length; i++) {
    hoja.getRange(casillas[i], 2).insertCheckboxes();
    hoja.getRange(casillas[i], 2).setBackground("#C8E6C9");
  }
  var lista = SpreadsheetApp.newDataValidation().requireValueInList(["P1", "P2", "P3"], true).setAllowInvalid(false).build();
  var vaRegla = SpreadsheetApp.newDataValidation().requireNumberBetween(0, 511).setAllowInvalid(true).build();
  var valRegla = SpreadsheetApp.newDataValidation().requireNumberBetween(0, 255).setAllowInvalid(true).build();
  hoja.getRange(9, 2).setDataValidation(lista).setBackground("#FFF9C4");
  hoja.getRange(11, 2).setBackground("#FFF9C4");
  hoja.getRange(14, 2).setDataValidation(vaRegla).setBackground("#FFF9C4");
  hoja.getRange(15, 2).setDataValidation(valRegla).setBackground("#FFF9C4");

  var cpu = [
    ["CPU", "Un núcleo. Step es un micro-paso.", "", ""],
    ["PC pide la instrucción. MAR la dirige. MDR recibe el byte. ALU opera AX-DX.", "", "", ""],
    ["Registro", "Valor", "Binario", "Unidad"],
    ["PC", simRefVista_("pcHex"), simRefVista_("pcBin"), "9 bits"],
    ["MAR", simRefVista_("marHex"), simRefVista_("marBin"), "9 bits"],
    ["MDR", simRefVista_("mdrHex"), simRefVista_("mdrBin"), "8 bits"],
    ["IR", simRefEsc_("textoIR"), simRefVista_("irHex"), "16 bits"],
    ["AX", simRefVista_("axHex"), simRefVista_("axBin"), "8 bits"],
    ["BX", simRefVista_("bxHex"), simRefVista_("bxBin"), "8 bits"],
    ["CX", simRefVista_("cxHex"), simRefVista_("cxBin"), "8 bits"],
    ["DX", simRefVista_("dxHex"), simRefVista_("dxBin"), "8 bits"],
    ["ZF CF SF", simRefVista_("flagsTxt"), "", "banderas"],
    ["Fase", simRefEsc_("fase"), "", "micro-paso"],
    ["Palabra 28b", simRefEsc_("palabra"), simRefUnidos_(SIM_FILA_BITS, 1, SIM_SENALES.length, false), ""],
    ["Evento", simRefEsc_("evento"), "", "texto del paso"],
    ["Último fallo", simRefEsc_("banner"), "", "Histórico"]
  ];
  simPegar_(hoja, 4, 4, cpu);
  hoja.getRange(7, 6, 8, 1).setNumberFormat("@");
  hoja.getRange(17, 6).setNumberFormat("@");
  hoja.getRange(19, 5).setBackground("#FFF8E1");
  hoja.getRange(20, 4).setValue("Dato histórico del último fallo. En HLT no es una alerta.");

  var buses = [
    ["Buses", "ZZ = alta impedancia: nadie conduce.", "", ""],
    ["Interno: dirección de 9 bits. Externo: 8 bits, ya física.", "", "", ""],
    ["Bus", "Emisor", "Valor", "Lectura"],
    ["Dirección interna", simRefEsc_("emDirI"), simRefVista_("dirI"), "ZZ o HEX"],
    ["Datos internos", simRefEsc_("emDatI"), simRefVista_("datI"), "ZZ o HEX"],
    ["Dirección externa", simRefEsc_("emDirE"), simRefVista_("dirE"), "física"],
    ["Datos externos", simRefEsc_("emDatE"), simRefVista_("datE"), "RAM, teclado o MDR"],
    ["Read", simRefEsc_("rd"), "", "1 activo, 0 inactivo"],
    ["Write", simRefEsc_("wr"), "", "1 activo, 0 inactivo"],
    ["Clock", simRefEsc_("ck"), "", "1 pulso, 0 reposo"],
    ["IO", simRefEsc_("io"), "", "1 si IN u OUT"]
  ];
  simPegar_(hoja, 22, 1, buses);

  var memoria = [
    ["Memoria virtual", "Tabla de páginas", "", "", "", "", "", ""],
    ["Riesgo: 8 marcos de 32 B, pero solo 0-6 son paginables. El marco 7 es E/S fija (VPN 15). No se afirma la nota plena de G3/G4 sin el docente.", "", "", "", "", "", "", ""],
    ["VPN = VA[8:5]. Offset = VA[4:0]. PA = PFN x 32 + offset. Un fallo carga 32 B y reintenta con el PC quieto.", "", "", "", "", "", "", ""],
    ["VPN", "P", "PFN", "Dirty", "Ref", "Orden", "Uso", "Fija"]
  ];
  var f;
  var c;
  for (f = 0; f < 16; f++) {
    var filaPag = [String(f)];
    for (c = 0; c < 7; c++) filaPag.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_PAG + f));
    memoria.push(filaPag);
  }
  simPegar_(hoja, 34, 1, memoria);

  var ram = [
    ["RAM física", "256 bytes, en decimal", "", "", "", "", "", ""],
    ["16 bytes por fila. Marco 7 empieza en E0H y no se pagina: F0H-F7H teclado, F8H-FFH LCD.", "", "", "", "", "", "", ""],
    ["Dirección", "Bytes", "", "", "", "", "", ""]
  ];
  for (f = 0; f < 16; f++) {
    var dir = f * 16;
    var marco = Math.floor(dir / 32);
    var et = simHex(dir, 2) + "H";
    if (dir % 32 === 0) et = "Marco " + marco + " " + et;
    if (marco === 7 && dir % 32 === 0) et = "Marco 7 E/S " + simHex(dir, 2) + "H";
    ram.push([et, simRefUnidos_(SIM_FILA_RAM + f, 1, 16, true), "", "", "", "", "", ""]);
  }
  simPegar_(hoja, 55, 1, ram);

  var cache = [
    ["Caché", "Después de la MMU. L1I código, L1D datos, L2 unificada.", "", "", "", "", "", ""],
    ["L1: 1 línea de 8 B. L2: 4 líneas de 8 B, directa. Tasa = hits / (hits+misses). El mantenimiento no entra.", "", "", "", "", "", "", ""],
    ["Línea", "V", "Tag", "Base", "Bytes", "", "", ""]
  ];
  for (f = 0; f < 6; f++) {
    var base = SIM_FILA_CACHE + f;
    cache.push([
      "=_ESTADO!A" + base,
      "=_ESTADO!B" + base,
      "=_ESTADO!C" + base,
      "=_ESTADO!D" + base,
      simRefUnidos_(base, 5, 8, true),
      "", "", ""
    ]);
  }
  cache.push(["L1I", simRefVista_("l1iTasa"), "L1D", simRefVista_("l1dTasa"), "L2", simRefVista_("l2Tasa"), "Mant.", simRefEsc_("mant")]);
  simPegar_(hoja, 75, 1, cache);

  var teclado = [];
  var lcd = [];
  for (f = 0; f < 8; f++) {
    teclado.push("=_ESTADO!" + simColumna_(f + 1) + (SIM_FILA_RAM + 15));
    lcd.push("=_ESTADO!" + simColumna_(f + 1) + "76");
  }
  simPegar_(hoja, 86, 1, [
    ["E/S", "IN lee la cola. OUT escribe el LCD. Ninguno pasa por la caché.", "", "", "", "", "", ""],
    ["Teclado VA 1F0H-1F7H. LCD VA 1F8H-1FFH. Cola vacía: 00H. La novena tecla no entra.", "", "", "", "", "", "", ""],
    ["Cabeza", simRefEsc_("kbdHead"), "Cola", simRefEsc_("kbdTail"), "Cuenta", simRefEsc_("kbdCount"), "Cursor", simRefEsc_("lcdCursor")],
    ["F0", "F1", "F2", "F3", "F4", "F5", "F6", "F7"],
    teclado,
    ["LCD", "", "", "", "", "", "", ""],
    lcd
  ]);

  simEstiloTitulo_(hoja.getRange(1, 1, 1, 8));
  simEstiloTitulo_(hoja.getRange(4, 4, 1, 4));
  simEstiloTitulo_(hoja.getRange(22, 1, 1, 4));
  simEstiloTitulo_(hoja.getRange(34, 1, 1, 8));
  simEstiloTitulo_(hoja.getRange(55, 1, 1, 8));
  simEstiloTitulo_(hoja.getRange(75, 1, 1, 8));
  simEstiloTitulo_(hoja.getRange(86, 1, 1, 8));
  hoja.getRange(6, 4, 1, 4).setBackground("#1565C0").setFontColor("#FFFFFF");
  hoja.getRange(24, 1, 1, 4).setBackground("#2E7D32").setFontColor("#FFFFFF");
  hoja.getRange(37, 1, 1, 8).setBackground("#EF6C00").setFontColor("#FFFFFF");
  hoja.getRange(57, 1, 1, 8).setBackground("#EF6C00").setFontColor("#FFFFFF");
  hoja.getRange(77, 1, 1, 8).setBackground("#6A1B9A").setFontColor("#FFFFFF");
  hoja.getRange(89, 1, 1, 8).setBackground("#00695C").setFontColor("#FFFFFF");
  hoja.getRange(7, 5, 8, 2).setBackground("#E3F2FD");
  hoja.getRange(25, 3, 4, 1).setBackground("#E8F5E9");
  hoja.getRange(35, 1, 2, 8).setBackground("#FFF3E0");
  hoja.getRange(56, 1, 1, 8).setBackground("#FFF3E0");
  hoja.getRange(76, 1, 1, 8).setBackground("#F3E5F5");
  hoja.getRange(78, 1, 6, 8).setBackground("#F3E5F5");
  hoja.getRange(92, 1, 1, 8).setFontSize(16).setBackground("#E0F2F1").setHorizontalAlignment("center");
  hoja.getRange(4, 1).setFontWeight("bold");

  simUnir_(hoja, 1, 1, 1, 8);
  simUnir_(hoja, 2, 1, 1, 8);
  simUnir_(hoja, 5, 4, 1, 4);
  simUnir_(hoja, 17, 6, 1, 3);
  simUnir_(hoja, 19, 5, 1, 2);
  simUnir_(hoja, 20, 4, 1, 4);
  simUnir_(hoja, 23, 1, 1, 4);
  simUnir_(hoja, 35, 1, 1, 8);
  simUnir_(hoja, 36, 1, 1, 8);
  simUnir_(hoja, 56, 1, 1, 8);
  simUnir_(hoja, 76, 1, 1, 8);
  for (f = 58; f <= 73; f++) simUnir_(hoja, f, 2, 1, 7);
  for (f = 78; f <= 83; f++) simUnir_(hoja, f, 5, 1, 4);
  if (hoja.setRowHeight) {
    hoja.setRowHeight(2, 32);
    hoja.setRowHeight(5, 36);
    hoja.setRowHeight(20, 32);
    hoja.setRowHeight(23, 32);
    hoja.setRowHeight(35, 64);
    hoja.setRowHeight(36, 32);
    hoja.setRowHeight(56, 48);
    hoja.setRowHeight(76, 36);
  }
  var zz = SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("ZZ").setBackground("#B0BEC5").setRanges([hoja.getRange(25, 3, 4, 1)]).build();
  var activo = SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(1).setBackground("#C8E6C9").setRanges([hoja.getRange(29, 2, 4, 1)]).build();
  hoja.setConditionalFormatRules([zz, activo]);
  hoja.setColumnWidth(1, 150);
  hoja.setColumnWidth(2, 136);
  hoja.setColumnWidth(3, 176);
  hoja.setColumnWidth(4, 118);
  hoja.setColumnWidth(5, 136);
  hoja.setColumnWidth(6, 150);
  hoja.setColumnWidth(7, 110);
  hoja.setColumnWidth(8, 100);
  for (c = 9; c <= 16; c++) hoja.setColumnWidth(c, 24);
  hoja.setFrozenRows(1);
  simProteger_(hoja, [
    hoja.getRange(5, 2, 4, 1),
    hoja.getRange(9, 2, 7, 1),
    hoja.getRange(16, 2)
  ]);
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
  if (String(hoja.getRange(4, 1).getValue()) === "Línea") return hoja;
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
  simProteger_(hoja, [hoja.getRange(1, 2), hoja.getRange(5, 2, 40, 3)]);
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
  for (r = 0; r < 80; r++) {
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
    .setRanges([hoja.getRange(2, 17, 80, 1)])
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
  if (filas.length) simPegar_(hoja, 5, 6, filas);
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
    if (simLeerStop_(ss)) e.stop = 1;
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
  while (seguir && n < SIM_RUN_PASOS && (Date.now() - t0) < SIM_RUN_MS) {
    simConCandado_(function () {
      var e = simLeerEstado_(ss);
      if (e.fase === "HALT" || e.fase === "ERROR" || e.fase === "STOP") {
        seguir = false;
        return;
      }
      if (simLeerStop_(ss)) e.stop = 1;
      var k = 0;
      while (seguir && k < lote && n < SIM_RUN_PASOS) {
        if (e.stop && k > 0) break;
        simMicroPaso(e);
        n++;
        k++;
        if (e.fase === "HALT" || e.fase === "ERROR" || e.fase === "STOP" || e.stop) seguir = false;
      }
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
  var id = simIdPrograma_(panel ? panel.getRange(9, 2).getValue() : "");
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
    .addToUi();
}

function onEdit(e) {
  if (!e || !e.range || String(e.value) !== "TRUE") return;
  if (e.range.getSheet().getName() !== "PANEL" || e.range.getColumn() !== 2) return;
  var fila = e.range.getRow();
  if (fila !== 5 && fila !== 6 && fila !== 7 && fila !== 8 && fila !== 10 && fila !== 12 && fila !== 13 && fila !== 16) return;
  e.range.setValue(false);
  if (fila === 5) simStep();
  else if (fila === 6) simRun();
  else if (fila === 7) simStop();
  else if (fila === 8) simResetHoja();
  else if (fila === 10) simCargarDesdePanel();
  else if (fila === 12) simTeclearHoja();
  else if (fila === 13) simLimpiarColaHoja();
  else if (fila === 16) simEditarHoja();
}
