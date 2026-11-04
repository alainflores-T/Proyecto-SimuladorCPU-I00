// CPU.gs - Núcleo de control de micro-operaciones
// --- FUNCIÓN RUN (Ejecución automática) ---
function runCPU() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var estadoActual = sheet.getRange(CPU_STATE).getValue();
  
  if (estadoActual === "HALT") {
    registrarLog(sheet, "SISTEMA DETENIDO. Presiona Reset antes de volver a ejecutar.");
    return;
  }
  
  registrarLog(sheet, "▶️ EJECUCIÓN AUTOMÁTICA (RUN) INICIADA");
  
  // Ejecuta pasos en bucle hasta que encuentre un HALT
  while (estadoActual !== "HALT") {
    limpiarFondoRegistros(sheet); // Limpia colores del paso anterior
    stepCPU();
    SpreadsheetApp.flush(); // Fuerza a Google Sheets a mostrar los cambios en pantalla
    Utilities.sleep(600);   // Pausa de 600ms para que puedas ver qué está pasando
    estadoActual = sheet.getRange(CPU_STATE).getValue();
  }
  
  registrarLog(sheet, "⏹️ EJECUCIÓN AUTOMÁTICA FINALIZADA");
}
function pausarCPU() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.getRange(CPU_STATE).setValue("PAUSE");
  registrarLog(sheet, "⏸️ EJECUCIÓN PAUSADA");
}


function resetCPU() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Garantiza que la pestaña "Historial" exista y esté limpia
  crearEstructuraHistorial();
  limpiarFondoRegistros(sheet);
  limpiarHojaHistorial();

  // Limpiar Registros
  sheet.getRange(REG_PC).setValue("00H");
  sheet.getRange(REG_IR).setValue("00H");
  sheet.getRange(REG_MAR).setValue("00H");
  sheet.getRange(REG_MDR).setValue("00H");
  sheet.getRange(REG_AX).setValue("00H");
  sheet.getRange(REG_BX).setValue("00H");
  
  // Limpiar Flags
  sheet.getRange(FLAG_ZF).setValue(0);
  sheet.getRange(FLAG_CF).setValue(0);
  sheet.getRange(FLAG_SF).setValue(0);
  
  // Limpiar Memoria RAM
  sheet.getRange(RAM_START_ROW, RAM_START_COL, 16, 16).setValue("");
  // >>> NUEVO: Limpiar la Pila de Instrucciones Visual <<<
  sheet.getRange(STACK_START_ROW, STACK_COL, 16, 1).setValue("").setBackground(null);

  // Limpiar interfaz gráfica de la ALU
  sheet.getRange(ALU_OP1).setValue("");
  sheet.getRange(ALU_OP2).setValue("");
  sheet.getRange(ALU_SYM).setValue("");
  sheet.getRange(ALU_RES).setValue("");
  
  // Limpiar Estado
  sheet.getRange(CPU_STATE).setValue("READY");
}

function stepCPU() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var estadoActual = sheet.getRange(CPU_STATE).getValue();
  
  if (estadoActual === "HALT") {
    registrarLog(sheet, "SISTEMA DETENIDO. Presiona Reset para iniciar otro programa.");
    return;
  }
  
  // >>> BORRA LOS COLORES DEL PASO ANTERIOR ANTES DE EJECUTAR EL SIGUIENTE <<<
  limpiarFondoRegistros(sheet);
  
  switch(estadoActual) {
    case "READY":
    case "STORE":
      faseFetch1(sheet); 
      break;
    case "FETCH_1":
      faseFetch2(sheet); 
      break;
    case "FETCH_2":
      faseFetch3(sheet); 
      break;
    case "FETCH_3":
      faseDecode(sheet); 
      break;
    case "DECODE":
      faseExecute(sheet); 
      break;
    case "EXECUTE":
      faseStore(sheet); 
      break;
  }
  // >>> NUEVO: Actualizar el color de la pila al finalizar cada paso <<<
  actualizarPilaInstrucciones(sheet);
}

// Ejemplo en faseFetch1
function faseFetch1(sheet) {
  sheet.getRange(CPU_STATE).setValue("FETCH_1");
  var pcVal = sheet.getRange(REG_PC).getValue();
  sheet.getRange(REG_MAR).setValue(pcVal);

  resaltarCelda(sheet, REG_MAR, "#C8E6C9");
  
  // Usar el registro detallado
  registrarLogDetallado(sheet, "Paso del PC (" + pcVal + ") al registro de direcciones MAR");
}

