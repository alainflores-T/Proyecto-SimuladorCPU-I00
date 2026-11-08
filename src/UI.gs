/**
 * Controles. onOpen está en Arranque.gs y solo crea menús.
 * RUN no bloquea el servidor hasta HALT: cada llamada ejecuta un lote
 * y devuelve el control. El panel repite el lote con el mismo token.
 * PAUSE se lee entre lotes. Un clic de menú no puede cortar un bucle que
 * todavía no ha retornado; por eso el bucle largo ya no existe.
 */
var UI_LAYOUT_SHEET = "Layout";
var UI_DELAY_CELL = "E2";
var UI_PAUSE_CELL = "E4";
var UI_ACTIVE = "#C8E6C9";
var UI_HIGH_Z = "#B0BEC5";
var UI_HIT = "#2E7D32";
var UI_MISS = "#C62828";
var UI_FAULT = "#B71C1C";

function uiLayoutSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(UI_LAYOUT_SHEET) || ss.insertSheet(UI_LAYOUT_SHEET);
}

function uiMainSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.getActiveSheet();
  ss.setActiveSheet(sheet);
  return sheet;
}

/** Keep settings outside the zone table in columns A:C. */
function uiShowLayout() {
  var sheet = uiLayoutSheet();
  var rows = [
    ["Zone", "Where it already is", "Status"],
    ["CPU state", "Hoja 1!B2 (CPU_STATE)", "Existing"],
    ["Run delay (ms)", "Layout!E2. Blank means 600.", "This file"],
    ["Pause flag", "Layout!E4. Does not change CPU_STATE.", "This file"],
    ["Instruction stack", "Hoja 1 column I from row 3", "Existing"],
    ["Registers PC IR MAR MDR AX BX CX DX", "Hoja 1!C16:C23", "Existing"],
    ["ALU and flags", "Hoja 1 ALU_OP1 B31, ALU_RES D45, flags G39:I39", "Existing"],
    ["Physical RAM, 8 frames of 32 bytes", "Hoja 1 row 8 column 15, MarcosRAM panel", "Existing"],
    ["Internal bus, address bus, data bus, control", "Hoja 1!J15:K26. High-Z text is ZZ", "Existing"],
    ["Tri-state buffers", "Hoja 1 columns J:M from row 28", "Existing"],
    ["Swap, 16 pages", "Sheet Swap, after instalarYProbarIssue23", "Not drawn here"],
    ["Frame table P, PFN, Dirty, Ref", "Sheet TablaPaginas, after instalarYProbarIssue24", "Not drawn here"],
    ["Caches, hit and miss", "Hoja Caches. Contadores en PropertiesService", "Existente"],
    ["Keyboard queue and LCD", "Hoja Perifericos, 16 B fuera de los marcos", "RAM dedicada"],
    ["Active wire", UI_ACTIVE, "Bus conducido"],
    ["High-Z wire", UI_HIGH_Z, "Bus en ZZ"],
    ["Hit", UI_HIT, "Evento real de la caché"],
    ["Miss or page fault", UI_MISS + " / " + UI_FAULT, "Evento real de caché o de la MMU"]
  ];
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.getRange("E1").setValue("Run delay (ms)");
  if (String(sheet.getRange(UI_DELAY_CELL).getValue()).trim() === "") {
    sheet.getRange(UI_DELAY_CELL).setValue(600);
  }
  sheet.getRange("E3").setValue("Pause flag");
  sheet.getRange("A15").setBackground(UI_ACTIVE);
  sheet.getRange("A16").setBackground(UI_HIGH_Z);
  sheet.getRange("A17").setBackground(UI_HIT).setFontColor("#FFFFFF");
  sheet.getRange("A18").setBackground(UI_FAULT).setFontColor("#FFFFFF");
}

function uiStep() {
  if (uiRunActiva_()) return { ok: false, reason: "Hay un RUN activo. Pause antes de Step.", snapshot: uiSnapshot() };
  uiMainSheet();
  stepCPU();
  return { ok: true, snapshot: uiSnapshot() };
}

function uiDelayMs() {
  var layout = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UI_LAYOUT_SHEET);
  if (!layout) return 600;
  var text = String(layout.getRange(UI_DELAY_CELL).getValue()).trim();
  if (text === "") return 600;
  var raw = Number(text);
  if (!(raw >= 0) || raw > 5000) return 600;
  return raw;
}

function uiPaused() {
  var layout = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UI_LAYOUT_SHEET);
  if (!layout) return false;
  return String(layout.getRange(UI_PAUSE_CELL).getValue()).trim() === "PAUSE";
}

var UI_LOTE_MAX = 16;
var UI_TOKEN_KEY = "UI_RUN_TOKEN";
var UI_RUN_FLAG = "UI_RUN_ACTIVA";
var UI_RUN_HEARTBEAT = "UI_RUN_HEARTBEAT";

