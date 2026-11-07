/**
 * Editor.gs — Cell editor and syntax check for issue #18.
 * Columns on sheet Editor: Line, Label, Instruction, Comment, Status.
 * Label resolution uses assemble() from Assembler.gs. This file does not
 * define onOpen and does not rename Hoja 1, Programas, Directory or Sources.
 */

var EDITOR_SHEET = "Editor";
var EDITOR_MAX_ROWS = 200;
var EDITOR_IMM_MAX = 0xFF;
var EDITOR_ADDR_MAX = 0x1FF;

function editorParseNumber(text) {
  var t = String(text || "").trim().toUpperCase();
  if (!t) return NaN;
  if (typeof REG_CODES !== "undefined" && REG_CODES.hasOwnProperty(t)) return NaN;
  if (typeof PORT_CODES !== "undefined" && PORT_CODES.hasOwnProperty(t)) return NaN;
  if (t.endsWith("H")) return parseInt(t.slice(0, -1), 16);
  if (t.startsWith("0X")) return parseInt(t.slice(2), 16);
  if (t.endsWith("B") && /^[01]+B$/.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
  return NaN;
}

function editorIsLabel(text) {
  return /^[A-Z_][A-Z0-9_]*$/.test(String(text || "").toUpperCase());
}

/** Splits one source line into label, instruction and comment. */
function editorLineFromSource(raw) {
  var text = String(raw == null ? "" : raw);
  var comment = "";
  var semi = text.indexOf(";");
  if (semi !== -1) {
    comment = text.slice(semi + 1).trim();
    text = text.slice(0, semi);
  }
  var slash = text.indexOf("//");
  if (slash !== -1) {
    comment = (comment ? comment + " " : "") + text.slice(slash + 2).trim();
    text = text.slice(0, slash);
  }
  text = text.trim();
  var label = "";
  var match = text.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
  if (match) {
    label = match[1];
    text = (match[2] || "").trim();
  }
  return { label: label, instruction: text, comment: comment };
}

/** Rebuilds one source line from the three editor columns. */
function editorSourceFromEntry(entry) {
  var label = String(entry.label || "").trim().replace(/:$/, "");
  var instruction = String(entry.instruction || "").trim();
  var comment = String(entry.comment || "").trim().replace(/^;+/, "").trim();
  var text = "";
  if (label) text += label + ":";
  if (instruction) text += (text ? " " : "") + instruction;
  if (comment) text += (text ? " " : "") + "; " + comment;
  return text;
}

function editorSplitOperands(tail) {
  if (!tail) return [];
  if (tail.indexOf(",") === -1) return [tail.trim()];
  return tail.split(",").map(function (part) { return part.trim(); }).filter(function (part) { return part !== ""; });
}

function editorClassify(token) {
  var original = String(token || "").trim();
  var brackets = original.indexOf("[") !== -1;
  var cleaned = original.replace(/[\[\]]/g, "").trim().toUpperCase();
  if (!cleaned) return { kind: "empty" };
  if (REG_CODES.hasOwnProperty(cleaned)) return { kind: "reg", name: cleaned, brackets: brackets };
  if (PORT_CODES.hasOwnProperty(cleaned)) return { kind: "port", name: cleaned, brackets: brackets };
  var number = editorParseNumber(cleaned);
  if (!isNaN(number)) return { kind: "number", value: number, brackets: brackets, text: cleaned };
  if (editorIsLabel(cleaned)) return { kind: "label", name: cleaned, brackets: brackets };
  return { kind: "bad", text: original };
}

function editorFail(line, message) {
  return { ok: false, line: line, message: message + " on line " + line };
}

/**
 * Checks one instruction. line is the 1-based source line.
 * Returns { ok:true } or { ok:false, line, message }.
 */
function editorCheckInstruction(line, label, instruction) {
  var text = String(instruction || "").trim();
  if (!text) {
    if (label && !editorIsLabel(label)) return editorFail(line, "Invalid label '" + label + "'");
    return { ok: true };
  }
  if (label && !editorIsLabel(label)) return editorFail(line, "Invalid label '" + label + "'");

  var parts = text.split(/\s+/);
  var mnemonic = parts[0].toUpperCase();
  var tail = text.substring(parts[0].length).trim();
  var operands = editorSplitOperands(tail);

  if (mnemonic === "DB") {
    if (operands.length === 0) return editorFail(line, "DB requires at least one byte");
    var items = tail.split(/[,\s]+/).filter(Boolean);
    for (var d = 0; d < items.length; d++) {
      var item = items[d];
      var byte = editorParseNumber(item);
      if (isNaN(byte)) {
        var quoted = item.match(/^'(.)'$/);
        if (quoted) byte = quoted[1].charCodeAt(0);
      }
      if (isNaN(byte) || byte < 0 || byte > EDITOR_IMM_MAX) return editorFail(line, "Invalid operand '" + item + "'");
    }
    return { ok: true };
  }
  if (mnemonic === "ORG" || mnemonic === "EQU") {
    if (mnemonic === "EQU" && !label) return editorFail(line, "EQU requires a label");
    if (operands.length !== 1) return editorFail(line, mnemonic + " requires one value");
    var org = editorClassify(operands[0]);
    if (org.kind !== "number" || org.value < 0 || org.value > EDITOR_ADDR_MAX) {
      return editorFail(line, "Address out of range");
    }
    return { ok: true };
  }
  if (!OPCODES.hasOwnProperty(mnemonic)) return editorFail(line, "Unknown mnemonic '" + mnemonic + "'");

  function needCount(n) {
    if (operands.length !== n) return editorFail(line, mnemonic + " requires " + n + " operand" + (n === 1 ? "" : "s"));
    return null;
  }
  function asReg(token) {
    var info = editorClassify(token);
    if (info.kind !== "reg" || info.brackets) return editorFail(line, "Invalid operand '" + token + "'");
    return null;
  }
  function asImm(token) {
    var info = editorClassify(token);
    if (info.kind === "reg" && !info.brackets) return null;
    if (info.kind !== "number" || info.brackets) return editorFail(line, "Invalid operand '" + token + "'");
    if (info.value < 0 || info.value > EDITOR_IMM_MAX) return editorFail(line, "Immediate out of range");
    return null;
  }
  function asAddr(token) {
    var info = editorClassify(token);
    if (info.kind === "label") return null;
    if (info.kind !== "number") return editorFail(line, "Invalid operand '" + token + "'");
    if (info.value < 0 || info.value > EDITOR_ADDR_MAX) return editorFail(line, "Address out of range");
    return null;
  }
  function asPort(token, expected) {
    var info = editorClassify(token);
    if (info.kind !== "port" || info.name !== expected) return editorFail(line, "Invalid operand '" + token + "'");
    return null;
  }

  var countError = null;
  if (mnemonic === "NOP" || mnemonic === "HLT") countError = needCount(0);
  else if (mnemonic === "INC" || mnemonic === "DEC" || mnemonic === "JMP" || mnemonic === "JZ" ||
      mnemonic === "JNZ" || mnemonic === "JC" || mnemonic === "JS") countError = needCount(1);
  else countError = needCount(2);
  if (countError) return countError;

  if (mnemonic === "NOP" || mnemonic === "HLT") return { ok: true };
  if (mnemonic === "INC" || mnemonic === "DEC") return asReg(operands[0]) || { ok: true };
  if (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" || mnemonic === "JC" || mnemonic === "JS") {
    return asAddr(operands[0]) || { ok: true };
  }
  if (mnemonic === "LD" || mnemonic === "LOAD") {
    return asReg(operands[0]) || asAddr(operands[1]) || { ok: true };
  }
  if (mnemonic === "ST" || mnemonic === "STORE") {
    return asAddr(operands[0]) || asImm(operands[1]) || { ok: true };
  }
  if (mnemonic === "IN") return asReg(operands[0]) || asPort(operands[1], "KBD") || { ok: true };
  if (mnemonic === "OUT") return asPort(operands[0], "LCD") || asReg(operands[1]) || { ok: true };
  return asReg(operands[0]) || asImm(operands[1]) || { ok: true };
}

/**
 * Checks every editor row, then asks assemble() to resolve labels.
 * entries: [{label, instruction, comment}, ...]
 */
function editorCheckProgram(entries) {
  var rows = [];
  var errors = [];
  var sources = [];
  var i;
  for (i = 0; i < entries.length; i++) {
    var entry = entries[i] || {};
    var line = i + 1;
    var label = String(entry.label || "").trim();
    var instruction = String(entry.instruction || "").trim();
    var comment = String(entry.comment || "").trim();
    var local = editorCheckInstruction(line, label, instruction);
    var status = "OK";
    if (!local.ok) {
      status = local.message;
      errors.push(local.message);
    }
    rows.push({ line: line, label: label, instruction: instruction, comment: comment, status: status });
    sources.push(editorSourceFromEntry(entry));
  }
  if (typeof assemble === "function") {
    var assembled = assemble(sources.join("\n"));
    if (!assembled.ok) {
      for (var e = 0; e < assembled.errors.length; e++) {
        var message = assembled.errors[e];
        var lineMatch = message.match(/Line (\d+)/i);
        if (lineMatch) {
          var index = parseInt(lineMatch[1], 10) - 1;
          if (rows[index] && rows[index].status !== "OK") continue;
          if (rows[index]) rows[index].status = message;
        }
        errors.push(message);
      }
    }
  }
  var unique = [];
  var seen = {};
  for (var u = 0; u < errors.length; u++) {
    if (!seen[errors[u]]) {
      seen[errors[u]] = true;
      unique.push(errors[u]);
    }
  }
  return { ok: unique.length === 0, errors: unique, rows: rows, source: sources };
}

function editorSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(EDITOR_SHEET) || ss.insertSheet(EDITOR_SHEET);
}