// Ejemplo en faseFetch2
function faseFetch2(sheet) {
  sheet.getRange(CPU_STATE).setValue("FETCH_2");
  var marVal = sheet.getRange(REG_MAR).getValue();
  var datoRAM = obtenerDatoRAM(sheet, marVal);

  sheet.getRange(REG_MDR).setValue(datoRAM);
  resaltarCelda(sheet, REG_MDR, "#FFF59D");
  
  registrarLogDetallado(sheet, "Lectura de RAM en dirección " + marVal + ": Dato obtenido " + datoRAM);
}

// Ejemplo en faseFetch3
function faseFetch3(sheet) {
  sheet.getRange(CPU_STATE).setValue("FETCH_3");
  var mdrVal = sheet.getRange(REG_MDR).getValue();
  var pcVal  = sheet.getRange(REG_PC).getValue();

  sheet.getRange(REG_IR).setValue(mdrVal);
  resaltarCelda(sheet, REG_IR, "#C8E6C9");
  SpreadsheetApp.flush();
 Utilities.sleep(800);

  incrementarPC(sheet, pcVal);
  resaltarCelda(sheet, REG_PC, "#BBDEFB");
  
  registrarLogDetallado(sheet, "Carga de instrucción al registro IR y avance del contador de programa PC");
}

// Ejemplo en faseDecode
function faseDecode(sheet) {
  sheet.getRange(CPU_STATE).setValue("DECODE");
  var irVal = sheet.getRange(REG_IR).getValue();
  var inst = decodificarInstruccion(irVal);
  
  var op = inst.op || "NOP";
  var dest = inst.dest ? inst.dest : "Ninguno";
  var src = inst.src ? inst.src : "Ninguno";
  
  registrarLogDetallado(sheet, "Decodificación: Operación " + op + " sobre destino " + dest + " con origen " + src);
}

