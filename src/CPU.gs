// CPU.gs - Núcleo de control de micro-operaciones
// Issue 25: con la memoria virtual apagada, fetch, LD y ST siguen igual.
// Encendida y sin programa cargado, RUN no lee la RAM vacía.
// Issue 16: el ciclo integra MMU, caché e I/O y amplía el Historial.
// --- FUNCIÓN RUN (Ejecución automática) ---
function hojaDeLaCpu_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fija = (typeof SHEET_NAME !== "undefined" && ss.getSheetByName) ? ss.getSheetByName(SHEET_NAME) : null;
  if (fija && ss.setActiveSheet) {
    try { if (!ss.getActiveSheet || ss.getActiveSheet() !== fija) ss.setActiveSheet(fija); } catch (e) {}
  }
  if (fija && ss.getActiveSheet && ss.getActiveSheet() === fija) return fija;
  return ss.getActiveSheet();
}

function runCPU() {
  // Un lote corto. La corrida continua vive en el panel: el cliente vuelve
  // entre lotes y puede pausar. Un while hasta HALT no se puede interrumpir.
  if (typeof uiLoteDesdeMenu === "function") return uiLoteDesdeMenu();
  var sheet = hojaDeLaCpu_();
  registrarLog(sheet, "RUN: el panel no está cargado. Use Step.");
  return { ok: false, reason: "panel" };
}
function pausarCPU() {
  var sheet = hojaDeLaCpu_();
  sheet.getRange(CPU_STATE).setValue("PAUSE");
  registrarLog(sheet, "⏸️ EJECUCIÓN PAUSADA");
}


