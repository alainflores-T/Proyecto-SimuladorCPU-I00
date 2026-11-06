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
  sheet.getRange(REG_IR_MAQ).setValue("");
  sheet.getRange(REG_MAR).setValue("00H");
  sheet.getRange(REG_MDR).setValue("00H");
  sheet.getRange(REG_AX).setValue("00H");
  sheet.getRange(REG_BX).setValue("00H");
    sheet.getRange(REG_CX).setValue("00H");
  sheet.getRange(REG_DX).setValue("00H");
  
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
  
  inicializarPanelBuses(sheet);
  resetearBuses(sheet);
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
  var pcVal = transferInterna(sheet, "PC", ["MAR"]);
  resaltarCelda(sheet, REG_MAR, "#C8E6C9");
  registrarLogDetallado(sheet, "Bus interno: PC (" + pcVal + ") → MAR");
}

function faseFetch2(sheet) {
  sheet.getRange(CPU_STATE).setValue("FETCH_2");
  var marVal = sheet.getRange(REG_MAR).getValue();
  var datoRAM = transferLecturaMemoria(sheet);
  resaltarCelda(sheet, REG_MDR, "#FFF59D");
  registrarLogDetallado(sheet, "Bus externo: lectura RAM[" + marVal + "] → MDR (" + datoRAM + ")");
}

function faseFetch3(sheet) {
  sheet.getRange(CPU_STATE).setValue("FETCH_3");
  var mdrVal = transferInterna(sheet, "MDR", ["IR"]);
  sheet.getRange(REG_IR_MAQ).setValue("'" + codificarInstruccion(mdrVal));
  resaltarCelda(sheet, REG_IR, "#C8E6C9");
  SpreadsheetApp.flush();
  Utilities.sleep(800);

  var pcVal = sheet.getRange(REG_PC).getValue();
  incrementarPC(sheet, pcVal);
  busInterno.driver = "ALU";
  busInterno.value = sheet.getRange(REG_PC).getValue();
  mostrarBuses(sheet);
  resaltarCelda(sheet, REG_PC, "#BBDEFB");

  registrarLogDetallado(sheet, "Bus interno: MDR → IR y avance del PC");
}

// Ejemplo en faseDecode
function faseDecode(sheet) {
  sheet.getRange(CPU_STATE).setValue("DECODE");
  var irVal = sheet.getRange(REG_IR).getValue();
  var inst = decodificarInstruccion(irVal);
  
  var op = inst.op || "NOP";
  var dest = inst.dest ? inst.dest : "Ninguno";
  var src = inst.src ? inst.src : "Ninguno";
  
  registrarLogDetallado(sheet, "Decodificación: " + op + " (código máquina " + codificarInstruccion(irVal) + ") sobre destino " + dest + " con origen " + src);
}
function fuenteDesdeOperando(sheet, operando) {
  var op = String(operando || "").toUpperCase().trim();
  if (esRegistro(op)) {
    return leerFuente(sheet, op);
  }
  return { name: "IR", value: operando };
}

function intentarSalto(sheet, nombre, tomado, destino) {
  if (tomado) {
    transferInterna(sheet, { name: "IR", value: destino }, ["PC"]);
    resaltarCelda(sheet, REG_PC, "#BBDEFB");
    if (nombre === "JMP") {
      registrarLog(sheet, "EXECUTE: Salto incondicional a " + destino);
    } else {
      registrarLog(sheet, "EXECUTE: Salto (" + nombre + ") tomado a " + destino);
    }
  } else {
    registrarLog(sheet, "EXECUTE: Salto (" + nombre + ") ignorado");
  }
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

  // 1. Saltos: la dirección viaja por el bus interno hacia el PC
  if (inst.op === "JMP") {
    intentarSalto(sheet, "JMP", true, dest);
    return;
  }
  if (inst.op === "JZ") {
    intentarSalto(sheet, "JZ", sheet.getRange(FLAG_ZF).getValue() == 1, dest);
    return;
  }
  if (inst.op === "JNZ") {
    intentarSalto(sheet, "JNZ", sheet.getRange(FLAG_ZF).getValue() == 0, dest);
    return;
  }
  if (inst.op === "JC") {
    intentarSalto(sheet, "JC", sheet.getRange(FLAG_CF).getValue() == 1, dest);
    return;
  }
  if (inst.op === "JS") {
    intentarSalto(sheet, "JS", sheet.getRange(FLAG_SF).getValue() == 1, dest);
    return;
  }

  // 2. ALU: el cálculo sigue igual; el resultado se escribe por el bus interno
  if (["ADD", "SUB", "MOV", "INC", "DEC", "CMP", "AND", "OR"].indexOf(inst.op) !== -1) {
    if (!esRegistro(dest)) {
      registrarLog(sheet, "ERROR: destino inválido '" + dest + "' (usa AX, BX, CX o DX)");
      return;
    }

    var fuente = fuenteDesdeOperando(sheet, src);
    var valDestino = leerRegistro(sheet, dest);
    var resultado = ejecutarALU(sheet, inst.op, valDestino, fuente.value);

    if (inst.op === "MOV") {
      transferInterna(sheet, { name: fuente.name, value: resultado }, [dest]);
    } else if (inst.op !== "CMP") {
      transferInterna(sheet, { name: "ALU", value: resultado }, [dest]);
    } else {
      transferInterna(sheet, { name: "ALU", value: resultado }, []);
    }
  }

  // 3. LD: interno (dir → MAR), externo (RAM → MDR), interno (MDR → registro)
  else if (inst.op === "LD" || inst.op === "LOAD") {
    var dirOrigen = limpiarDireccion(src);
    transferInterna(sheet, { name: "IR", value: dirOrigen }, ["MAR"]);
    resaltarCelda(sheet, REG_MAR, "#C8E6C9");
    SpreadsheetApp.flush();
    Utilities.sleep(400);

    var datoRAM = transferLecturaMemoria(sheet);
    resaltarCelda(sheet, REG_MDR, "#FFF59D");
    SpreadsheetApp.flush();
    Utilities.sleep(400);

    if (esRegistro(dest)) {
      transferInterna(sheet, "MDR", [dest]);
    }
  }

  // 4. ST: interno (dir → MAR), interno (dato → MDR), externo (MDR → RAM)
  else if (inst.op === "ST" || inst.op === "STORE") {
    if (!src) {
      registrarLog(sheet, "ERROR: ST necesita un origen (registro o valor)");
      return;
    }
    var dirDestino = limpiarDireccion(dest);
    var fuenteDato = fuenteDesdeOperando(sheet, src);

    transferInterna(sheet, { name: "IR", value: dirDestino }, ["MAR"]);
    resaltarCelda(sheet, REG_MAR, "#C8E6C9");
    SpreadsheetApp.flush();
    Utilities.sleep(400);

    transferInterna(sheet, fuenteDato, ["MDR"]);
    resaltarCelda(sheet, REG_MDR, "#FFF59D");
    SpreadsheetApp.flush();
    Utilities.sleep(400);

    transferEscrituraMemoria(sheet);
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