function faseExecute(sheet) {
  var irVal = sheet.getRange(REG_IR).getValue();
  var inst = decodificarInstruccion(irVal);
  
  if (inst.op === "HLT") {
    sheet.getRange(CPU_STATE).setValue("HALT");
    registrarLog(sheet, "EXECUTE: HLT - Programa finalizado");
    return;
  }
  
  sheet.getRange(CPU_STATE).setValue("EXECUTE");
  
  if (inst.op === "NOP") {
    registrarLog(sheet, "EXECUTE: NOP (Celda vacía, ignorada)");
    return;
  }
  
  var dest = (inst.dest || "").trim().toUpperCase();
  var src  = (inst.src || "").trim().toUpperCase();
  
  var valAX = sheet.getRange(REG_AX).getValue();
  var valBX = sheet.getRange(REG_BX).getValue();
  
  // 1. Saltos (Control de Flujo)
  if (inst.op === "JMP") {
    sheet.getRange(REG_PC).setValue(dest);
    registrarLog(sheet, "EXECUTE: Salto incondicional a " + dest);
    return;
  }
  else if (inst.op === "JZ") {
    var zf = sheet.getRange(FLAG_ZF).getValue();
    if (zf == 1) {
      sheet.getRange(REG_PC).setValue(dest);
      registrarLog(sheet, "EXECUTE: Salto (JZ) tomado a " + dest);
    } else {
      registrarLog(sheet, "EXECUTE: Salto (JZ) ignorado (ZF=0)");
    }
    return; 
  }
  else if (inst.op === "JNZ") {
    var zf = sheet.getRange(FLAG_ZF).getValue();
    if (zf == 0) {
      sheet.getRange(REG_PC).setValue(dest);
      registrarLog(sheet, "EXECUTE: Salto (JNZ) tomado a " + dest);
    } else {
      registrarLog(sheet, "EXECUTE: Salto (JNZ) ignorado (ZF=1)");
    }
    return;
  }
  else if (inst.op === "JC") {
    var cf = sheet.getRange(FLAG_CF).getValue();
    if (cf == 1) sheet.getRange(REG_PC).setValue(dest);
    return;
  }
  else if (inst.op === "JS") {
    var sf = sheet.getRange(FLAG_SF).getValue();
    if (sf == 1) sheet.getRange(REG_PC).setValue(dest);
    return;
  }
  
  // 2. Operaciones de ALU (ADD, SUB, MOV, INC, DEC, CMP)
  else if (["ADD", "SUB", "MOV", "INC", "DEC", "CMP"].indexOf(inst.op) !== -1) {
    var valOrigen = (src === "BX") ? valBX : ((src === "AX") ? valAX : src);
    var valDestino = (dest === "BX") ? valBX : valAX;
    
    // Cálculo del resultado invocando a la ALU
    var resultado = ejecutarALU(sheet, inst.op, valDestino, valOrigen);
    
    if (inst.op !== "CMP") {
      if (dest === "AX") {
        sheet.getRange(REG_AX).setValue(resultado);
        resaltarCelda(sheet, REG_AX, "#C8E6C9");
      } else if (dest === "BX") {
        sheet.getRange(REG_BX).setValue(resultado);
        resaltarCelda(sheet, REG_BX, "#C8E6C9");
      }
    }
  }
  
// 3. Leer dato de RAM a Registro (Paso a Paso)
  else if (inst.op === "LD" || inst.op === "LOAD") {
    // Paso 1: MAR recibe la dirección de origen
    sheet.getRange(REG_MAR).setValue(src);
    resaltarCelda(sheet, REG_MAR, "#C8E6C9");
    SpreadsheetApp.flush();
    Utilities.sleep(800);
    
    // Paso 2: Extraer dato y cargar al MDR
    var datoRAM = obtenerDatoRAM(sheet, src);
    sheet.getRange(REG_MDR).setValue(datoRAM);
    resaltarCelda(sheet, REG_MDR, "#FFF59D");
    SpreadsheetApp.flush();
    Utilities.sleep(800);
    
    // Paso 3: Enviar el dato del MDR al registro de destino
    if (dest === "AX") {
      sheet.getRange(REG_AX).setValue(datoRAM);
      resaltarCelda(sheet, REG_AX, "#C8E6C9");
    } else if (dest === "BX") {
      sheet.getRange(REG_BX).setValue(datoRAM);
      resaltarCelda(sheet, REG_BX, "#C8E6C9");
    }
  }
  
// 4. Guardar dato de Registro en RAM (Paso a Paso)
  else if (inst.op === "ST" || inst.op === "STORE") {
    var valGuardar = (src === "BX") ? valBX : valAX;
    
    // Paso 1: MAR recibe la dirección de destino
    sheet.getRange(REG_MAR).setValue(dest);
    resaltarCelda(sheet, REG_MAR, "#C8E6C9");
    SpreadsheetApp.flush();
    Utilities.sleep(800);
    
    // Paso 2: MDR almacena el dato a escribir en RAM
    sheet.getRange(REG_MDR).setValue(valGuardar);
    resaltarCelda(sheet, REG_MDR, "#FFF59D");
    SpreadsheetApp.flush();
    Utilities.sleep(800);
    
    // Paso 3: La celda de RAM recibe el valor grabado en MDR
    var celdaRAM = obtenerCeldaRAM(dest);
    if (celdaRAM) {
      celdaRAM.setValue(valGuardar);
      celdaRAM.setBackground("#C8E6C9");
    }
  }
  
  registrarLog(sheet, "EXECUTE: " + inst.op + " completado");
}

function faseStore(sheet) {
  sheet.getRange(CPU_STATE).setValue("STORE");
  //animarBus("#FF9800"); // Bus de Banderas (Naranja)
  registrarLog(sheet, "STORE: Resultado guardado y Banderas actualizadas");
}

function actualizarPilaInstrucciones(sheet) {
  // 1. Limpiar el fondo de toda la pila (16 posiciones)
  sheet.getRange(STACK_START_ROW, STACK_COL, 16, 1).setBackground(null);
  
  var estado = sheet.getRange(CPU_STATE).getValue();
  var pcHex = sheet.getRange(REG_PC).getValue();
  var numPC = parseInt(pcHex.toString().replace("H", "").trim(), 16);
  
  if (isNaN(numPC)) return;
  
  var activeNum = numPC;
  
  // Como el PC se incrementa internamente en la fase FETCH_3, 
  // para las fases posteriores la instrucción que se está ejecutando es (PC - 1).
  var estadosPostIncremento = ["FETCH_3", "DECODE", "EXECUTE", "STORE"];
  if (estadosPostIncremento.indexOf(estado) !== -1) {
    activeNum = numPC - 1; 
  }
  
  // 2. Resaltar la instrucción activa en amarillo
  if (activeNum >= 0 && activeNum < 16) {
    sheet.getRange(STACK_START_ROW + activeNum, STACK_COL).setBackground("#FFEB3B"); 
  }
}