function resetCPU() {
  var sheet = hojaDeLaCpu_();
  
  // Garantiza que la pestaña "Historial" exista y esté limpia
  crearEstructuraHistorial();
  limpiarFondoRegistros(sheet);
  limpiarHojaHistorial();
  if (typeof resetContadoresCache === "function") resetContadoresCache();
  if (typeof cpuUltimoFetch !== "undefined") cpuUltimoFetch = null;
  resetearAccesoMemoriaLog_();

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
  
  // Limpiar la matriz de Hoja 1 de una sola vez. El resto del reset sigue en esta hoja.
  RAMFisica.vaciar();
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

// Modo físico: no hace nada. Modo virtual sin programa: no llega a leer la RAM.
function exigirModoMemoriaCPU_() {
  if (typeof memoriaVirtualActiva !== "function" || !memoriaVirtualActiva()) return;
  if (typeof programaVirtualCargado === "function" && programaVirtualCargado()) return;
  throw new Error("CPU: la memoria virtual está activa y no hay un programa cargado. Ejecute cargarProgramaVirtual o Load selected program. No se leyó la RAM.");
}

// #16: traduce con la MMU, resuelve Page Fault sin perder PC/MAR,
// pasa el fetch por L1I y los datos por L1D, y deja metadatos para el Historial.
var ultimoAccesoMemoria = {
  dirVirtual: "—",
  vpn: "—",
  pfn: "—",
  pageFault: "No",
  l1i: "—",
  l1d: "—",
  l2: "—"
};

function resetearAccesoMemoriaLog_() {
  ultimoAccesoMemoria.dirVirtual = "—";
  ultimoAccesoMemoria.vpn = "—";
  ultimoAccesoMemoria.pfn = "—";
  ultimoAccesoMemoria.pageFault = "No";
  ultimoAccesoMemoria.l1i = "—";
  ultimoAccesoMemoria.l1d = "—";
  ultimoAccesoMemoria.l2 = "—";
}

function hexDirLog_(n) {
  if (typeof n !== "number" || !isFinite(n) || n < 0) return "—";
  var s = Math.floor(n).toString(16).toUpperCase();
  while (s.length < 3) s = "0" + s;
  return s + "H";
}

function parsearDireccionMar_(mar) {
  if (typeof mar === "number" && isFinite(mar)) return Math.floor(mar);
  var t = String(mar || "").trim().toUpperCase();
  if (/^[0-9A-F]{1,3}H$/.test(t)) return parseInt(t.substring(0, t.length - 1), 16);
  if (/^[0-9A-F]{1,3}$/.test(t)) return parseInt(t, 16);
  return null;
}

function longitudEventosCache_() {
  if (typeof leerContadoresCache !== "function") return 0;
  try {
    var c = leerContadoresCache();
    return (c && c.eventos) ? c.eventos.length : 0;
  } catch (e) {
    return 0;
  }
}

function aplicarEventosCacheAlLog_(desde) {
  if (typeof leerContadoresCache !== "function") return;
  var c;
  try { c = leerContadoresCache(); } catch (e) { return; }
  var ev = (c && c.eventos) || [];
  var i;
  for (i = desde; i < ev.length; i++) {
    var s = String(ev[i] || "");
    if (s.indexOf("L1I") !== -1) ultimoAccesoMemoria.l1i = s.indexOf("HIT") !== -1 ? "HIT" : "MISS";
    if (s.indexOf("L1D") !== -1) ultimoAccesoMemoria.l1d = s.indexOf("HIT") !== -1 ? "HIT" : "MISS";
    if (s.indexOf("L2") !== -1) ultimoAccesoMemoria.l2 = s.indexOf("HIT") !== -1 ? "HIT" : "MISS";
  }
}

function esPageFault_(e) {
  if (!e) return false;
  if (e.name === "PageFault") return true;
  return String(e.message || "").indexOf("PageFault") === 0;
}

function anotarTraduccion_(mar, fallo) {
  var yaHuboFallo = ultimoAccesoMemoria.pageFault === "Yes";
  var n = parsearDireccionMar_(mar);
  var virtual = (typeof memoriaVirtualActiva === "function" && memoriaVirtualActiva());
  ultimoAccesoMemoria.dirVirtual = n === null ? String(mar || "—") : hexDirLog_(n);
  ultimoAccesoMemoria.pageFault = (fallo || yaHuboFallo) ? "Yes" : "No";
  if (!virtual) {
    ultimoAccesoMemoria.vpn = "—";
    ultimoAccesoMemoria.pfn = "—";
    return;
  }
  if (n === null || typeof translate !== "function") {
    ultimoAccesoMemoria.vpn = n === null ? "—" : String(n >> 5);
    if (!fallo) ultimoAccesoMemoria.pfn = "—";
    return;
  }
  try {
    var t = translate(n);
    ultimoAccesoMemoria.vpn = String(t.vpn);
    ultimoAccesoMemoria.pfn = String(t.pfn);
  } catch (e) {
    ultimoAccesoMemoria.vpn = String(n >> 5);
    if (!ultimoAccesoMemoria.pfn || ultimoAccesoMemoria.pfn === "—") ultimoAccesoMemoria.pfn = "—";
  }
}

function asegurarPaginaPresente_(sheet) {
  if (!(typeof memoriaVirtualActiva === "function" && memoriaVirtualActiva())) return false;
  if (typeof translate !== "function") return false;
  var mar = sheet.getRange(REG_MAR).getValue();
  try {
    translate(mar);
    return false;
  } catch (e) {
    if (!esPageFault_(e)) throw e;
    if (typeof leerMemoriaCPU !== "function") throw e;
    var mdr = sheet.getRange(REG_MDR).getValue();
    leerMemoriaCPU(sheet);
    sheet.getRange(REG_MDR).setValue(mdr);
    return true;
  }
}

function formatearByteCpu_(dato) {
  if (typeof dato === "number" && dato === dato && Math.floor(dato) === dato && dato >= 0 && dato <= 255) {
    var h = dato.toString(16).toUpperCase();
    if (h.length < 2) h = "0" + h;
    return h + "H";
  }
  return dato;
}

function silenciarMmuDurante_(fn) {
  var silenciar = typeof silenciarAnimacionMMU === "function";
  if (silenciar) silenciarAnimacionMMU(true);
  try {
    return fn();
  } finally {
    if (silenciar) silenciarAnimacionMMU(false);
  }
}

function leerMemoriaIntegrada(sheet, tipo) {
  var mar = sheet.getRange(REG_MAR).getValue();
  var desde = longitudEventosCache_();
  var huboFallo = false;
  try {
    huboFallo = silenciarMmuDurante_(function () { return asegurarPaginaPresente_(sheet); });
  } catch (e) {
    anotarTraduccion_(mar, esPageFault_(e));
    throw e;
  }
  anotarTraduccion_(mar, huboFallo);
  var dato;
  if (typeof leerCacheCPU === "function") {
    dato = formatearByteCpu_(leerCacheCPU(sheet, tipo || "dato"));
    if (typeof presentarAccesoMemoria === "function") presentarAccesoMemoria(sheet, mar, dato, false);
  } else if (typeof leerMemoriaCPU === "function") {
    dato = formatearByteCpu_(leerMemoriaCPU(sheet));
  } else {
    dato = formatearByteCpu_(transferLecturaMemoria(sheet));
  }
  aplicarEventosCacheAlLog_(desde);
  return dato;
}

function escribirMemoriaIntegrada(sheet) {
  var mar = sheet.getRange(REG_MAR).getValue();
  var desde = longitudEventosCache_();
  var huboFallo = false;
  try {
    huboFallo = silenciarMmuDurante_(function () { return asegurarPaginaPresente_(sheet); });
  } catch (e) {
    anotarTraduccion_(mar, esPageFault_(e));
    throw e;
  }
  anotarTraduccion_(mar, huboFallo);
  var datoEscrito = sheet.getRange(REG_MDR).getValue();
  if (typeof escribirCacheCPU === "function") {
    escribirCacheCPU(sheet);
    if (typeof presentarAccesoMemoria === "function") presentarAccesoMemoria(sheet, mar, datoEscrito, true);
  } else if (typeof escribirMemoriaCPU === "function") {
    escribirMemoriaCPU(sheet);
  } else {
    transferEscrituraMemoria(sheet);
  }
  aplicarEventosCacheAlLog_(desde);
}


function stepCPU() {
  var sheet = hojaDeLaCpu_();
  var estadoActual = sheet.getRange(CPU_STATE).getValue();
  
  if (estadoActual === "HALT") {
    registrarLog(sheet, "SISTEMA DETENIDO. Presiona Reset para iniciar otro programa.");
    return;
  }
  exigirModoMemoriaCPU_();
  resetearAccesoMemoriaLog_();
  
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
    if (typeof cpuVirtualModeOn === "function" && cpuVirtualModeOn()) {
    var fetched = cpuApplyVirtualFetch2(sheet);
    if (!fetched || !fetched.ok) return;
    resaltarCelda(sheet, REG_MDR, "#FFF59D");
    registrarLogDetallado(sheet, "FETCH_2: lectura virtual L1I → MDR (" + sheet.getRange(REG_MDR).getValue() + ")");
    return;
  }
  sheet.getRange(CPU_STATE).setValue("FETCH_2");
  var marVal = sheet.getRange(REG_MAR).getValue();
  var datoRAM = leerMemoriaIntegrada(sheet, "instruccion");
  if (instruccionAusente_(datoRAM)) {
    sheet.getRange(CPU_STATE).setValue("HALT");
    registrarLog(sheet, "FETCH: no hay instrucción en " + marVal + ". Elija el programa y pulse LOAD. RUN no sigue por celdas vacías.");
    return;
  }
  resaltarCelda(sheet, REG_MDR, "#FFF59D");
  registrarLogDetallado(sheet, "Bus externo: lectura RAM[" + marVal + "] → MDR (" + datoRAM + ")");
}

function instruccionAusente_(valor) {
  if (valor == null) return true;
  var t = String(valor).replace(/'/g, "").trim().toUpperCase();
  return t === "" || t === "0" || t === "00" || t === "00H" || t === "0H";
}

function faseFetch3(sheet) {
    if (typeof cpuVirtualModeOn === "function" && cpuVirtualModeOn()) {
    var fetched = cpuApplyVirtualFetch3(sheet);
    if (!fetched || !fetched.ok) return;
    resaltarCelda(sheet, REG_IR, "#C8E6C9");
    busInterno.driver = "ALU";
    busInterno.value = sheet.getRange(REG_PC).getValue();
    mostrarBuses(sheet);
    limpiarSenalesBuffers();
    if (typeof setControl === "function") setControl(sheet, { rd: 0, wr: 0, io: 0 });
    marcarEnable("ALU", busInterno.value, "interno");
    marcarLoad("PC");
    pintarBuffers(sheet);
    senalIncPC = 1;
    if (typeof publicarPalabraDesdeEstado === "function") publicarPalabraDesdeEstado(sheet);
    resaltarCelda(sheet, REG_PC, "#BBDEFB");
    registrarLogDetallado(sheet, "FETCH_3: IR cargado y avance del PC (memoria virtual)");
    return;
  }
  sheet.getRange(CPU_STATE).setValue("FETCH_3");
  var mdrVal = transferInterna(sheet, "MDR", ["IR"]);
  sheet.getRange(REG_IR_MAQ).setValue("'" + codificarInstruccion(mdrVal));
  resaltarCelda(sheet, REG_IR, "#C8E6C9");
  SpreadsheetApp.flush();
  Utilities.sleep(800);

  var pcVal = sheet.getRange(REG_PC).getValue();
  if (typeof memoriaVirtualActiva === "function" && memoriaVirtualActiva()) incrementarPCVirtual(sheet, pcVal);
  else incrementarPC(sheet, pcVal);
  busInterno.driver = "ALU";
  busInterno.value = sheet.getRange(REG_PC).getValue();
  mostrarBuses(sheet);
  limpiarSenalesBuffers();
  if (typeof setControl === "function") setControl(sheet, { rd: 0, wr: 0, io: 0 });
  marcarEnable("ALU", busInterno.value, "interno");
  marcarLoad("PC");
  pintarBuffers(sheet);
  senalIncPC = 1;
  if (typeof publicarPalabraDesdeEstado === "function") publicarPalabraDesdeEstado(sheet);
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
  logDisassembledIr(sheet);
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

    var datoRAM = leerMemoriaIntegrada(sheet, "dato");
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

    escribirMemoriaIntegrada(sheet);
  } else if (inst.op === "IN") {
    ioExecuteIn(sheet, dest, src);
    return;
  } else if (inst.op === "OUT") {
    ioExecuteOut(sheet, dest, src);
    return;
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
  if (typeof cpuVirtualModeOn === "function" && cpuVirtualModeOn()) return;
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
