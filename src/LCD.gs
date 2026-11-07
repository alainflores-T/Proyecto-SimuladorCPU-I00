/**
 * LCD.gs — RAM-backed 8x1 display for issue #34.
 * Requires Keyboard.gs. Uses ioPersonalMap().lcd.
 * Does not change RESERVA_ES.
 */
function lcdReadCursor() {
  if (typeof PropertiesService === "undefined") return 0;
  var raw = PropertiesService.getDocumentProperties().getProperty("LCD_CURSOR");
  var n = parseInt(raw, 10);
  if (n !== n || n < 0 || n > 8) return 0;
  return n;
}

function lcdSaveCursor(cursor) {
  if (typeof PropertiesService === "undefined") return;
  PropertiesService.getDocumentProperties().setProperty("LCD_CURSOR", String(cursor));
}

function lcdParseByte(value) {
  if (typeof value === "number") {
    if (value !== value || Math.floor(value) !== value || value < 0 || value > 255) return null;
    return value;
  }
  var text = String(value == null ? "" : value).trim();
  if (/^[0-9A-Fa-f]{1,2}H$/i.test(text)) {
    var hex = parseInt(text.slice(0, -1), 16);
    return hex <= 255 ? hex : null;
  }
  if (/^[0-9]{1,3}$/.test(text)) {
    var dec = parseInt(text, 10);
    return dec <= 255 ? dec : null;
  }
  return null;
}

function lcdGlyph(n) {
  if (n >= 32 && n <= 126) return String.fromCharCode(n);
  if (n === 0) return "";
  return ".";
}

function lcdSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName("LCD") || ss.insertSheet("LCD");
}

function lcdShowPanel(note) {
  var sheet = lcdSheet();
  var region = ioPersonalMap().lcd;
  sheet.getRange("A1").setValue("LCD 8x1");
  sheet.getRange("A2").setValue("Cursor");
  sheet.getRange("A3").setValue("Byte to write");
  sheet.getRange("A4").setValue(note || "");
  var gate = ioCanUseRam();
  var bytes = null;
  if (gate.ok) {
    var read = ioReadBytes(region);
    if (read.ok) bytes = read.bytes;
    else note = read.reason;
  }
  var chars = [];
  for (var i = 0; i < region.bytes; i++) chars.push(bytes ? lcdGlyph(bytes[i]) : "");
  var range = sheet.getRange(6, 1, 1, region.bytes);
  range.setValues([chars]);
  range.setFontFamily("Roboto Mono").setFontSize(18).setHorizontalAlignment("center");
  range.setBackground("#1565C0").setFontColor("#FFFFFF");
  sheet.getRange("B2").setValue(gate.ok ? lcdReadCursor() : "");
  if (!gate.ok) sheet.getRange("A4").setValue(gate.reason);
  else if (note) sheet.getRange("A4").setValue(note);
}

function lcdReceive(value) {
  var byte = lcdParseByte(value);
  if (byte === null) return { ok: false, reason: "LCD value must be one byte, for example 48H or 72." };
  var gate = ioCanUseRam();
  if (!gate.ok) return gate;
  var read = ioReadBytes(gate.map.lcd);
  if (!read.ok) return read;
  var cursor = lcdReadCursor();
  if (cursor >= gate.map.lcd.bytes) return { ok: false, reason: "LCD line is full." };
  var slots = read.bytes.slice();
  slots[cursor] = byte;
  var wrote = ioWriteBytes(gate.map.lcd, slots);
  if (!wrote.ok) return wrote;
  lcdSaveCursor(cursor + 1);
  return { ok: true, cursor: cursor + 1, byte: byte };
}

function lcdWriteFromPanel() {
  var sheet = lcdSheet();
  var result = lcdReceive(sheet.getRange("B3").getValue());
  lcdShowPanel(result.ok ? "Wrote " + lcdParseByte(sheet.getRange("B3").getValue()) : result.reason);
  return result;
}

function lcdClear() {
  var gate = ioCanUseRam();
  if (!gate.ok) {
    if (typeof SpreadsheetApp !== "undefined") lcdShowPanel(gate.reason);
    return gate;
  }
  var zeros = [];
  for (var i = 0; i < gate.map.lcd.bytes; i++) zeros.push(0);
  var wrote = ioWriteBytes(gate.map.lcd, zeros);
  if (!wrote.ok) return wrote;
  lcdSaveCursor(0);
  if (typeof SpreadsheetApp !== "undefined") lcdShowPanel("LCD cleared.");
  return { ok: true };
}

function lcdReset() {
  return lcdClear();
}

function lcdReceiveFromBus(sheet, value) {
  var result = lcdReceive(value);
  if (!result.ok) registrarLog(sheet, "OUT blocked: " + result.reason);
  else registrarLog(sheet, "OUT LCD <- " + value + " Ld_LCD=1");
  return result;
}

function lcdInstallMenu() {
  lcdShowPanel(ioCanUseRam().ok ? "LCD ready." : "Reservation off. RAM is not the display until the keyboard opt-in is enabled.");
  SpreadsheetApp.getUi().createMenu("LCD")
    .addItem("Write byte from B3", "lcdWriteFromPanel")
    .addItem("Clear screen", "lcdClear")
    .addToUi();
}