function editorEnsureHeader(sheet) {
  var headers = ["Line", "Label", "Instruction", "Comment", "Status"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange("G1").setValue("Catalog id");
  sheet.getRange("G2").setValue("Catalog name");
}

function editorReadEntries(sheet) {
  var values = sheet.getRange(2, 2, EDITOR_MAX_ROWS, 3).getValues();
  var entries = [];
  var last = -1;
  var i;
  for (i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() || String(values[i][1] || "").trim() || String(values[i][2] || "").trim()) last = i;
  }
  var count = last + 1;
  for (i = 0; i < count; i++) {
    entries.push({ label: values[i][0], instruction: values[i][1], comment: values[i][2] });
  }
  return entries;
}

function editorWriteRows(sheet, rows) {
  var block = [];
  var i;
  for (i = 0; i < EDITOR_MAX_ROWS; i++) {
    if (i < rows.length) {
      block.push([rows[i].line, rows[i].label, rows[i].instruction, rows[i].comment, rows[i].status]);
    } else {
      block.push(["", "", "", "", ""]);
    }
  }
  var range = sheet.getRange(2, 1, EDITOR_MAX_ROWS, 5);
  range.setValues(block);
  var backgrounds = [];
  for (i = 0; i < EDITOR_MAX_ROWS; i++) {
    var bad = i < rows.length && rows[i].status !== "OK";
    var color = bad ? "#FFCDD2" : null;
    backgrounds.push([null, null, null, null, color]);
  }
  range.setBackgrounds(backgrounds);
}

