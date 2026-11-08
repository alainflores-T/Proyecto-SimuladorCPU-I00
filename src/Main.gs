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

function simMapaPanel_() {
  var vmNota = 35;
  var vmDatos = 38;
  var vmAlta = 55;
  var pagFila = 72;
  var logFila = 90;
  return {
    ctrlFila: 3,
    step: [3, 2],
    run: [3, 3],
    load: [3, 4],
    prog: [3, 5],
    delay: [3, 7],
    pause: [3, 9],
    reset: [3, 11],
    regFila: 5,
    pcFila: 6,
    pcCol: 3,
    palabraFila: 14,
    palabraCol: 3,
    aluFila: 16,
    falloFila: 21,
    falloCol: 4,
    busFila: 24,
    busValorFila: 26,
    busValorCol: 4,
    ramEncabezadoFila: 5,
    ramEncabezadoCol: 7,
    ramFila: 6,
    ramCol: 8,
    cacheFila: 24,
    cacheBytesFila: 26,
    cacheBytesCol: 11,
    vmNotaFila: vmNota,
    vmNotaCol: 7,
    vmActivaFila: 36,
    vmDatosFila: vmDatos,
    vmAltaFila: vmAlta,
    pagFila: pagFila,
    logFila: logFila,
    logCol: 7,
    texto: [104, 8],
    va: [104, 10],
    valor: [104, 12],
    pruebas: [105, 2]
  };
}

function simLeerSelector_(ss) {
  var mapa = simMapaPanel_();
  var previa = ss.getSheetByName("PANEL");
  var prog = "P1";
  var delay = 1000;
  if (previa) {
    prog = simIdPrograma_(previa.getRange(mapa.prog[0], mapa.prog[1]).getValue()) || simIdPrograma_(previa.getRange(3, 4).getValue()) || "P1";
    var d = Number(previa.getRange(mapa.delay[0], mapa.delay[1]).getValue());
    if (!(d >= 50 && d <= 5000)) d = Number(previa.getRange(3, 5).getValue());
    if (d >= 50 && d <= 5000) delay = d;
  }
  var estado = ss.getSheetByName("_ESTADO");
  if (estado && String(estado.getRange(1, 1).getValue()) === SIM_MAGIA) {
    var cargado = simIdPrograma_(estado.getRange(simFilaEscalar("programa"), 2).getValue());
    if (cargado) prog = cargado;
  }
  return { prog: prog, delay: delay, mapa: mapa };
}

function simTasaCelda_(nombre) {
  var ref = simRefVista_(nombre).slice(1);
  return "=IF(" + ref + "=\"—\",\"—\"," + ref + "&\"%\")";
}

function simEstadoBus_(emisor) {
  return "=IF(" + simRefEsc_(emisor).slice(1) + "=\"\",\"High-Z\",\"EN\")";
}

function simEstadoSenal_(nombre) {
  return "=IF(" + simRefEsc_(nombre).slice(1) + "=1,\"EN\",\"inactivo\")";
}

function simFondo_(rango, fondo, color, tam) {
  if (!rango) return rango;
  if (fondo && rango.setBackground) rango.setBackground(fondo);
  if (color && rango.setFontColor) rango.setFontColor(color);
  if (tam && rango.setFontSize) rango.setFontSize(tam);
  if (rango.setHorizontalAlignment) rango.setHorizontalAlignment("center");
  if (rango.setVerticalAlignment) rango.setVerticalAlignment("middle");
  return rango;
}

function simBorde_(rango, color) {
  if (!rango || !rango.setBorder) return;
  try {
    var estilo = SpreadsheetApp.BorderStyle && SpreadsheetApp.BorderStyle.SOLID;
    if (estilo) rango.setBorder(true, true, true, true, true, true, color || "#90A4AE", estilo);
  } catch (err) {}
}

