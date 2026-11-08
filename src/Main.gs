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
  return ss.getSheetByName(nombre) || ss.insertSheet(nombre);
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
  hoja.getRange(SIM_FILA_ESC, 2, esc.length, 1).setValues(esc);
  hoja.getRange(SIM_FILA_RAM, 1, 16, 16).setValues(bloques.ram);
  hoja.getRange(SIM_FILA_SWAP, 1, 16, 32).setValues(bloques.swap);
  hoja.getRange(SIM_FILA_PAG, 1, 16, 7).setValues(bloques.paginas);
  hoja.getRange(SIM_FILA_CACHE, 1, 6, 12).setValues(bloques.cache);
  hoja.getRange(SIM_FILA_TRAZA, 1, SIM_TRAZA_MAX, 19).setValues(bloques.traza);
  var vista = simVistaFilas(e);
  var izq = [];
  var der = [];
  var iVista;
  for (iVista = 0; iVista < vista.length; iVista++) {
    if (iVista < 16) izq.push(vista[iVista]);
    else der.push(vista[iVista]);
  }
  hoja.getRange(SIM_FILA_VISTA, 5, izq.length, 2).setValues(izq);
  if (der.length) hoja.getRange(SIM_FILA_VISTA, 7, der.length, 2).setValues(der);
  var bits = String(e.bits || "");
  var filaBits = [];
  for (iVista = 0; iVista < SIM_SENALES.length; iVista++) filaBits.push(bits.charAt(iVista) || "0");
  hoja.getRange(SIM_FILA_BITS, 1, 1, SIM_SENALES.length).setValues([filaBits]);
  var lcd = [];
  for (iVista = 0; iVista < 8; iVista++) lcd.push(simGlifo(e.ram[0xF8 + iVista]));
  hoja.getRange(76, 1, 1, 8).setValues([lcd]);
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

function simPrepararEstaCopia() {
  var ss = simLibro_();
  var estado = simHoja_(ss, "_ESTADO");
  var ya = String(estado.getRange(1, 1).getValue()) === SIM_MAGIA;
  simPintarEstado_(estado, ya);
  simPintarPanel_(ss);
  simPintarCpu_(ss);
  simPintarBuses_(ss);
  simPintarCache_(ss);
  simPintarMemoria_(ss);
  simPintarEs_(ss);
  simPintarProgramas_(ss);
  simPintarTraza_(ss);
  var orden = ["PANEL", "CPU", "BUSES", "CACHE", "MEMORIA", "ES", "PROGRAMAS", "TRACE", "_ESTADO"];
  var i;
  for (i = 0; i < orden.length; i++) {
    var h = ss.getSheetByName(orden[i]);
    if (h) ss.setActiveSheet(h);
    ss.moveActiveSheet(i + 1);
  }
  estado.hideSheet();
  ss.setActiveSheet(ss.getSheetByName("PANEL"));
  return ya ? "Presentación recuperada. El estado existente se conservó." : "Copia preparada con el estado inicial.";
}

