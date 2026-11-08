/**
 * onOpen solo agrega menús. No borra celdas ni hojas ajenas.
 * prepararSimulador es explícito e idempotente: los instaladores
 * rechazan una hoja ocupada que no sea suya.
 */

function onOpen() {
  try { if (typeof uiInstallMenu === "function") uiInstallMenu(); } catch (eUi) {}
  try { if (typeof catalogInstallMenu === "function") catalogInstallMenu(); } catch (eCat) {}
  try { if (typeof editorInstallMenu === "function") editorInstallMenu(); } catch (eEd) {}
  try { if (typeof loaderInstallMenu === "function") loaderInstallMenu(); } catch (eLo) {}
  // Keyboard.gs y LCD.gs pintan una hoja dentro de su installMenu.
  // onOpen no los llama: solo publica los ítems.
  try {
    SpreadsheetApp.getUi().createMenu("Keyboard")
      .addItem("Enable physical-only opt-in", "ioEnablePersonalOptIn")
      .addItem("Disable opt-in", "ioDisablePersonalOptIn")
      .addItem("Send key", "kbdSendKey")
      .addItem("Send Enter", "kbdSendEnter")
      .addItem("Reset queue", "kbdReset")
      .addToUi();
  } catch (eKb) {}
  try {
    SpreadsheetApp.getUi().createMenu("LCD")
      .addItem("Write byte from B3", "lcdWriteFromPanel")
      .addItem("Clear screen", "lcdClear")
      .addToUi();
  } catch (eLcd) {}
  try {
    SpreadsheetApp.getUi().createMenu("Simulador")
      .addItem("Abrir panel", "mostrarPanelSimulador")
      .addItem("Diagnóstico (no borra nada)", "diagnosticarSimulador")
      .addItem("Vaciar cola (F0H y contador)", "panelVaciarCola")
      .addItem("Preparar hojas (no borra datos ajenos)", "prepararSimulador")
      .addItem("Cargar programa seleccionado", "loadSelectedProgram")
      .addItem("Step", "uiStep")
      .addItem("Run un lote", "uiRun")
      .addItem("Pause", "uiPause")
      .addItem("Reset CPU", "uiReset")
      .addItem("Clear máquina", "uiClear")
      .addToUi();
  } catch (eMenu) {}
}

function prepararSimulador() {
  var informe = [];
  function paso(nombre, fn) {
    try {
      fn();
      informe.push(nombre + ": ok");
    } catch (e) {
      informe.push(nombre + ": " + (e && e.message ? e.message : e));
    }
  }
  paso("marcos", function () { prepararMarcosRAM(); });
  paso("swap", function () { instalarSwap(); });
  paso("tabla", function () { instalarTablaPaginas(); });
  paso("reemplazo", function () { asegurarPoliticaDemostracion("FIFO"); });
  paso("cache", function () {
    instalarCaches();
    if (typeof resetContadoresCache === "function") resetContadoresCache();
  });
  paso("es", function () { esRamInstalar(); });
  paso("vista", function () { instalarVista(); });
  paso("buses", function () {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    inicializarPanelBuses(sheet);
    resetearBuses(sheet);
  });
  paso("microcodigo", function () { inicializarHojaMicrocodigo(); });
  paso("catalogo", function () { catalogInitialize(); });
  var texto = informe.join("\n");
  try {
    var mal = [];
    var i;
    for (i = 0; i < informe.length; i++) if (informe[i].indexOf(": ok") === -1) mal.push(informe[i]);
    SpreadsheetApp.getUi().alert(mal.length ? "Preparación con avisos. Corrija esto antes de RUN:\n" + texto : "Preparación lista. En el panel elija Arithmetic AX..DX, pulse LOAD y después RUN.");
  } catch (eAlert) {}
  return informe;
}