function simPintarPanel_(ss) {
  var elegido = simLeerSelector_(ss);
  var mapa = elegido.mapa;
  var prog = elegido.prog;
  var delay = elegido.delay;
  var hoja = simHoja_(ss, "PANEL");
  simLimpiarLienzo_(hoja);
  if (hoja.setHiddenGridlines) hoja.setHiddenGridlines(true);
  var anchoCol = { 1: 12, 2: 104, 3: 68, 4: 74, 5: 150, 6: 10, 7: 48 };
  var col;
  for (col = 8; col <= 23; col++) anchoCol[col] = 40;
  for (col = 1; col <= 23; col++) hoja.setColumnWidth(col, anchoCol[col]);
  if (hoja.hideColumns) {
    try { hoja.hideColumns(24, 20); } catch (errOcultar) {}
  }
  if (hoja.setRowHeight) {
    hoja.setRowHeight(1, 34);
    hoja.setRowHeight(2, 20);
    hoja.setRowHeight(3, 28);
    hoja.setRowHeight(4, 8);
    for (col = 5; col <= 105; col++) hoja.setRowHeight(col, 22);
    hoja.setRowHeight(mapa.vmNotaFila, 40);
  }
  simFondo_(hoja.getRange(1, 1, 105, 23), "#0B1016", "#E7EEF6", 11);
  hoja.getRange(1, 1).setValue("UNIDAD CENTRAL DE PROCESO - CPU");
  simUnir_(hoja, 1, 1, 1, 23);
  simFondo_(hoja.getRange(1, 1), "#1565C0", "#FFFFFF", 16);
  hoja.getRange(1, 1).setFontWeight("bold");

  var controles = [
    [mapa.step[1], "STEP", "#1565C0", "#FFFFFF", 1],
    [mapa.run[1], "RUN", "#2E7D32", "#FFFFFF", 1],
    [mapa.load[1], "LOAD", "#6A1B9A", "#FFFFFF", 1],
    [mapa.pause[1], "PAUSE", "#F9A825", "#1A1A1A", 2],
    [mapa.reset[1], "RESET", "#C62828", "#FFFFFF", 2]
  ];
  var i;
  for (i = 0; i < controles.length; i++) {
    var celdaCtrl = hoja.getRange(2, controles[i][0]);
    celdaCtrl.setValue(controles[i][1]);
    if (controles[i][4] > 1) simUnir_(hoja, 2, controles[i][0], 1, controles[i][4]);
    simFondo_(celdaCtrl, controles[i][2], controles[i][3], 11);
    celdaCtrl.setFontWeight("bold");
    var casilla = hoja.getRange(3, controles[i][0]);
    casilla.insertCheckboxes();
    simFondo_(casilla, controles[i][2], controles[i][3], 11);
  }
  hoja.getRange(2, 5).setValue("Cargar");
  hoja.getRange(3, 5).setValue(prog);
  var lista = SpreadsheetApp.newDataValidation().requireValueInList(["P1", "P2", "P3"], true).setAllowInvalid(false).build();
  hoja.getRange(3, 5).setDataValidation(lista);
  simFondo_(hoja.getRange(2, 5, 2, 1), "#FFF9C4", "#1A1A1A", 12);
  hoja.getRange(2, 7).setValue("DELAY");
  simUnir_(hoja, 2, 7, 1, 2);
  hoja.getRange(3, 7).setValue(delay);
  simUnir_(hoja, 3, 7, 1, 2);
  simFondo_(hoja.getRange(2, 7, 2, 2), "#FFF9C4", "#1A1A1A", 12);
  hoja.getRange(2, 13).setValue("Fase");
  simUnir_(hoja, 2, 13, 1, 2);
  hoja.getRange(3, 13).setValue(simRefEsc_("fase"));
  simUnir_(hoja, 3, 13, 1, 2);
  hoja.getRange(2, 15).setValue("Evento");
  simUnir_(hoja, 2, 15, 1, 5);
  hoja.getRange(3, 15).setValue(simRefEsc_("evento"));
  simUnir_(hoja, 3, 15, 1, 5);
  hoja.getRange(2, 20).setValue("En CPU");
  hoja.getRange(3, 20).setValue(simRefEsc_("programa"));
  simUnir_(hoja, 2, 20, 1, 4);
  simUnir_(hoja, 3, 20, 1, 4);
  simFondo_(hoja.getRange(2, 13, 2, 11), "#10243F", "#E3F2FD", 11);

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
  simPegar_(hoja, mapa.regFila, 2, regs);
  hoja.getRange(mapa.palabraFila, 2).setValue("Control 28 bits");
  hoja.getRange(mapa.palabraFila, mapa.palabraCol).setNumberFormat("@");
  hoja.getRange(mapa.palabraFila, mapa.palabraCol).setValue(simRefUnidos_(SIM_FILA_BITS, 1, SIM_SENALES.length, false));
  simUnir_(hoja, mapa.palabraFila, mapa.palabraCol, 1, 3);
  hoja.getRange(mapa.pcFila, 5, 8, 1).setNumberFormat("@");
  if (hoja.getRange(mapa.pcFila, 5).setFontFamily) hoja.getRange(mapa.pcFila, 5, 8, 1).setFontFamily("Roboto Mono");
  simFondo_(hoja.getRange(mapa.regFila, 2, 1, 4), "#1565C0", "#FFFFFF", 11);
  simFondo_(hoja.getRange(mapa.pcFila, 2, 8, 4), "#1A2332", "#E3F2FD", 12);
  simFondo_(hoja.getRange(mapa.palabraFila, 2, 1, 4), "#0D2137", "#B3E5FC", 10);
  simBorde_(hoja.getRange(mapa.regFila, 2, 10, 4), "#1565C0");

  simPegar_(hoja, mapa.aluFila, 2, [
    ["UNIDAD ARITMETICO-LOGICA", "", "", ""],
    ["Operando #1", simRefEsc_("aluA"), "Operando #2", simRefEsc_("aluB")],
    ["", "Op", simRefEsc_("aluOp"), ""],
    ["", "Resultado", simRefEsc_("aluR"), ""],
    ["ZF", simRefEsc_("zf"), "CF", simRefEsc_("cf")],
    ["SF", simRefEsc_("sf"), "Último fallo", simRefEsc_("banner")]
  ]);
  simUnir_(hoja, mapa.aluFila, 2, 1, 4);
  simFondo_(hoja.getRange(mapa.aluFila, 2, 6, 4), "#1A2332", "#E7EEF6", 11);
  simFondo_(hoja.getRange(mapa.aluFila, 2), "#37474F", "#FFFFFF", 11);
  simFondo_(hoja.getRange(mapa.aluFila + 1, 3), "#A5D6A7", "#1B5E20", 12);
  simFondo_(hoja.getRange(mapa.aluFila + 1, 5), "#90CAF9", "#0D47A1", 12);
  simFondo_(hoja.getRange(mapa.aluFila + 2, 2), "#1A2332", "#90A4AE", 11);
  simFondo_(hoja.getRange(mapa.aluFila + 2, 5), "#1A2332", "#90A4AE", 11);
  simFondo_(hoja.getRange(mapa.aluFila + 2, 3, 1, 2), "#78909C", "#FFFFFF", 12);
  simFondo_(hoja.getRange(mapa.aluFila + 3, 2), "#1A2332", "#E7EEF6", 11);
  simFondo_(hoja.getRange(mapa.aluFila + 3, 5), "#1A2332", "#E7EEF6", 11);
  simFondo_(hoja.getRange(mapa.aluFila + 3, 3, 1, 2), "#6A1B9A", "#F3E5F5", 12);
  simFondo_(hoja.getRange(mapa.falloFila - 1, 2, 2, 4), "#10243F", "#E3F2FD", 11);
  hoja.getRange(mapa.falloFila, mapa.falloCol + 1).setBackground("#FFF8E1").setFontColor("#1A1A1A");
  simBorde_(hoja.getRange(mapa.aluFila, 2, 6, 4), "#CE93D8");

  var buses = [
    ["Buses", "", "", ""],
    ["Nombre", "Emisor", "Valor", "Estado"],
    ["Dir. interna → MAR", simRefEsc_("emDirI"), simRefVista_("dirI"), simEstadoBus_("emDirI")],
    ["Datos internos → ALU", simRefEsc_("emDatI"), simRefVista_("datI"), simEstadoBus_("emDatI")],
    ["Dir. memoria → RAM", simRefEsc_("emDirE"), simRefVista_("dirE"), simEstadoBus_("emDirE")],
    ["Datos → MDR", simRefEsc_("emDatE"), simRefVista_("datE"), simEstadoBus_("emDatE")],
    ["Read", simRefEsc_("rd"), simRefEsc_("rd"), simEstadoSenal_("rd")],
    ["Write", simRefEsc_("wr"), simRefEsc_("wr"), simEstadoSenal_("wr")],
    ["Clock", simRefEsc_("ck"), simRefEsc_("ck"), simEstadoSenal_("ck")],
    ["IO", simRefEsc_("io"), simRefEsc_("io"), simEstadoSenal_("io")]
  ];
  simPegar_(hoja, mapa.busFila, 2, buses);
  simUnir_(hoja, mapa.busFila, 2, 1, 4);
  simFondo_(hoja.getRange(mapa.busFila, 2, 1, 4), "#263238", "#FFFFFF", 11);
  simFondo_(hoja.getRange(mapa.busFila + 1, 2, 1, 4), "#37474F", "#FFFFFF", 10);
  simFondo_(hoja.getRange(mapa.busValorFila, 2, 8, 4), "#1A2332", "#E3F2FD", 11);
  simBorde_(hoja.getRange(mapa.busFila, 2, 10, 4), "#90A4AE");
  if (SpreadsheetApp.newConditionalFormatRule) {
    var zonaBus = hoja.getRange(mapa.busValorFila, 5, 8, 1);
    hoja.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("EN").setBackground("#1B5E20").setFontColor("#E8F5E9").setRanges([zonaBus]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("High-Z").setBackground("#263238").setFontColor("#90A4AE").setRanges([zonaBus]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("inactivo").setBackground("#263238").setFontColor("#90A4AE").setRanges([zonaBus]).build()
    ]);
  }

  var ramHead = ["Memoria RAM"];
  var h;
  var f;
  var c;
  for (h = 0; h < 16; h++) ramHead.push(h.toString(16).toUpperCase());
  simPegar_(hoja, mapa.ramEncabezadoFila, mapa.ramEncabezadoCol, [ramHead]);
  var ram = [];
  for (f = 0; f < 16; f++) {
    var fila = [simHex(f * 16, 2) + "h"];
    for (c = 0; c < 16; c++) fila.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_RAM + f));
    ram.push(fila);
  }
  simPegar_(hoja, mapa.ramFila, mapa.ramEncabezadoCol, ram);
  simFondo_(hoja.getRange(mapa.ramEncabezadoFila, mapa.ramEncabezadoCol, 1, 17), "#0D47A1", "#FFFFFF", 11);
  simFondo_(hoja.getRange(mapa.ramFila, mapa.ramCol, 16, 16), "#1565C0", "#FFFFFF", 11);
  simFondo_(hoja.getRange(mapa.ramFila, mapa.ramEncabezadoCol, 16, 1), "#0D2137", "#90CAF9", 10);
  simBorde_(hoja.getRange(mapa.ramEncabezadoFila, mapa.ramEncabezadoCol, 17, 17), "#1565C0");

  hoja.getRange(mapa.cacheFila, mapa.ramEncabezadoCol).setValue("Caché  L1I 8 B   L1D 8 B   L2 4 x 8 B");
  simUnir_(hoja, mapa.cacheFila, mapa.ramEncabezadoCol, 1, 15);
  simFondo_(hoja.getRange(mapa.cacheFila, mapa.ramEncabezadoCol), "#4A148C", "#FFFFFF", 11);
  var cacheCab = ["Línea", "V", "Tag", "Base", "Bytes", "", "", "", "", "", "", "", "HIT", "MISS", "RATE"];
  simPegar_(hoja, mapa.cacheFila + 1, mapa.ramEncabezadoCol, [cacheCab]);
  var cache = [];
  var tasas = [
    [simRefEsc_("l1iH"), simRefEsc_("l1iM"), simTasaCelda_("l1iTasa")],
    [simRefVista_("l1dHits"), simRefVista_("l1dMiss"), simTasaCelda_("l1dTasa")],
    [simRefEsc_("l2H"), simRefEsc_("l2M"), simTasaCelda_("l2Tasa")],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""]
  ];
  for (f = 0; f < 6; f++) {
    var baseCache = SIM_FILA_CACHE + f;
    var lineaCache = [
      "=_ESTADO!A" + baseCache,
      "=_ESTADO!B" + baseCache,
      "=_ESTADO!C" + baseCache,
      "=_ESTADO!D" + baseCache,
      simRefUnidos_(baseCache, 5, 8, true),
      "", "", "", "", "", "", ""
    ];
    lineaCache.push(tasas[f][0], tasas[f][1], tasas[f][2]);
    cache.push(lineaCache);
  }
  simPegar_(hoja, mapa.cacheBytesFila, mapa.ramEncabezadoCol, cache);
  for (f = 0; f < 7; f++) simUnir_(hoja, mapa.cacheFila + 1 + f, mapa.cacheBytesCol, 1, 8);
  simFondo_(hoja.getRange(mapa.cacheFila + 1, mapa.ramEncabezadoCol, 1, 15), "#6A1B9A", "#FFFFFF", 10);
  simFondo_(hoja.getRange(mapa.cacheBytesFila, mapa.ramEncabezadoCol, 6, 15), "#2A1B3D", "#F3E5F5", 11);
  simBorde_(hoja.getRange(mapa.cacheFila, mapa.ramEncabezadoCol, 8, 15), "#CE93D8");

  var notaVm = "Memoria virtual 512 B. Dos mitades de 16 x 16. Marcos 0-6 paginables. El marco 7 es E/S fija.";
  var notaFila = [];
  for (c = 0; c < 17; c++) notaFila.push(c === 0 ? notaVm : "");
  simPegar_(hoja, mapa.vmNotaFila, mapa.vmNotaCol, [notaFila]);
  simUnir_(hoja, mapa.vmNotaFila, mapa.vmNotaCol, 1, 17);
  hoja.getRange(mapa.vmNotaFila, mapa.vmNotaCol).setWrap(true);
  simFondo_(hoja.getRange(mapa.vmNotaFila, mapa.vmNotaCol), "#E65100", "#FFFFFF", 11);
  simPegar_(hoja, mapa.vmActivaFila, mapa.vmNotaCol, [[
    "VM activa, VPN 15",
    "=_ESTADO!" + simColumna_(1) + (SIM_FILA_PAG + 15),
    "marco",
    "=_ESTADO!" + simColumna_(2) + (SIM_FILA_PAG + 15)
  ]]);
  simFondo_(hoja.getRange(mapa.vmActivaFila, mapa.vmNotaCol, 1, 4), "#EF6C00", "#FFFFFF", 11);

  function simMitadVm_(fila, desplazamiento, titulo) {
    var cab = [titulo];
    var n;
    for (n = 0; n < 16; n++) cab.push((desplazamiento + n).toString(16).toUpperCase());
    simPegar_(hoja, fila, mapa.vmNotaCol, [cab]);
    var cuerpo = [];
    var r;
    for (r = 0; r < 16; r++) {
      var vr = [simHex(r * 32 + desplazamiento, 2)];
      for (n = 0; n < 16; n++) vr.push("=_ESTADO!" + simColumna_(desplazamiento + n + 1) + (SIM_FILA_SWAP + r));
      cuerpo.push(vr);
    }
    simPegar_(hoja, fila + 1, mapa.vmNotaCol, cuerpo);
    simFondo_(hoja.getRange(fila, mapa.vmNotaCol, 1, 17), "#0D47A1", "#FFFFFF", 10);
    simFondo_(hoja.getRange(fila + 1, mapa.ramCol, 16, 16), "#0D2137", "#D6E8FF", 10);
    simFondo_(hoja.getRange(fila + 1, mapa.vmNotaCol, 16, 1), "#102A43", "#90CAF9", 10);
    simBorde_(hoja.getRange(fila, mapa.vmNotaCol, 17, 17), "#1565C0");
  }
  simMitadVm_(mapa.vmDatosFila - 1, 0, "+00");
  simMitadVm_(mapa.vmAltaFila - 1, 16, "+10");

  var pag = [["VPN", "P", "PFN", "Dirty", "Ref", "Orden", "Uso", "Fija"]];
  for (f = 0; f < 16; f++) {
    var fp = [String(f)];
    for (c = 0; c < 7; c++) fp.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_PAG + f));
    pag.push(fp);
  }
  simPegar_(hoja, mapa.pagFila, mapa.vmNotaCol, pag);
  simFondo_(hoja.getRange(mapa.pagFila, mapa.vmNotaCol, 1, 8), "#EF6C00", "#FFFFFF", 11);
  simFondo_(hoja.getRange(mapa.pagFila + 1, mapa.vmNotaCol, 16, 8), "#3E2723", "#FFE0B2", 11);
  simBorde_(hoja.getRange(mapa.pagFila, mapa.vmNotaCol, 17, 8), "#EF6C00");

  var log = [["Paso", "Fase", "Bus", "Emisor", "Receptor"]];
  for (f = 0; f < 12; f++) {
    var fl = [];
    for (c = 0; c < 5; c++) fl.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_LOG + f));
    log.push(fl);
  }
  simPegar_(hoja, mapa.logFila, mapa.logCol, log);
  for (f = 0; f < 13; f++) simUnir_(hoja, mapa.logFila + f, mapa.logCol + 4, 1, 5);
  simFondo_(hoja.getRange(mapa.logFila, mapa.logCol, 1, 9), "#263238", "#FFFFFF", 11);
  simFondo_(hoja.getRange(mapa.logFila + 1, mapa.logCol, 12, 9), "#10243F", "#E3F2FD", 10);
  simBorde_(hoja.getRange(mapa.logFila, mapa.logCol, 13, 9), "#90A4AE");

  hoja.getRange(mapa.texto[0], mapa.texto[1] - 1).setValue("Tecla");
  hoja.getRange(mapa.va[0], mapa.va[1] - 1).setValue("VA");
  hoja.getRange(mapa.valor[0], mapa.valor[1] - 1).setValue("Valor");
  simFondo_(hoja.getRange(mapa.texto[0], mapa.texto[1]), "#FFF9C4", "#1A1A1A", 12);
  simFondo_(hoja.getRange(mapa.va[0], mapa.va[1]), "#FFF9C4", "#1A1A1A", 12);
  simFondo_(hoja.getRange(mapa.valor[0], mapa.valor[1]), "#FFF9C4", "#1A1A1A", 12);
  hoja.getRange(mapa.pruebas[0], mapa.pruebas[1]).setValue("");

  if (hoja.setFrozenRows) hoja.setFrozenRows(3);
  simProteger_(hoja, [
    hoja.getRange(mapa.step[0], mapa.step[1]),
    hoja.getRange(mapa.run[0], mapa.run[1]),
    hoja.getRange(mapa.load[0], mapa.load[1]),
    hoja.getRange(mapa.pause[0], mapa.pause[1]),
    hoja.getRange(mapa.reset[0], mapa.reset[1]),
    hoja.getRange(mapa.prog[0], mapa.prog[1]),
    hoja.getRange(mapa.delay[0], mapa.delay[1]),
    hoja.getRange(mapa.texto[0], mapa.texto[1]),
    hoja.getRange(mapa.va[0], mapa.va[1]),
    hoja.getRange(mapa.valor[0], mapa.valor[1])
  ]);
}

