// Microcodigo.gs - Palabra de control (#32)
var senalIncPC = 0;
var ultimaPalabraHex = "000000H";

function palabraVacia() {
  var w = {};
  for (var i = 0; i < SENALES_CONTROL.length; i++) {
    w[SENALES_CONTROL[i]] = 0;
  }
  return w;
}

function hexPalabra(w) {
  var n = 0;
  for (var i = 0; i < SENALES_CONTROL.length; i++) {
    n = (n * 2) + (w[SENALES_CONTROL[i]] ? 1 : 0);
  }
  var hex = n.toString(16).toUpperCase();
  while (hex.length < 6) hex = "0" + hex;
  return hex + "H";
}

function hexDeLista(nombres) {
  var w = palabraVacia();
  for (var i = 0; i < nombres.length; i++) {
    if (nombres[i]) w[nombres[i]] = 1;
  }
  return hexPalabra(w);
}

function construirPalabraDesdeEstado() {
  var w = palabraVacia();
  var mapaEn = {
    PC: "En_PC", IR: "En_IR", MAR: "En_MAR", MDR: "En_MDR",
    AX: "En_AX", BX: "En_BX", CX: "En_CX", DX: "En_DX",
    ALU: "En_ALU", KBD: "En_KBD"
  };
  var mapaLd = {
    PC: "Ld_PC", IR: "Ld_IR", MAR: "Ld_MAR", MDR: "Ld_MDR",
    AX: "Ld_AX", BX: "Ld_BX", CX: "Ld_CX", DX: "Ld_DX",
    LCD: "Ld_LCD"
  };

  var nombres = Object.keys(estadoBuffers || {});
  for (var i = 0; i < nombres.length; i++) {
    var nombre = nombres[i];
    var buf = estadoBuffers[nombre];
    if (!buf) continue;
    if (buf.en && mapaEn[nombre]) w[mapaEn[nombre]] = 1;
    if (buf.ld && mapaLd[nombre]) w[mapaLd[nombre]] = 1;
  }

  if (typeof ultimasSenalesControl !== "undefined") {
    if (ultimasSenalesControl.rd) w.Mem_R = 1;
    if (ultimasSenalesControl.wr) w.Mem_W = 1;
    if (ultimasSenalesControl.io) w.IO = 1;
  }
  if (senalIncPC) w.INC_PC = 1;

  return w;
}

function inicializarPanelPalabraControl(sheet) {
  sheet.getRange(CW_PANEL_TITLE_CELL).setValue("PALABRA DE CONTROL")
    .setFontWeight("bold").setBackground(CW_COLOR_HEADER).setFontColor("#FFFFFF");
  sheet.getRange(CW_HEX_LABEL_CELL).setValue("HEX").setFontWeight("bold");
  sheet.getRange(CW_HEX_VALUE_CELL).setValue("'000000H").setFontFamily("Roboto Mono");

  var mitad = Math.ceil(SENALES_CONTROL.length / 2);
  for (var i = 0; i < SENALES_CONTROL.length; i++) {
    var colNom = i < mitad ? CW_COL_IZQ_NOM : CW_COL_DER_NOM;
    var colVal = i < mitad ? CW_COL_IZQ_VAL : CW_COL_DER_VAL;
    var fila = CW_BITS_START_ROW + (i < mitad ? i : i - mitad);
    sheet.getRange(fila, colNom).setValue(SENALES_CONTROL[i]).setFontWeight("bold");
    sheet.getRange(fila, colVal).setValue(0)
      .setHorizontalAlignment("center")
      .setBackground(CW_COLOR_INACTIVO)
      .setFontFamily("Roboto Mono");
  }
  sheet.setColumnWidth(CW_COL_IZQ_NOM, 90);
  sheet.setColumnWidth(CW_COL_IZQ_VAL, 50);
  sheet.setColumnWidth(CW_COL_DER_NOM, 90);
  sheet.setColumnWidth(CW_COL_DER_VAL, 50);
}

function publicarPalabraDesdeEstado(sheet) {
  var w = construirPalabraDesdeEstado();
  ultimaPalabraHex = hexPalabra(w);
  sheet.getRange(CW_HEX_VALUE_CELL).setValue("'" + ultimaPalabraHex);

  var mitad = Math.ceil(SENALES_CONTROL.length / 2);
  for (var i = 0; i < SENALES_CONTROL.length; i++) {
    var nombre = SENALES_CONTROL[i];
    var bit = w[nombre] ? 1 : 0;
    var colVal = i < mitad ? CW_COL_IZQ_VAL : CW_COL_DER_VAL;
    var fila = CW_BITS_START_ROW + (i < mitad ? i : i - mitad);
    var celda = sheet.getRange(fila, colVal);
    celda.setValue(bit);
    celda.setBackground(bit ? CW_COLOR_ACTIVO : CW_COLOR_INACTIVO);
    celda.setFontWeight(bit ? "bold" : "normal");
  }
}