/** Sheet button: validate the grid and paint Status red on errors. */
function editorCheckSyntax() {
  var sheet = editorSheet();
  editorEnsureHeader(sheet);
  var result = editorCheckProgram(editorReadEntries(sheet));
  editorWriteRows(sheet, result.rows);
  if (!result.ok) SpreadsheetApp.getUi().alert(result.errors.join("\n"));
  else SpreadsheetApp.getUi().alert("Syntax OK. " + result.rows.length + " line(s).");
  return result;
}

/**
 * Lines for assembleAndShowListing. Returns null unless this sheet is the
 * structured editor (A1 is "Line"), so a raw column-A program still works.
 */
function editorSourceLines() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(EDITOR_SHEET);
  if (!sheet) return null;
  if (String(sheet.getRange("A1").getValue()) !== "Line") return null;
  var entries = editorReadEntries(sheet);
  var lines = [];
  for (var i = 0; i < entries.length; i++) lines.push(editorSourceFromEntry(entries[i]));
  while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
  return lines;
}

function editorSelectedProgram() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var directory = ss.getSheetByName(CATALOG_SHEET);
  var sources = ss.getSheetByName(CATALOG_SOURCE_SHEET);
  if (!directory || !sources) return { error: "Run catalogInitialize first." };
  var name = directory.getRange(CATALOG_SELECTOR).getValue();
  var program = catalogFindProgram(catalogReadPrograms(sources), name);
  if (!program) return { error: "Select a program in Directory!B1." };
  return { program: program, sources: sources, directory: directory };
}

