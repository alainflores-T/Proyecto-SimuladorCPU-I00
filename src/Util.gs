function limpiarFondoRegistros(sheet) {
  // 1. Limpia registros principales y banderas
  var celdasRegistros = [REG_PC, REG_IR, REG_MAR, REG_MDR, REG_AX, REG_BX, FLAG_ZF, FLAG_CF, FLAG_SF];
  for (var i = 0; i < celdasRegistros.length; i++) {
    sheet.getRange(celdasRegistros[i]).setBackground(null);
  }
  
  // 2. Limpia cualquier celda resaltada en la RAM (matriz 16x16)
  sheet.getRange(RAM_START_ROW, RAM_START_COL, 16, 16).setBackground(null);
}
function resaltarCelda(sheet, rango, colorHex) {
  sheet.getRange(rango).setBackground(colorHex);
}

/**
 * Registra una fila completa con todos los datos de la CPU en la pestaña "Historial"
 */
function registrarLogDetallado(sheet, explicacion) {
  // Busca la hoja de historial
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaHistorial = ss.getSheetByName(LOG_SHEET_NAME);
  if (!hojaHistorial) return; 
  
  // Captura el estado actual de todos los registros y componentes
  var estado   = sheet.getRange(CPU_STATE).getValue();
  var pc       = sheet.getRange(REG_PC).getValue();
  var ir       = sheet.getRange(REG_IR).getValue();
  var mar      = sheet.getRange(REG_MAR).getValue();
  var mdr      = sheet.getRange(REG_MDR).getValue();
  var ax       = sheet.getRange(REG_AX).getValue();
  var bx       = sheet.getRange(REG_BX).getValue();
  
  var aluOp1   = sheet.getRange(ALU_OP1).getValue();
  var aluOp2   = sheet.getRange(ALU_OP2).getValue();
  var valorSym = sheet.getRange(ALU_SYM).getValue();
	var aluSym   = valorSym ? "'" + valorSym : "";
  var aluRes   = sheet.getRange(ALU_RES).getValue();
  
  var zf       = sheet.getRange(FLAG_ZF).getValue();
  var cf       = sheet.getRange(FLAG_CF).getValue();
  var sf       = sheet.getRange(FLAG_SF).getValue();
  
  var horaActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");
  
  // Agrega la fila con todos los datos
  hojaHistorial.appendRow([
    horaActual,
    estado,
    explicacion,
    pc, ir, mar, mdr, ax, bx,
    aluOp1, aluOp2, aluSym, aluRes,
    zf, cf, sf
  ]);
}

/**
 * Limpia la tabla de historial conservando solo la fila de encabezados
 */
function limpiarHojaHistorial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaHistorial = ss.getSheetByName(LOG_SHEET_NAME);
  if (!hojaHistorial) return;
  
  var ultimaFila = hojaHistorial.getLastRow();
  if (ultimaFila > 1) {
    hojaHistorial.getRange(2, 1, ultimaFila - 1, 16).clearContent();
  }
}


// Utils.gs - Funciones auxiliares y lectura de RAM
// Redirige todos los eventos de la CPU a la pestaña de Historial/Log sin escribir en Hoja 1
function registrarLog(sheet, mensaje) {
  registrarLogDetallado(sheet, mensaje);
}
/*function registrarLog(sheet, mensaje) {
  var celdaLog = sheet.getRange(LOG_MICRO_OPS);
  var celdaconsole = sheet.getRange(LOG_CONSOLE);
  var logPrevio = celdaLog.getValue();
  celdaLog.setValue("• " + mensaje + "\n" + logPrevio);
  celdaconsole.setValue("• " + mensaje + "\n");
}*/

function animarBus(colorHex) {
  SpreadsheetApp.flush();
  Utilities.sleep(150);
}

/**
 * Crea la pestaña "Historial" si no existe y genera la tabla de encabezados formateada.
 */