function filasTablaMicrocodigo() {
  return [
    ["FETCH_1", "PC → MAR", "En_PC, Ld_MAR", hexDeLista(["En_PC", "Ld_MAR"])],
    ["FETCH_2", "RAM → MDR (lectura)", "Mem_R, Ld_MDR, En_MAR", hexDeLista(["Mem_R", "Ld_MDR", "En_MAR"])],
    ["FETCH_3a", "MDR → IR", "En_MDR, Ld_IR", hexDeLista(["En_MDR", "Ld_IR"])],
    ["FETCH_3b", "PC + 1", "En_ALU, Ld_PC, INC_PC", hexDeLista(["En_ALU", "Ld_PC", "INC_PC"])],
    ["DECODE", "Decodificar IR", "(ninguna)", hexDeLista([])],
    ["MOV (reg)", "Origen → destino (ej. MOV AX, BX)", "En_BX, Ld_AX", hexDeLista(["En_BX", "Ld_AX"])],
    ["MOV (imm)", "Inmediato IR → destino (ej. MOV AX, imm)", "En_IR, Ld_AX", hexDeLista(["En_IR", "Ld_AX"])],
    ["ALU", "Resultado ALU → destino (ADD/SUB/INC/DEC/AND/OR)", "En_ALU, Ld_AX", hexDeLista(["En_ALU", "Ld_AX"])],
    ["CMP", "ALU publica el resultado (no escribe registro)", "En_ALU", hexDeLista(["En_ALU"])],
    ["JMP / Jcc tomado", "Dirección IR → PC", "En_IR, Ld_PC", hexDeLista(["En_IR", "Ld_PC"])],
    ["Jcc no tomado", "No hay transferencia", "(ninguna)", hexDeLista([])],
    ["LD T1", "Dirección (IR) → MAR", "En_IR, Ld_MAR", hexDeLista(["En_IR", "Ld_MAR"])],
    ["LD T2", "RAM → MDR", "Mem_R, Ld_MDR, En_MAR", hexDeLista(["Mem_R", "Ld_MDR", "En_MAR"])],
    ["LD T3", "MDR → registro (ej. AX)", "En_MDR, Ld_AX", hexDeLista(["En_MDR", "Ld_AX"])],
    ["ST T1", "Dirección (IR) → MAR", "En_IR, Ld_MAR", hexDeLista(["En_IR", "Ld_MAR"])],
    ["ST T2", "Dato (ej. AX) → MDR", "En_AX, Ld_MDR", hexDeLista(["En_AX", "Ld_MDR"])],
    ["ST T3", "MDR → RAM (escritura)", "Mem_W, En_MDR, En_MAR", hexDeLista(["Mem_W", "En_MDR", "En_MAR"])],
    ["IN", "Teclado → registro (ej. AX)", "IO, En_KBD, Ld_AX", hexDeLista(["IO", "En_KBD", "Ld_AX"])],
    ["OUT", "Registro (ej. AX) → LCD", "IO, Mem_W, En_AX, Ld_LCD", hexDeLista(["IO", "Mem_W", "En_AX", "Ld_LCD"])],
    ["NOP / HLT", "Sin transferencias", "(ninguna)", hexDeLista([])]
  ];
}

function inicializarHojaMicrocodigo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(MICROCODIGO_SHEET_NAME);
  if (!hoja) hoja = ss.insertSheet(MICROCODIGO_SHEET_NAME);

  hoja.clear();
  hoja.getRange(1, 1, 1, 4).setValues([["Fase / instrucción", "Descripción", "Señales activas", "Palabra HEX"]])
    .setBackground("#7E57C2").setFontColor("#FFFFFF").setFontWeight("bold")
    .setHorizontalAlignment("center");

  var filas = filasTablaMicrocodigo();
  hoja.getRange(2, 1, filas.length, 4).setValues(filas);
  hoja.getRange(2, 4, filas.length, 1).setFontFamily("Roboto Mono").setHorizontalAlignment("center");
  hoja.setFrozenRows(1);
  hoja.setColumnWidth(1, 180);
  hoja.setColumnWidth(2, 420);
  hoja.setColumnWidth(3, 280);
  hoja.setColumnWidth(4, 130);

  var nota = "Bit más significativo = En_PC. Orden: " + SENALES_CONTROL.join(", ") +
    ". En_MAR aparece en lecturas/escrituras porque MAR conduce el bus de direcciones. IN enciende IO y En_KBD. OUT enciende IO y Ld_LCD. El HEX de esta tabla sale de hexDeLista y es el mismo de docs/control-word.md.";
  hoja.getRange(filas.length + 3, 1).setValue(nota);
}

function resetearPalabraControl(sheet) {
  senalIncPC = 0;
  ultimaPalabraHex = "000000H";
  if (typeof ultimasSenalesControl !== "undefined") {
    ultimasSenalesControl = { rd: 0, wr: 0, io: 0 };
  }
  publicarPalabraDesdeEstado(sheet);
}