function uiProps_() {
  return PropertiesService.getDocumentProperties();
}

function uiRunActiva_() {
  var props = uiProps_();
  if (props.getProperty(UI_RUN_FLAG) !== "1") return false;
  var beat = parseInt(props.getProperty(UI_RUN_HEARTBEAT) || "0", 10);
  if (beat && (new Date().getTime() - beat) > 30000) return false;
  return true;
}

function uiProgramaListo_() {
  if (typeof memoriaVirtualActiva === "function" && memoriaVirtualActiva()) {
    if (typeof programaVirtualCargado === "function" && !programaVirtualCargado()) {
      return { ok: false, reason: "La memoria virtual está activa y no hay un programa cargado. Pulse LOAD." };
    }
    return { ok: true, modo: "virtual" };
  }
  var sheet = uiMainSheet();
  var pc = sheet.getRange(REG_PC).getValue();
  var dato = "";
  try { dato = obtenerDatoRAM(sheet, pc || "00H"); } catch (eRam) { dato = ""; }
  if (typeof instruccionAusente_ === "function" && instruccionAusente_(dato)) {
    return { ok: false, reason: "No hay un programa en PC " + (pc || "(vacío)") + ". Elija Arithmetic AX..DX y pulse LOAD. RUN no avanza por celdas vacías." };
  }
  return { ok: true, modo: "fisico" };
}

function uiComenzarEjecucion() {
  if (uiRunActiva_()) return { ok: false, reason: "Ya hay un RUN con token vigente. Espere el lote o pause." };
  var listo = uiProgramaListo_();
  if (!listo.ok) return { ok: false, reason: listo.reason, snapshot: uiSnapshot() };
  var token = String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000000);
  var props = uiProps_();
  props.setProperty(UI_TOKEN_KEY, token);
  props.setProperty(UI_RUN_FLAG, "1");
  props.setProperty(UI_RUN_HEARTBEAT, String(new Date().getTime()));
  uiLayoutSheet().getRange(UI_PAUSE_CELL).setValue("");
  return { ok: true, token: token, snapshot: uiSnapshot() };
}

function uiTerminarEjecucion_() {
  var props = uiProps_();
  if (props.deleteProperty) {
    props.deleteProperty(UI_TOKEN_KEY);
    props.deleteProperty(UI_RUN_FLAG);
    props.deleteProperty(UI_RUN_HEARTBEAT);
  } else {
    props.setProperty(UI_RUN_FLAG, "0");
    props.setProperty(UI_TOKEN_KEY, "");
  }
}

function uiLoteRun(token) {
  var props = uiProps_();
  if (!token || props.getProperty(UI_TOKEN_KEY) !== String(token) || props.getProperty(UI_RUN_FLAG) !== "1") {
    return { ok: false, reason: "Token de RUN inválido. No se ejecutó un segundo ciclo.", snapshot: uiSnapshot() };
  }
  props.setProperty(UI_RUN_HEARTBEAT, String(new Date().getTime()));
  var sheet = uiMainSheet();
  if (uiPaused()) {
    uiTerminarEjecucion_();
    return { ok: true, pausa: true, continuar: false, pasos: 0, snapshot: uiSnapshot() };
  }
  var steps = 0;
  var state = String(sheet.getRange(CPU_STATE).getValue());
  while (steps < UI_LOTE_MAX && state !== "HALT" && !uiPaused()) {
    try {
      stepCPU();
    } catch (ePaso) {
      uiTerminarEjecucion_();
      return { ok: false, reason: String(ePaso && ePaso.message ? ePaso.message : ePaso), pasos: steps, snapshot: uiSnapshot() };
    }
    steps++;
    state = String(sheet.getRange(CPU_STATE).getValue());
  }
  var pausa = uiPaused();
  var seguir = state !== "HALT" && !pausa;
  if (!seguir) uiTerminarEjecucion_();
  else props.setProperty(UI_RUN_HEARTBEAT, String(new Date().getTime()));
  return { ok: true, pausa: pausa, continuar: seguir, pasos: steps, estado: state, snapshot: uiSnapshot() };
}

function uiLoteDesdeMenu() {
  var inicio = uiComenzarEjecucion();
  if (!inicio.ok) return inicio;
  return uiLoteRun(inicio.token);
}

/** Un lote. El panel encadena los siguientes con el token. */
function uiRun() {
  return uiLoteDesdeMenu();
}

/** Request a stop between micro-steps without losing the CPU state. */
function uiPause() {
  uiLayoutSheet().getRange(UI_PAUSE_CELL).setValue("PAUSE");
}