function simPintarEstado_(hoja, conservar) {
  hoja.getRange(1, 1).setValue(SIM_MAGIA);
  var etiquetas = [];
  var i;
  for (i = 0; i < SIM_ESCALARES.length; i++) etiquetas.push([SIM_ESCALARES[i]]);
  hoja.getRange(SIM_FILA_ESC, 1, etiquetas.length, 1).setValues(etiquetas);
  if (!conservar) simEscribirEstado_(hoja.getParent(), simEstadoInicial());
  hoja.setFrozenRows(2);
  hoja.getRange(2, 1, 1, 2).setValues([["campo", "valor"]]).setFontWeight("bold");
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

function simPintarPanel_(ss) {
  var hoja = simHoja_(ss, "PANEL");
  hoja.clear();
  var filas = [
    ["Simulador CPU simplificado"],
    ["Nombre del equipo: pendiente. No se inventa un nombre oficial."],
    ["Logo: pendiente. No hay archivo oficial en esta fase."],
    ["Riesgo R1: marco 7 reservado para E/S. Solo 7 marcos son paginables."],
    ["Estado", "= _ESTADO!B" + simFilaEscalar("fase")],
    ["Programa", "= _ESTADO!B" + simFilaEscalar("programa")],
    ["PC", "=_ESTADO!" + simCeldaVista("pcHex")],
    ["IR", "=_ESTADO!B" + simFilaEscalar("textoIR")],
    ["Micro-palabra", "=_ESTADO!B" + simFilaEscalar("palabra")],
    ["Evento", "=_ESTADO!B" + simFilaEscalar("evento")],
    ["Page fault / aviso", "=_ESTADO!B" + simFilaEscalar("banner")],
    ["AX", "=_ESTADO!" + simCeldaVista("axHex")],
    ["BX", "=_ESTADO!" + simCeldaVista("bxHex")],
    ["CX", "=_ESTADO!" + simCeldaVista("cxHex")],
    ["DX", "=_ESTADO!" + simCeldaVista("dxHex")],
    ["ZF CF SF", "=_ESTADO!" + simCeldaVista("flagsTxt")],
    ["LCD", "=_ESTADO!" + simCeldaVista("lcdTexto")]
  ];
  hoja.getRange(1, 1, filas.length, 2).setValues(filas);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 2));
  var acciones = ["Step", "Run", "Stop", "Reset", "Ensamblar", "Cargar", "Teclear", "Limpiar cola", "Editar memoria", "Preparar"];
  var i;
  for (i = 0; i < acciones.length; i++) simCheck_(hoja, 19 + i, acciones[i]);
  hoja.setColumnWidth(1, 220);
  hoja.setColumnWidth(2, 420);
  hoja.getRange(11, 2).setBackground("#FFCDD2");
  simProteger_(hoja, [hoja.getRange(19, 3, acciones.length, 1)]);
}

function simPintarCpu_(ss) {
  var hoja = simHoja_(ss, "CPU");
  hoja.clear();
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
  hoja.getRange(1, 1, cuerpo.length, 5).setValues(cuerpo);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 5));
  hoja.getRange(14, 1, 4, 2).setValues([
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
  hoja.clear();
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
  hoja.getRange(1, 1, lineas.length, 4).setValues(lineas);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 4));
  var bits = [["Señal", "Bit"]];
  var i;
  for (i = 0; i < SIM_SENALES.length; i++) {
    bits.push([SIM_SENALES[i], "=_ESTADO!" + simColumna_(i + 1) + SIM_FILA_BITS]);
  }
  hoja.getRange(12, 1, bits.length, 2).setValues(bits);
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
  hoja.clear();
  var cab = ["Línea", "V", "Tag", "Base", "B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7"];
  var cuerpo = [cab];
  var i;
  var c;
  for (i = 0; i < 6; i++) {
    var fila = [];
    for (c = 0; c < 12; c++) fila.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_CACHE + i));
    cuerpo.push(fila);
  }
  hoja.getRange(1, 1, cuerpo.length, 12).setValues(cuerpo);
  simEstiloTitulo_(hoja.getRange(1, 1, 1, 12));
  hoja.getRange(9, 1, 6, 4).setValues([
    ["Nivel", "Hits", "Miss", "Tasa"],
    ["L1I", "=_ESTADO!B" + simFilaEscalar("l1iH"), "=_ESTADO!B" + simFilaEscalar("l1iM"), "=_ESTADO!" + simCeldaVista("l1iTasa")],
    ["L1D lectura", "=_ESTADO!B" + simFilaEscalar("l1dRH"), "=_ESTADO!B" + simFilaEscalar("l1dRM"), "=_ESTADO!" + simCeldaVista("l1dRTasa")],
    ["L1D escritura", "=_ESTADO!B" + simFilaEscalar("l1dWH"), "=_ESTADO!B" + simFilaEscalar("l1dWM"), "=_ESTADO!" + simCeldaVista("l1dWTasa")],
    ["L1D total", "=_ESTADO!" + simCeldaVista("l1dHits"), "=_ESTADO!" + simCeldaVista("l1dMiss"), "=_ESTADO!" + simCeldaVista("l1dTasa")],
    ["L2 demanda", "=_ESTADO!B" + simFilaEscalar("l2H"), "=_ESTADO!B" + simFilaEscalar("l2M"), "=_ESTADO!" + simCeldaVista("l2Tasa")]
  ]);
  hoja.getRange(15, 1, 1, 2).setValues([["Mantenimiento write-through", "=_ESTADO!B" + simFilaEscalar("mant")]]);
  hoja.getRange(16, 1).setValue("El mantenimiento no entra en ninguna tasa. IN y OUT no cuentan.");
  simEstiloTitulo_(hoja.getRange(9, 1, 1, 4));
  simProteger_(hoja, []);
}

