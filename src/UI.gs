/**
 * Ui.gs — Step, Run, Pause, Reset and a zone map for issue #13.
 * Does not define onOpen. Does not move the cells named in Config.gs.
 * Assign drawings to uiStep, uiRun, uiPause and uiReset.
 * The old runCPU sleeps 600 ms and does not stop when the state is PAUSE.
 */

var UI_LAYOUT_SHEET = "Layout";
var UI_DELAY_CELL = "B2";
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
  return ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();
}

/** Writes the zone map. It does not edit Hoja 1. */
function uiShowLayout() {
  var sheet = uiLayoutSheet();
  var rows = [
    ["Zone", "Where it already is", "Status"],
    ["CPU state", "Hoja 1!B2 (CPU_STATE)", "Existing"],
    ["Run delay (ms)", "Layout!B2. uiRun reads it. Blank means 600.", "This file"],
    ["Instruction stack", "Hoja 1 column I from row 3", "Existing"],
    ["Registers PC IR MAR MDR AX BX CX DX", "Hoja 1!C16:C23", "Existing"],
    ["ALU and flags", "Hoja 1 ALU_OP1 B31, ALU_RES D45, flags G39:I39", "Existing"],
    ["Physical RAM, 8 frames of 32 bytes", "Hoja 1 row 8 column 15, MarcosRAM panel", "Existing"],
    ["Internal bus, address bus, data bus, control", "Hoja 1!J15:K26. High-Z text is ZZ", "Existing"],
    ["Tri-state buffers", "Hoja 1 columns J:M from row 28", "Existing"],
    ["Swap, 16 pages", "Sheet Swap, after instalarYProbarIssue23", "Not drawn here"],
    ["Frame table P, PFN, Dirty, Ref", "Sheet TablaPaginas, after instalarYProbarIssue24", "Not drawn here"],
    ["Caches, hit and miss", "No sheet yet", "Waiting"],
    ["Keyboard queue and LCD", "No sheet yet. RESERVA_ES is null", "Waiting"],
    ["Active wire", UI_ACTIVE, "Driven bus, already used by mostrarBuses"],
    ["High-Z wire", UI_HIGH_Z, "Undriven bus. See the Buses.gs change"],
    ["Hit", UI_HIT, "No cache panel to paint"],
    ["Miss or page fault", UI_MISS + " / " + UI_FAULT, "FETCH does not call the MMU yet"]
  ];
  sheet.getRange(1, 1, rows.length, 3).setValues(rows);
  sheet.getRange("B2").setValue(sheet.getRange("B2").getValue() === "" ? 600 : sheet.getRange("B2").getValue());
  sheet.getRange("A2").setBackground(UI_ACTIVE);
  sheet.getRange("A14").setBackground(UI_ACTIVE);
  sheet.getRange("A15").setBackground(UI_HIGH_Z);
  sheet.getRange("A16").setBackground(UI_HIT).setFontColor("#FFFFFF");
  sheet.getRange("A17").setBackground(UI_FAULT).setFontColor("#FFFFFF");
}

/** One micro-step. Same function the CPU already uses. */
function uiStep() {
  stepCPU();
}

function uiDelayMs() {
  var layout = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UI_LAYOUT_SHEET);
  if (!layout) return 600;
  var raw = Number(layout.getRange(UI_DELAY_CELL).getValue());
  if (!(raw >= 0) || raw > 5000) return 600;
  return raw;
}

/**
 * Run until HALT or PAUSE. Pause is noticed only between steps.
 * Stops after 5000 steps so a missing HLT cannot loop forever.
 */
function uiRun() {
  var sheet = uiMainSheet();
  var delay = uiDelayMs();
  var steps = 0;
  registrarLog(sheet, "UI run. Delay " + delay + " ms.");
  while (steps < 5000) {
    var state = String(sheet.getRange(CPU_STATE).getValue());
    if (state === "HALT" || state === "PAUSE") break;
    stepCPU();
    SpreadsheetApp.flush();
    Utilities.sleep(delay);
    steps++;
    state = String(sheet.getRange(CPU_STATE).getValue());
    if (state === "HALT" || state === "PAUSE") break;
  }
  registrarLog(sheet, "UI run stopped at " + sheet.getRange(CPU_STATE).getValue() + " after " + steps + " micro-step(s).");
}

/** Sets PAUSE. uiRun exits on the next check. The old runCPU does not. */
function uiPause() {
  pausarCPU();
}

/**
 * Calls resetCPU. That already clears registers, flags, physical RAM,
 * the visual stack, the ALU, the buses and the LOG.
 * It does not clear Swap, TablaPaginas, a cache, the keyboard or the LCD.
 */
function uiReset() {
  resetCPU();
  var sheet = uiMainSheet();
  registrarLog(sheet, "UI reset used resetCPU. Swap, TablaPaginas, caches and I/O were left as they are.");
}

function uiFormatBusCell(sheet, a1, format) {
  var cell = sheet.getRange(a1);
  var text = String(cell.getValue()).trim();
  if (text === "" || text === "ZZ" || text.indexOf(" ") !== -1) return;
  var value = NaN;
  if (text.endsWith("H")) value = parseInt(text.slice(0, -1), 16);
  else if (text.endsWith("B")) value = parseInt(text.slice(0, -1), 2);
  else if (/^[0-9]+$/.test(text)) value = parseInt(text, 10);
  if (isNaN(value)) return;
  var byte = value & 0xFF;
  if (format === "HEX") cell.setValue(byte.toString(16).toUpperCase().padStart(2, "0") + "H");
  else cell.setValue(String(byte));
}

/** HEX or DEC for RAM, AX..DX, the ALU, and the internal and data bus values. */
function uiFormatPanels(format) {
  if (format === "HEX") RAM_y_Reg_To_HEX();
  else RAM_y_Reg_To_DEC();
  var sheet = uiMainSheet();
  uiFormatBusCell(sheet, BUS_INT_VAL, format);
  uiFormatBusCell(sheet, BUS_EXT_DATA, format);
}

function uiFormatHex() { uiFormatPanels("HEX"); }
function uiFormatDec() { uiFormatPanels("DEC"); }

/** Menu only. Do not add onOpen. */
function uiInstallMenu() {
  SpreadsheetApp.getUi().createMenu("UI")
    .addItem("Show zone map", "uiShowLayout")
    .addItem("Step", "uiStep")
    .addItem("Run", "uiRun")
    .addItem("Pause", "uiPause")
    .addItem("Reset", "uiReset")
    .addItem("Panels to HEX", "uiFormatHex")
    .addItem("Panels to DEC", "uiFormatDec")
    .addToUi();
}