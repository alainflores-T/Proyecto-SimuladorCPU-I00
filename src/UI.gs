/**
 * UI controls for issue #13. No onOpen hook.
 * Preserve CPU_STATE when pausing so the micro-cycle can resume.
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
    ["Caches, hit and miss", "No sheet yet", "Waiting"],
    ["Keyboard queue and LCD", "No sheet yet. RESERVA_ES is null", "Waiting"],
    ["Active wire", UI_ACTIVE, "Driven bus"],
    ["High-Z wire", UI_HIGH_Z, "Undriven bus"],
    ["Hit", UI_HIT, "No cache panel to paint"],
    ["Miss or page fault", UI_MISS + " / " + UI_FAULT, "FETCH does not call the MMU yet"]
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
  uiMainSheet();
  stepCPU();
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

/** Run again to clear the pause request and continue the micro-cycle. */
function uiRun() {
  var sheet = uiMainSheet();
  var layout = uiLayoutSheet();
  layout.getRange(UI_PAUSE_CELL).setValue("");
  var delay = uiDelayMs();
  var steps = 0;
  registrarLog(sheet, "UI run. Delay " + delay + " ms.");
  while (steps < 5000) {
    var state = String(sheet.getRange(CPU_STATE).getValue());
    if (state === "HALT" || uiPaused()) break;
    stepCPU();
    SpreadsheetApp.flush();
    Utilities.sleep(delay);
    steps++;
    state = String(sheet.getRange(CPU_STATE).getValue());
    if (state === "HALT" || uiPaused()) break;
  }
  registrarLog(sheet, "UI run stopped at " + sheet.getRange(CPU_STATE).getValue() + " after " + steps + " micro-step(s).");
}

/** Request a stop between micro-steps without losing the CPU state. */
function uiPause() {
  uiLayoutSheet().getRange(UI_PAUSE_CELL).setValue("PAUSE");
}

/** Reset existing CPU components; other modules remain unchanged. */
function uiReset() {
  var sheet = uiMainSheet();
  resetCPU();
  var layout = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(UI_LAYOUT_SHEET);
  if (layout) layout.getRange(UI_PAUSE_CELL).setValue("");
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
    .addItem("Step", "uiStep")
    .addItem("Run", "uiRun")
    .addItem("Pause", "uiPause")
    .addItem("Reset", "uiReset")
    .addItem("Panels to HEX", "uiFormatHex")
    .addItem("Panels to DEC", "uiFormatDec")
    .addToUi();
}