function crearEstructuraHistorial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nombreHoja = typeof LOG_SHEET_NAME !== "undefined" ? LOG_SHEET_NAME : "Historial";
  var hojaHistorial = ss.getSheetByName(nombreHoja);
  
  // Si no existe la hoja, la crea
  if (!hojaHistorial) {
    hojaHistorial = ss.insertSheet(nombreHoja);
  }
  
  // Definición exacta de encabezados (Columnas A a P)
  var encabezados = [[
    "Hora",
    "Ciclo / Estado",
    "Acción Realizada",
    "PC",
    "IR",
    "MAR",
    "MDR",
    "AX",
    "BX",
    "ALU Operando 1",
    "ALU Operando 2",
    "ALU Operación",
    "ALU Resultado",
    "ZF (Zero)",
    "CF (Carry)",
    "SF (Sign)"
  ]];
  
  // Escribir los encabezados en la Fila 1
  var rangoEncabezado = hojaHistorial.getRange(1, 1, 1, 16);
  rangoEncabezado.setValues(encabezados);
  
  // Dar formato visual profesional a la cabecera
  rangoEncabezado.setBackground("#1F4E78"); // Azul oscuro
  rangoEncabezado.setFontColor("#FFFFFF"); // Texto blanco
  rangoEncabezado.setFontWeight("bold");
  rangoEncabezado.setHorizontalAlignment("center");
  
  // Congelar la fila 1 para mantener visibles las cabeceras al hacer scroll
  hojaHistorial.setFrozenRows(1);
  
  // Ajustar anchos de columna para que el texto no se corte
  hojaHistorial.setColumnWidth(1, 90);   // Hora
  hojaHistorial.setColumnWidth(2, 120);  // Ciclo / Estado
  hojaHistorial.setColumnWidth(3, 350);  // Acción Realizada (Más ancha para la explicación)
  for (var c = 4; c <= 16; c++) {
    hojaHistorial.setColumnWidth(c, 100); // Resto de columnas de registros y ALU
  }
  
  SpreadsheetApp.flush();
  Logger.log("Estructura de la hoja 'Historial' creada exitosamente.");
}

/**
 * Obtiene el dato de la celda de RAM correspondiente a una dirección HEX
 */
function obtenerDatoRAM(sheet, direccionHex) {
  var dirLimpia = direccionHex.toString().replace("H", "").trim();
  var dirNum = parseInt(dirLimpia, 16);
  
  if (isNaN(dirNum)) return "NOP";
  
  // Cálculo de posición en la matriz 16x16
  var offsetFila = Math.floor(dirNum / 16);
  var offsetCol  = dirNum % 16;
  
  var filaReal = RAM_START_ROW + offsetFila;
  var colReal  = RAM_START_COL + offsetCol;
  
  return sheet.getRange(filaReal, colReal).getValue();
}

/**
 * Retorna el rango de celda correspondiente a la dirección HEX
 */
function obtenerCeldaRAM(direccionHex) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var dirLimpia = direccionHex.toString().replace("H", "").trim();
  var dirNum = parseInt(dirLimpia, 16) || 0;
  
  var offsetFila = Math.floor(dirNum / 16);
  var offsetCol  = dirNum % 16;
  
  return sheet.getRange(RAM_START_ROW + offsetFila, RAM_START_COL + offsetCol);
}

function incrementarPC(sheet, pcActualHex) {
  var dirLimpia = pcActualHex.toString().replace("H", "").trim();
  var num = parseInt(dirLimpia, 16) + 1;
  var nuevoPC = num.toString(16).toUpperCase().padStart(2, '0') + "H";
  sheet.getRange(REG_PC).setValue(nuevoPC);
}