function diagnosticarSimulador() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(SHEET_NAME);
  function celda(a1) {
    try { return hoja ? hoja.getRange(a1).getValue() : ""; } catch (e) { return ""; }
  }
  function notaDe(nombre) {
    var sh = ss.getSheetByName(nombre);
    if (!sh) return "ausente";
    try { return String(sh.getRange(1, 1).getNote() || "") || "sin nota"; } catch (e) { return "sin nota"; }
  }
  var virtual = (typeof memoriaVirtualActiva === "function") && memoriaVirtualActiva();
  var cargado = (typeof programaVirtualCargado === "function") && programaVirtualCargado();
  var dir = ss.getSheetByName("Directory");
  var elegido = "";
  try { elegido = dir ? dir.getRange("B1").getValue() : "(no hay Directory)"; } catch (eDir) { elegido = "(error)"; }
  var limites = {};
  try { limites = cpuLoadBoundaries(); } catch (eLim) { limites = {}; }
  var nLim = 0;
  var k;
  for (k in limites) if (Object.prototype.hasOwnProperty.call(limites, k)) nLim++;
  var cache = null;
  try { cache = leerContadoresCache(); } catch (eC) { cache = null; }
  var lineas = [
    "Estado CPU: " + celda(CPU_STATE),
    "PC " + celda(REG_PC) + " IR " + celda(REG_IR) + " MAR " + celda(REG_MAR) + " MDR " + celda(REG_MDR),
    "AX " + celda(REG_AX) + " BX " + celda(REG_BX) + " CX " + celda(REG_CX) + " DX " + celda(REG_DX),
    "Virtual: " + (virtual ? "sí" : "no") + "  Programa cargado: " + (cargado ? "sí" : "no"),
    "Catálogo B1: " + elegido,
    "Límites de instrucción guardados: " + nLim,
    "Pausa Layout!E4: " + (uiPaused() ? "PAUSE" : "no"),
    "Caché L1I " + (cache ? cache.l1i.hits + "/" + cache.l1i.misses : "—") + " L2 " + (cache ? cache.l2.hits + "/" + cache.l2.misses : "—"),
    "Notas Swap=" + notaDe("Swap") + " TablaPaginas=" + notaDe("TablaPaginas") + " Caches=" + notaDe("Caches") + " Directory=" + notaDe("Directory")
  ];
  if (!virtual && !cargado) {
    lineas.push("Lectura: RUN está en modo físico. Si PC avanzó y AX..DX siguen en 00H, recorrió celdas vacías. Pulse LOAD del programa Arithmetic AX..DX y luego RUN.");
  } else if (virtual && cargado && nLim === 0) {
    lineas.push("Lectura: hay modo virtual pero el mapa de instrucciones está vacío. Vuelva a pulsar LOAD.");
  } else if (virtual && cargado) {
    lineas.push("Lectura: el programa cargado debería ejecutarse desde 00H. Si PC no es 00H, pulse RESET y luego RUN.");
  }
  var informe = lineas.join("\n");
  try {
    var vista = ss.getSheetByName("Vista");
    if (vista && String(vista.getRange(1, 1).getNote() || "") === "VISTA-v1") {
      vista.getRange(44, 1).setValue(informe);
    }
  } catch (eVista) {}
  try { SpreadsheetApp.getUi().alert(informe); } catch (eUi) {}
  return informe;
}

function cargarProgramaPorNombre(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var directory = ss.getSheetByName("Directory");
  if (!directory || !ss.getSheetByName("Sources")) {
    try { catalogInitialize(); } catch (eCat) {
      return { ok: false, reason: "No se pudo crear el catálogo: " + (eCat && eCat.message ? eCat.message : eCat) };
    }
    directory = ss.getSheetByName("Directory");
  }
  if (!directory) return { ok: false, reason: "Falta el catálogo. Ejecute catalogInitialize." };
  if (!nombre) return { ok: false, reason: "Indique el nombre del programa." };
  directory.getRange("B1").setValue(nombre);
  var r = loadSelectedProgram();
  return { ok: !!(r && r.ok), reason: r && r.reason, program: nombre, snapshot: uiSnapshot() };
}

function panelEnviarTecla(texto) {
  var parsed = kbdKeyCode(texto);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, mensaje: parsed.reason, snapshot: uiSnapshot() };
  var result = kbdEnqueueByte(parsed.byte);
  result.snapshot = uiSnapshot();
  if (result.ok) result.mensaje = "Encolado " + kbdText(parsed.byte) + ". Ocupadas " + result.meta.count + "/8.";
  else result.mensaje = result.reason;
  return result;
}

function panelVaciarCola() {
  var result = kbdReset();
  result.snapshot = uiSnapshot();
  result.mensaje = result.ok ? "Cola vaciada: F0H-F7H y el contador quedaron en 0/8." : result.reason;
  return result;
}

function panelPolitica(nombre) {
  if (nombre !== "FIFO" && nombre !== "LRU") return { ok: false, reason: "Use FIFO o LRU." };
  var hecha = asegurarPoliticaDemostracion(nombre);
  return { ok: hecha === nombre, politica: hecha, snapshot: uiSnapshot() };
}

function mostrarPanelSimulador() {
  var html = HtmlService.createHtmlOutputFromFile("Panel")
    .setTitle("Simulador")
    .setWidth(360);
  SpreadsheetApp.getUi().showSidebar(html);
}