function simPintarPerifericos_(ss) {
  var hoja = simHoja_(ss, "PERIFERICOS");
  simLimpiarLienzo_(hoja);
  if (hoja.setHiddenGridlines) hoja.setHiddenGridlines(true);
  var c;
  for (c = 1; c <= 21; c++) hoja.setColumnWidth(c, c % 2 ? 46 : 8);
  simFondo_(hoja.getRange(1, 1, 28, 21), "#0B1016", "#E7EEF6", 11);
  hoja.getRange(1, 1).setValue("PERIFERICOS");
  simUnir_(hoja, 1, 1, 1, 11);
  simFondo_(hoja.getRange(1, 1), "#1565C0", "#FFFFFF", 16);
  var libres = [];
  function ponerFila(fila, teclas, inicio) {
    var i;
    var col = inicio;
    if (hoja.setRowHeight) {
      hoja.setRowHeight(fila, 26);
      hoja.setRowHeight(fila + 1, 22);
    }
    for (i = 0; i < teclas.length; i++) {
      var etiqueta = hoja.getRange(fila, col);
      etiqueta.setValue(teclas[i]);
      simFondo_(etiqueta, "#314052", "#FFFFFF", 12);
      etiqueta.setFontWeight("bold");
      var casilla = hoja.getRange(fila + 1, col);
      casilla.insertCheckboxes();
      simFondo_(casilla, "#1A2430", "#FFFFFF", 10);
      libres.push(casilla);
      col += 2;
    }
  }
  ponerFila(3, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"], 1);
  ponerFila(6, ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"], 3);
  ponerFila(9, ["A", "S", "D", "F", "G", "H", "J", "K", "L"], 3);
  ponerFila(12, ["Z", "X", "C", "V", "B", "N", "M"], 5);
  hoja.getRange(15, 5).setValue("Espacio");
  simUnir_(hoja, 15, 5, 1, 9);
  simFondo_(hoja.getRange(15, 5), "#314052", "#FFFFFF", 12);
  hoja.getRange(16, 5).insertCheckboxes();
  simFondo_(hoja.getRange(16, 5), "#1A2430", "#FFFFFF", 10);
  libres.push(hoja.getRange(16, 5));
  hoja.getRange(15, 17).setValue("Borrar");
  simFondo_(hoja.getRange(15, 17), "#C62828", "#FFFFFF", 12);
  hoja.getRange(16, 17).insertCheckboxes();
  simFondo_(hoja.getRange(16, 17), "#C62828", "#FFFFFF", 10);
  libres.push(hoja.getRange(16, 17));
  if (hoja.setRowHeight) {
    hoja.setRowHeight(5, 8);
    hoja.setRowHeight(8, 8);
    hoja.setRowHeight(11, 8);
    hoja.setRowHeight(14, 8);
    hoja.setRowHeight(15, 26);
    hoja.setRowHeight(22, 36);
  }
  simPegar_(hoja, 18, 1, [[
    "Cabeza", simRefEsc_("kbdHead"),
    "Cola", simRefEsc_("kbdTail"),
    "Cuenta", simRefEsc_("kbdCount"),
    "FIFO F0-F7"
  ]]);
  var fifo = [];
  for (c = 0; c < 8; c++) fifo.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_RAM + 15));
  simPegar_(hoja, 19, 1, [fifo]);
  simFondo_(hoja.getRange(19, 1, 1, 8), "#10243F", "#E3F2FD", 12);
  var lcd = ["LCD"];
  for (c = 0; c < 8; c++) lcd.push("=_ESTADO!" + simColumna_(c + 1) + "76");
  simPegar_(hoja, 21, 1, [lcd]);
  simFondo_(hoja.getRange(22, 1, 1, 8), "#000000", "#39FF14", 18);
  var glifos = [];
  for (c = 0; c < 8; c++) glifos.push("=_ESTADO!" + simColumna_(c + 1) + "76");
  simPegar_(hoja, 22, 1, [glifos]);
  simFondo_(hoja.getRange(22, 1, 1, 8), "#000000", "#39FF14", 18);
  if (hoja.setFrozenRows) hoja.setFrozenRows(1);
  simProteger_(hoja, libres);
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
  var mapaCarga = simMapaPanel_();
  var id = simIdPrograma_(panel ? panel.getRange(mapaCarga.prog[0], mapaCarga.prog[1]).getValue() : "");
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
  var mapaTecla = simMapaPanel_();
  var texto = panel ? panel.getRange(mapaTecla.texto[0], mapaTecla.texto[1]).getValue() : "";
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
  var mapaEd = simMapaPanel_();
  var va = Number(panel.getRange(mapaEd.va[0], mapaEd.va[1]).getValue());
  var valor = Number(panel.getRange(mapaEd.valor[0], mapaEd.valor[1]).getValue());
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
    var mapaPr = simMapaPanel_();
    panel.getRange(mapaPr.pruebas[0], mapaPr.pruebas[1]).setValue(r.ok ? "Pruebas en memoria: OK" : "Pruebas con fallos");
    panel.getRange(mapaPr.pruebas[0], mapaPr.pruebas[1] + 1).setValue(r.fallos.join(" | ").slice(0, 500));
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
    var mapaLab = simMapaPanel_();
    var n = Number(panel.getRange(mapaLab.delay[0], mapaLab.delay[1]).getValue());
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
    var mapaVis = simMapaPanel_();
    var n = Number(panel.getRange(mapaVis.delay[0], mapaVis.delay[1]).getValue());
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
  if (hoja === "PERIFERICOS") {
    if (fila < 2) return;
    var nombre = String(e.range.getSheet().getRange(fila - 1, col).getValue() || "");
    if (!simEsTecla_(nombre)) return;
    e.range.setValue(false);
    simPulsarDesdeLab(nombre);
    return;
  }
  var mapaEdicion = simMapaPanel_();
  if (hoja !== "PANEL" || fila !== mapaEdicion.ctrlFila) return;
  e.range.setValue(false);
  if (col === mapaEdicion.step[1]) simStep();
  else if (col === mapaEdicion.run[1]) simRun();
  else if (col === mapaEdicion.load[1]) simCargarDesdePanel();
  else if (col === mapaEdicion.pause[1]) simStop();
  else if (col === mapaEdicion.reset[1]) simResetHoja();
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