function cambiarFormatoRegistros(formatoDestino) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Agregamos las celdas de la ALU (ALU_OP1, ALU_OP2, ALU_RES) a la lista para que cambien junto a los registros
  var registrosNumericos = [/*REG_PC,*/ /*REG_MAR,*/ REG_MDR, REG_AX, REG_BX, ALU_OP1, ALU_OP2, ALU_RES]; 
  
  for (var i = 0; i < registrosNumericos.length; i++) {
    var celda = sheet.getRange(registrosNumericos[i]);
    var val = String(celda.getValue()).trim();
    
    // Ignora celdas vacías o instrucciones de texto (ej. "LD AX, 20H")
    if (val === "" || val.indexOf(" ") !== -1) continue; 
    
    var numDec = NaN;
    if (val.endsWith("H")) numDec = parseInt(val.replace("H", ""), 16);
    else if (val.endsWith("B")) numDec = parseInt(val.replace("B", ""), 2);
    else if (!isNaN(val)) numDec = parseInt(val, 10);
    
    if (!isNaN(numDec)) {
      var num8Bits = numDec & 0xFF; // Limita a 8 bits
      if (formatoDestino === "HEX") {
        celda.setValue(num8Bits.toString(16).toUpperCase().padStart(2, '0') + "H");
      } else if (formatoDestino === "BIN") {
        celda.setValue(num8Bits.toString(2).padStart(8, '0') + "B");
      } else if (formatoDestino === "DEC") {
        celda.setValue(num8Bits.toString(10));
      }
    }
  }
}

// Actualiza las funciones de los botones para que cambien RAM y Registros a la vez
function RAM_y_Reg_To_HEX() { cambiarFormatoRAM("HEX"); cambiarFormatoRegistros("HEX"); }
function RAM_y_Reg_To_BIN() { cambiarFormatoRAM("BIN"); cambiarFormatoRegistros("BIN"); }
function RAM_y_Reg_To_DEC() { cambiarFormatoRAM("DEC"); cambiarFormatoRegistros("DEC"); }

// --- CONVERSOR DE FORMATOS DE MEMORIA RAM ---
function cambiarFormatoRAM(formatoDestino) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var rangoRAM = sheet.getRange(RAM_START_ROW, RAM_START_COL, 16, 16);
  var data = rangoRAM.getValues();
  
  for (var i = 0; i < 16; i++) {
    for (var j = 0; j < 16; j++) {
      var val = String(data[i][j]).trim();
      
      // Ignorar celdas vacías o instrucciones que contengan espacios (Ej: "ADD AX, BX")
      if (val === "" || val.indexOf(" ") !== -1) continue; 
      
      var numDec = NaN;
      
      // Detectar en qué formato está el número actualmente
      if (val.endsWith("H")) {
        numDec = parseInt(val.replace("H", ""), 16);
      } else if (val.endsWith("B")) {
        numDec = parseInt(val.replace("B", ""), 2);
      } else if (!isNaN(val)) {
        numDec = parseInt(val, 10);
      }
      
      // Si es un número válido, convertirlo al destino seleccionado (máximo 8 bits / 255)
      if (!isNaN(numDec)) {
        var num8Bits = numDec & 0xFF; // Mantiene el límite a 1 Byte
        
        if (formatoDestino === "HEX") {
          data[i][j] = num8Bits.toString(16).toUpperCase().padStart(2, '0') + "H";
        } else if (formatoDestino === "BIN") {
          data[i][j] = num8Bits.toString(2).padStart(8, '0') + "B";
        } else if (formatoDestino === "DEC") {
          data[i][j] = num8Bits.toString(10);
        }
      }
    }
  }
  
  // Escribir los datos modificados de vuelta en bloque (más rápido)
  rangoRAM.setValues(data);
  registrarLog(sheet, "🔄 Formato RAM cambiado a " + formatoDestino);
}

// Estas son las funciones individuales que le asignarás a tus 3 botones nuevos
function RAM_To_HEX() { cambiarFormatoRAM("HEX"); }
function RAM_To_BIN() { cambiarFormatoRAM("BIN"); }
function RAM_To_DEC() { cambiarFormatoRAM("DEC"); }