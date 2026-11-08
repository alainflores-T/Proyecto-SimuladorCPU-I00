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
  paso("buses", function () {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    inicializarPanelBuses(sheet);
    resetearBuses(sheet);
  });
  paso("microcodigo", function () { inicializarHojaMicrocodigo(); });
  return informe;
}

function mostrarPanelSimulador() {
  var html = HtmlService.createHtmlOutputFromFile("Panel")
    .setTitle("Simulador")
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}