/** RESET: registros, buses y PC. No vacía marcos, swap, caché ni E/S. */
function reiniciarCpu() {
  var sheet = uiMainSheet();
  uiTerminarEjecucion_();
  var layout = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UI_LAYOUT_SHEET);
  if (layout) layout.getRange(UI_PAUSE_CELL).setValue("");
  if (typeof cpuUltimoFetch !== "undefined") cpuUltimoFetch = null;
  sheet.getRange(REG_PC).setValue("00H");
  sheet.getRange(REG_IR).setValue("00H");
  sheet.getRange(REG_IR_MAQ).setValue("");
  sheet.getRange(REG_MAR).setValue("00H");
  sheet.getRange(REG_MDR).setValue("00H");
  sheet.getRange(REG_AX).setValue("00H");
  sheet.getRange(REG_BX).setValue("00H");
  sheet.getRange(REG_CX).setValue("00H");
  sheet.getRange(REG_DX).setValue("00H");
  sheet.getRange(FLAG_ZF).setValue(0);
  sheet.getRange(FLAG_CF).setValue(0);
  sheet.getRange(FLAG_SF).setValue(0);
  sheet.getRange(ALU_OP1).setValue("");
  sheet.getRange(ALU_OP2).setValue("");
  sheet.getRange(ALU_SYM).setValue("");
  sheet.getRange(ALU_RES).setValue("");
  sheet.getRange(CPU_STATE).setValue("READY");
  if (typeof resetearAccesoMemoriaLog_ === "function") resetearAccesoMemoriaLog_();
  if (typeof inicializarPanelBuses === "function") inicializarPanelBuses(sheet);
  if (typeof resetearBuses === "function") resetearBuses(sheet);
  registrarLog(sheet, "RESET: CPU en READY. Marcos, swap, caché y E/S se conservan.");
  return { ok: true, snapshot: uiSnapshot() };
}

/**
 * CLEAR: vacía la RAM física y la presencia de páginas. Conserva el swap
 * del último LOAD, incluidas las páginas ya escritas por un write-back.
 * No restaura solo la imagen original si el desalojo sucio ya tocó el swap.
 */
function limpiarMaquina() {
  var sheet = uiMainSheet();
  var fallos = [];
  uiTerminarEjecucion_();
  if (typeof reiniciarPresenciaPaginas === "function") {
    try { reiniciarPresenciaPaginas(); }
    catch (ePag) { fallos.push("páginas: " + (ePag && ePag.message ? ePag.message : ePag)); }
  }
  try { resetCPU(); }
  catch (eCpu) { fallos.push("CPU: " + (eCpu && eCpu.message ? eCpu.message : eCpu)); }
  if (typeof resetCaches === "function") {
    try { resetCaches(); }
    catch (eCache) { fallos.push("caché: " + (eCache && eCache.message ? eCache.message : eCache)); }
  }
  var layout = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UI_LAYOUT_SHEET);
  if (layout) layout.getRange(UI_PAUSE_CELL).setValue("");
  try {
    sheet.getRange(CPU_STATE).setValue("READY");
    sheet.getRange(REG_PC).setValue("00H");
  } catch (eEstado) { fallos.push("estado: " + (eEstado && eEstado.message ? eEstado.message : eEstado)); }
  var cola = (typeof describirCola_ === "function") ? describirCola_() : "no leída";
  var mensaje = fallos.length
    ? "CLEAR no terminó. " + fallos.join(" | ")
    : "CLEAR terminó. CPU READY, PC 00H, contadores de caché en cero. El programa cargado y el swap siguen. La cola no se borra: " + cola + ". Para dejarla en 0/8 use Vaciar cola, no edite F0H.";
  registrarLog(sheet, mensaje);
  return { ok: fallos.length === 0, reason: fallos.join(" | "), mensaje: mensaje, snapshot: uiSnapshot() };
}

function uiReset() { return reiniciarCpu(); }
function uiClear() { return limpiarMaquina(); }

function uiFormatBusCell(sheet, a1, format) {
  var cell = sheet.getRange(a1);
  var text = String(cell.getValue()).trim();
  if (text === "" || text === "ZZ" || text.indexOf(" ") !== -1) return;
  var value = NaN;
  if (text.endsWith("H")) value = parseInt(text.slice(0, -1), 16);
  else if (text.endsWith("B")) value = parseInt(text.slice(0, -1), 2);
  else if (/^[0-9]+$/.test(text)) value = parseInt(text, 10);
  if (isNaN(value) || value < 0 || value > 255) return;
  if (format === "HEX") cell.setValue(value.toString(16).toUpperCase().padStart(2, "0") + "H");
  else cell.setValue(String(value));
}

