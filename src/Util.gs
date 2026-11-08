function limpiarFondoRegistros(sheet) {
  // 1. Limpia registros principales y banderas
  var celdasRegistros = [REG_PC, REG_IR, REG_MAR, REG_MDR, REG_AX, REG_BX, REG_CX, REG_DX, FLAG_ZF, FLAG_CF, FLAG_SF];
  for (var i = 0; i < celdasRegistros.length; i++) {
    sheet.getRange(celdasRegistros[i]).setBackground(null);
  }
  
  // 2. El fondo de la matriz va a Hoja 1. La hoja recibida puede ser la activa
  // y, si esa pestaña es LOG, no hay que pintar ahí.
  RAMFisica.limpiarFondo();
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
  var cx       = sheet.getRange(REG_CX).getValue();
  var dx       = sheet.getRange(REG_DX).getValue();
  
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
    pc, ir, mar, mdr, ax, bx, cx, dx,
    aluOp1, aluOp2, aluSym, aluRes,
        zf, cf, sf,
    (typeof ultimaPalabraHex !== "undefined" ? ultimaPalabraHex : "000000H")
  ].concat(columnasMemoriaHistorial_(explicacion)));
}

function columnasMemoriaHistorial_(explicacion) {
  var dirVirtual = "—";
  var vpn = "—";
  var pfn = "—";
  var pageFault = "No";
  var l1i = "—";
  var l1d = "—";
  var l2 = "—";
  if (typeof ultimoAccesoMemoria !== "undefined" && ultimoAccesoMemoria) {
    dirVirtual = ultimoAccesoMemoria.dirVirtual;
    vpn = ultimoAccesoMemoria.vpn;
    pfn = ultimoAccesoMemoria.pfn;
    pageFault = ultimoAccesoMemoria.pageFault;
    l1i = ultimoAccesoMemoria.l1i;
    l1d = ultimoAccesoMemoria.l1d;
    l2 = ultimoAccesoMemoria.l2;
  }
  var ex = String(explicacion || "");
  if (ex.indexOf("PAGE FAULT") !== -1) {
    pageFault = "Yes";
    var mVpn = ex.match(/vpn=(\d+)/);
    if (mVpn) vpn = mVpn[1];
    var mPfn = ex.match(/pfn=(\d+)/);
    if (mPfn) pfn = mPfn[1];
    var mDir = ex.match(/PAGE FAULT\s+([0-9A-Fa-f]{1,3})\b/i);
    if (mDir) {
      var hx = mDir[1].toUpperCase();
      while (hx.length < 3) hx = "0" + hx;
      dirVirtual = hx + "H";
    }
  }
  if (ex.indexOf("CACHE L1I HIT") !== -1) l1i = "HIT";
  else if (ex.indexOf("CACHE L1I MISS") !== -1) l1i = "MISS";
  if (ex.indexOf("CACHE L1D HIT") !== -1) l1d = "HIT";
  else if (ex.indexOf("CACHE L1D MISS") !== -1) l1d = "MISS";
  if (ex.indexOf("CACHE L2 HIT") !== -1) l2 = "HIT";
  else if (ex.indexOf("CACHE L2 MISS") !== -1) l2 = "MISS";
  return [dirVirtual, vpn, pfn, pageFault, l1i, l1d, l2];
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
      hojaHistorial.getRange(2, 1, ultimaFila - 1, 26).clearContent();
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
	"CX",
    "DX",
    "ALU Operando 1",
    "ALU Operando 2",
    "ALU Operación",
    "ALU Resultado",
    "ZF (Zero)",
    "CF (Carry)",
    "SF (Sign)",
	"Palabra de Control",
    "Dirección Virtual",
    "VPN",
    "PFN",
    "Page Fault",
    "L1I",
    "L1D",
    "L2"
  ]];
  
  // Escribir los encabezados en la Fila 1
  var rangoEncabezado = hojaHistorial.getRange(1, 1, 1, 26);
  hojaHistorial.setColumnWidth(19, 130);
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
    for (var c = 4; c <= 18; c++) {
    hojaHistorial.setColumnWidth(c, 100); // Resto de columnas de registros y ALU
  }
  for (var extra = 20; extra <= 26; extra++) {
    hojaHistorial.setColumnWidth(extra, 120);
  }
  
  SpreadsheetApp.flush();
  Logger.log("Estructura de la hoja 'Historial' creada exitosamente.");
}

/**
 * Lectura de RAM usada por el bus. La celda sale de readPhysical (Hoja 1).
 * El argumento sheet se conserva porque Buses.gs lo pasa; no elige la pestaña.
 * Una dirección rechazada devuelve "NOP" y no lee fuera de 0..255.
 * "20" no se interpreta como 32. "20H" sí es la dirección 32.
 */
function obtenerDatoRAM(sheet, direccionHex) {
  try {
    return readPhysical(direccionHex);
  } catch (e) {
    var msg = String(e && e.message);
    if (msg.indexOf("MemoriaFisica:") === 0 && msg.indexOf("dirección") !== -1) return "NOP";
    throw e;
  }
}

/**
 * Ya no devuelve un Range de la hoja activa: setValue iría al margen del contrato.
 * getValue y setValue pasan por readPhysical / writePhysical.
 * setBackground solo cambia el color, en Hoja 1.
 */
function obtenerCeldaRAM(direccionHex) {
  var direccion = RAMFisica.direccion(direccionHex);
  return {
    getValue: function () { return readPhysical(direccion); },
    setValue: function (valor) { return writePhysical(direccion, valor); },
    setBackground: function (color) { RAMFisica.pintarFondo(direccion, color); }
  };
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
    var registrosNumericos = [REG_MDR, REG_AX, REG_BX, REG_CX, REG_DX, ALU_OP1, ALU_OP2, ALU_RES]; 
  
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
  var sheet = RAMFisica.hoja();
  var data = RAMFisica.leerBloque();
  
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
  
  // Un solo setValues, por el acceso central, sobre Hoja 1.
  RAMFisica.escribirBloque(data);
  registrarLog(sheet, "🔄 Formato RAM cambiado a " + formatoDestino);
}

// Estas son las funciones individuales que le asignarás a tus 3 botones nuevos
function RAM_To_HEX() { cambiarFormatoRAM("HEX"); }
function RAM_To_BIN() { cambiarFormatoRAM("BIN"); }
function RAM_To_DEC() { cambiarFormatoRAM("DEC"); }