/** Reloads the catalog selection into the five editor columns. */
function editorLoadSelected() {
  var found = editorSelectedProgram();
  if (found.error) {
    SpreadsheetApp.getUi().alert(found.error);
    return;
  }
  var sheet = editorSheet();
  editorEnsureHeader(sheet);
  var entries = [];
  for (var i = 0; i < found.program.lines.length; i++) entries.push(editorLineFromSource(found.program.lines[i]));
  var checked = editorCheckProgram(entries);
  editorWriteRows(sheet, checked.rows);
  sheet.getRange("H1").setValue(found.program.id);
  sheet.getRange("H2").setValue(found.program.name);
  if (!checked.ok) SpreadsheetApp.getUi().alert(checked.errors.join("\n"));
  return checked;
}

/** Writes the grid back to the same Sources column and refreshes Directory. */
function editorSaveToCatalog() {
  var sheet = editorSheet();
  editorEnsureHeader(sheet);
  var checked = editorCheckProgram(editorReadEntries(sheet));
  editorWriteRows(sheet, checked.rows);
  if (!checked.ok) {
    SpreadsheetApp.getUi().alert("Not saved.\n" + checked.errors.join("\n"));
    return checked;
  }
  var found = editorSelectedProgram();
  if (found.error) {
    SpreadsheetApp.getUi().alert(found.error);
    return checked;
  }
  var storedId = sheet.getRange("H1").getValue();
  var programs = catalogReadPrograms(found.sources);
  var target = null;
  var i;
  if (storedId !== "" && storedId != null) {
    for (i = 0; i < programs.length; i++) if (String(programs[i].id) === String(storedId)) target = programs[i];
  }
  if (!target) target = found.program;
  var lines = [];
  for (i = 0; i < checked.rows.length; i++) {
    var source = editorSourceFromEntry(checked.rows[i]);
    if (source.trim()) lines.push(source);
  }
  catalogWriteProgram(found.sources, target.column, { id: target.id, name: target.name, lines: lines });
  catalogRefreshDirectory(found.directory, catalogReadPrograms(found.sources), catalogDescriptionMap(found.directory));
  SpreadsheetApp.getUi().alert("Saved " + target.name + " to the catalog.");
  return checked;
}

/** Menu only. Do not add onOpen in this file. */
function editorInstallMenu() {
  SpreadsheetApp.getUi().createMenu("Editor")
    .addItem("Load selected program", "editorLoadSelected")
    .addItem("Check syntax", "editorCheckSyntax")
    .addItem("Save to catalog", "editorSaveToCatalog")
    .addToUi();
}