function uiFormatPanels(format) {
  uiMainSheet();
  if (format === "HEX") RAM_y_Reg_To_HEX();
  else RAM_y_Reg_To_DEC();
  var sheet = uiMainSheet();
  uiFormatBusCell(sheet, BUS_INT_VAL, format);
  uiFormatBusCell(sheet, BUS_EXT_DATA, format);
}

function uiFormatHex() { uiFormatPanels("HEX"); }
function uiFormatDec() { uiFormatPanels("DEC"); }

function uiInstallMenu() {
  SpreadsheetApp.getUi().createMenu("UI")
    .addItem("Show zone map", "uiShowLayout")
    .addItem("Abrir panel", "mostrarPanelSimulador")
    .addItem("Step", "uiStep")
    .addItem("Run un lote", "uiRun")
    .addItem("Pause", "uiPause")
    .addItem("Reset CPU", "uiReset")
    .addItem("Clear máquina", "uiClear")
    .addItem("Panels to HEX", "uiFormatHex")
    .addItem("Panels to DEC", "uiFormatDec")
    .addToUi();
}

function uiLeerPaginas_() {
  var paginas = [];
  if (typeof SpreadsheetApp === "undefined") return paginas;
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("TablaPaginas");
  if (!hoja) return paginas;
  var i;
  for (i = 0; i < 16; i++) {
    paginas.push({
      vpn: i,
      p: hoja.getRange(3 + i, 2).getValue(),
      pfn: hoja.getRange(3 + i, 3).getValue(),
      dirty: hoja.getRange(3 + i, 4).getValue(),
      ref: hoja.getRange(3 + i, 5).getValue()
    });
  }
  return paginas;
}

function uiSnapshotDatos_() {
  var sheet = null;
  try { sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME); } catch (e) { sheet = null; }
  function celda(a1) {
    if (!sheet) return "";
    return sheet.getRange(a1).getValue();
  }
  var cache = null;
  if (typeof leerContadoresCache === "function") {
    try { cache = leerContadoresCache(); } catch (eCache) { cache = null; }
  }
  var teclado = null;
  var lcd = null;
  if (typeof esRamLeerRegion === "function" && typeof POLITICA_ES !== "undefined" && POLITICA_ES && POLITICA_ES.teclado) {
    teclado = esRamLeerRegion(POLITICA_ES.teclado);
    lcd = esRamLeerRegion(POLITICA_ES.lcd);
  }
  var eventos = (cache && cache.eventos) ? cache.eventos.slice(-8) : [];
  return {
    estado: celda(CPU_STATE),
    pc: celda(REG_PC),
    ir: celda(REG_IR),
    mar: celda(REG_MAR),
    mdr: celda(REG_MDR),
    ax: celda(REG_AX),
    bx: celda(REG_BX),
    cx: celda(REG_CX),
    dx: celda(REG_DX),
    zf: celda(FLAG_ZF),
    cf: celda(FLAG_CF),
    sf: celda(FLAG_SF),
    alu: { op1: celda(ALU_OP1), op2: celda(ALU_OP2), sym: celda(ALU_SYM), res: celda(ALU_RES) },
    buses: {
      interno: celda(BUS_INT_VAL),
      conductorInterno: celda(BUS_INT_DRIVER),
      direccion: celda(BUS_EXT_ADDR),
      datos: celda(BUS_EXT_DATA),
      conductorDatos: celda(BUS_EXT_DRIVER),
      rd: celda(BUS_CTRL_RD),
      wr: celda(BUS_CTRL_WR),
      clk: celda(BUS_CTRL_CLK),
      io: celda(BUS_CTRL_IO)
    },
    palabra: (typeof ultimaPalabraHex !== "undefined") ? ultimaPalabraHex : "",
    cache: cache,
    eventos: eventos,
    paginas: uiLeerPaginas_(),
    teclado: teclado && teclado.ok ? teclado.bytes : [],
    lcd: lcd && lcd.ok ? lcd.bytes : [],
    lcdCursor: (typeof lcdReadCursor === "function") ? lcdReadCursor() : null,
    lcdNota: (typeof lcdUltimo_ === "function") ? lcdUltimo_() : "",
    politica: (typeof politicaGuardada_ === "function") ? (politicaGuardada_() || "") : "",
    marcosElegibles: (typeof marcosElegiblesReemplazo_ === "function") ? marcosElegiblesReemplazo_() : [],
    marcoReservado: (typeof marcoReservadoES_ === "function") ? marcoReservadoES_() : null,
    pausa: uiPaused(),
    runActivo: uiRunActiva_()
  };
}

function uiSnapshot() {
  var snap = uiSnapshotDatos_();
  if (typeof pintarVista === "function") {
    try { pintarVista(snap); } catch (eVista) {}
  }
  if (typeof esRamPintar_ === "function") {
    try { esRamPintar_(); } catch (eEs) {}
  }
  return snap;
}