function simPintarMemoria_(ss) {
  var hoja = simHoja_(ss, "MEMORIA");
  hoja.clear();
  hoja.getRange(1, 1, 4, 2).setValues([
    ["VA", ""],
    ["Traducción", "000H → VPN 0 offset 0"],
    ["Aviso", "=_ESTADO!B" + simFilaEscalar("banner")],
    ["Fallos / write-back", "=_ESTADO!B" + simFilaEscalar("fallos") + "&\" / \"&_ESTADO!B" + simFilaEscalar("writebacks")]
  ]);
  hoja.getRange(3, 2).setBackground("#FFCDD2");
  var cab = ["VPN", "P", "PFN", "Dirty", "Ref", "Orden", "Uso", "Fija"];
  hoja.getRange(6, 1, 1, 8).setValues([cab]);
  simEstiloTitulo_(hoja.getRange(6, 1, 1, 8));
  var filas = [];
  var i;
  var c;
  for (i = 0; i < 16; i++) {
    var fila = [i];
    for (c = 0; c < 7; c++) fila.push("=_ESTADO!" + simColumna_(c + 1) + (SIM_FILA_PAG + i));
    filas.push(fila);
  }
  hoja.getRange(7, 1, 16, 8).setValues(filas);
  hoja.getRange(24, 1, 2, 2).setValues([
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
  hoja.clear();
  hoja.getRange(1, 1, 4, 2).setValues([
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
  hoja.getRange(6, 1, 1, 8).setValues([cola]);
  hoja.getRange(7, 1, 1, 8).setValues([vals]);
  hoja.getRange(8, 1).setValue("LCD");
  hoja.getRange(9, 1, 1, 8).setValues([lcd]);
  hoja.getRange(10, 1, 1, 8).setValues([valsL]);
  var glifos = [];
  for (i = 0; i < 8; i++) glifos.push("=_ESTADO!" + simColumna_(i + 1) + "76");
  hoja.getRange(11, 1, 1, 8).setValues([glifos]);
  hoja.getRange(11, 1, 1, 8).setFontSize(18).setBackground("#1565C0").setFontColor("#FFFFFF").setHorizontalAlignment("center");
  hoja.getRange(13, 1).setValue("VA 1F0H = PA F0H. VA 1F8H = PA F8H. La VPN 15 no se pagina.");
  simProteger_(hoja, [hoja.getRange(1, 2)]);
}

function simPintarProgramas_(ss) {
  var hoja = simHoja_(ss, "PROGRAMAS");
  hoja.clear();
  hoja.getRange(1, 1, 2, 2).setValues([
    ["Programa", "P1"],
    ["Riesgo R1", "El marco 7 no es paginable. P3 no usa la VPN 15."]
  ]);
  var regla = SpreadsheetApp.newDataValidation().requireValueInList(["P1", "P2", "P3"], true).setAllowInvalid(false).build();
  hoja.getRange(1, 2).setDataValidation(regla);
  hoja.getRange(4, 1, 1, 4).setValues([["Línea", "Etiqueta", "Instrucción", "Comentario"]]);
  simEstiloTitulo_(hoja.getRange(4, 1, 1, 4));
  var nums = [];
  var i;
  for (i = 0; i < 40; i++) nums.push([i + 1]);
  hoja.getRange(5, 1, 40, 1).setValues(nums);
  hoja.getRange(4, 6, 1, 3).setValues([["VA", "Bytes", "Texto"]]);
  simEstiloTitulo_(hoja.getRange(4, 6, 1, 3));
  hoja.getRange(4, 10).setValue("Errores").setFontWeight("bold");
  hoja.setColumnWidth(3, 280);
  hoja.setColumnWidth(8, 320);
  simProteger_(hoja, [hoja.getRange(1, 2), hoja.getRange(5, 2, 40, 3)]);
}

function simPintarTraza_(ss) {
  var hoja = simHoja_(ss, "TRACE");
  hoja.clear();
  var cab = ["#", "Fase", "PC", "IR", "MAR", "MDR", "AX", "BX", "CX", "DX", "ZF", "CF", "SF", "Palabra", "VA", "PA", "PF", "Caché", "Evento"];
  hoja.getRange(1, 1, 1, cab.length).setValues([cab]);
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
  hoja.getRange(2, 1, 80, cab.length).setValues(filas);
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
  if (filas.length) hoja.getRange(5, 6, filas.length, 3).setValues(filas);
  var errs = resultado.errores || [];
  if (errs.length) {
    var col = [];
    for (i = 0; i < errs.length; i++) col.push([errs[i]]);
    hoja.getRange(5, 10, col.length, 1).setValues(col);
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
  ss.getSheetByName("PROGRAMAS").getRange(5, 2, 40, 3).setValues(filas);
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
    if (!texto.trim()) {
      simTraerPrograma();
      texto = simEditorTexto_(ss);
    }
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
  while (seguir && n < SIM_RUN_PASOS && (Date.now() - t0) < SIM_RUN_MS) {
    simConCandado_(function () {
      var e = simLeerEstado_(ss);
      if (simLeerStop_(ss)) e.stop = 1;
      if (e.fase === "HALT" || e.fase === "ERROR" || e.fase === "STOP") {
        seguir = false;
        return;
      }
      simMicroPaso(e);
      if (simLeerStop_(ss)) e.stop = 1;
      simEscribirEstado_(ss, e);
      if (e.fase === "HALT" || e.fase === "ERROR" || e.fase === "STOP" || e.stop) seguir = false;
    });
    n++;
    SpreadsheetApp.flush();
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

function simTeclearHoja() {
  var ss = simLibro_();
  var texto = ss.getSheetByName("ES").getRange(1, 2).getValue();
  simConCandado_(function () {
    var e = simLeerEstado_(ss);
    var r = simTeclear(e, texto);
    if (!r.ok) e.evento = r.error;
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
  var mem = ss.getSheetByName("MEMORIA");
  var va = Number(mem.getRange(24, 2).getValue());
  var valor = Number(mem.getRange(25, 2).getValue());
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
    panel.getRange(30, 1).setValue(r.ok ? "Pruebas locales dentro del script: OK" : "Pruebas con fallos");
    panel.getRange(31, 1).setValue(r.fallos.join(" | ").slice(0, 500));
  }
  return r.ok ? "OK " + r.total : r.fallos.join("\n");
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Simulador")
    .addItem("Preparar esta copia", "simPrepararEstaCopia")
    .addItem("Traer programa al editor", "simTraerPrograma")
    .addItem("Ensamblar", "simEnsamblarHoja")
    .addItem("Cargar", "simCargarHoja")
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
  var hoja = e.range.getSheet().getName();
  if (hoja === "MEMORIA" && e.range.getA1Notation() === "B1") {
    var va = Number(e.range.getValue());
    if (va >= 0 && va <= 511) {
      e.range.getSheet().getRange(2, 2).setValue(simHex(va, 3) + "H → VPN " + (va >> 5) + " offset " + (va & 31));
    }
    return;
  }
  if (hoja !== "PANEL" || e.range.getColumn() !== 3) return;
  var fila = e.range.getRow();
  e.range.setValue(false);
  if (fila === 19) simStep();
  else if (fila === 20) simRun();
  else if (fila === 21) simStop();
  else if (fila === 22) simResetHoja();
  else if (fila === 23) simEnsamblarHoja();
  else if (fila === 24) simCargarHoja();
  else if (fila === 25) simTeclearHoja();
  else if (fila === 26) simLimpiarColaHoja();
  else if (fila === 27) simEditarHoja();
  else if (fila === 28) simPrepararEstaCopia();
}
