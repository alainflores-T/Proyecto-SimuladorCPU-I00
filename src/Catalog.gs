/**
 * Catalog.gs — Program directory (catalog on the "Directory" sheet).
 * Pure logic at the top (instruction/byte/page counts without depending on the assembler).
 * Sheets glue at the bottom: create the sheet, migrate Programas, buttons.
 *
 * Directory columns: ID | Name | Description | # instr | Bytes | Pages | Status
 * Virtual page = 32 bytes (ceil(bytes/32) when contiguous from 0).
 */

var CAT_SHEET_NAME = "Directory";
var CAT_EDITOR_SHEET = "Editor";
var CAT_EDITOR_RANGE = "A1:A200";
var CAT_SELECTOR_CELL = "B1"; // active-program dropdown cell
var CAT_HEADER = ["ID", "Name", "Description", "# instr", "Bytes", "Pages", "Status"];
var CAT_PAGE_SIZE = 32;
var CAT_SOURCE_PREFIX = "SRC_"; // sheets SRC_1, SRC_2, ...
var CAT_STATUSES = ["Draft", "Assembled", "Error", "Loaded"];

/**
 * Known mnemonics for the lightweight counter (does not really assemble).
 * Keeps the catalog independent of the assembler.
 */
var CAT_MNEMONICS = {
  "NOP": 1, "MOV": 3, "ADD": 3, "SUB": 3, "INC": 2, "DEC": 2, "CMP": 3,
  "LD": 3, "LOAD": 3, "ST": 3, "STORE": 3, "JMP": 2, "JZ": 2, "JNZ": 2,
  "JC": 2, "JS": 2, "AND": 3, "OR": 3, "IN": 3, "OUT": 3, "HLT": 1
};

/**
 * Approximate instruction / byte / page count from source.
 * Does not resolve labels or ORG: catalog metadata only.
 * If the line is DB, add the number of values.
 * Returns { instructions, bytes, pages, errors[] }.
 */
function catalogCountSource(source) {
  var lines = Array.isArray(source)
    ? source
    : String(source || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var instructions = 0;
  var bytes = 0;
  var errors = [];
  var loc = 0;
  var maxLoc = 0;
  var touched = {};

  for (var i = 0; i < lines.length; i++) {
    var raw = String(lines[i] == null ? "" : lines[i]);
    var code = raw.split(";")[0].split("//")[0].trim();
    if (!code) continue;

    // strip label
    var labelMatch = code.match(/^[A-Za-z_][A-Za-z0-9_]*:\s*(.*)$/);
    if (labelMatch) code = (labelMatch[1] || "").trim();
    if (!code) continue;

    var parts = code.split(/\s+/);
    var mnem = (parts[0] || "").toUpperCase();
    var rest = code.substring(parts[0].length).trim();

    if (mnem === "ORG") {
      var n = NaN;
      var t = rest.replace(/[\[\]]/g, "").trim().toUpperCase();
      if (t.endsWith("H")) n = parseInt(t.slice(0, -1), 16);
      else n = parseInt(t, 10);
      if (!isNaN(n)) loc = n & 0x1FF;
      continue;
    }
    if (mnem === "EQU") continue;

    if (mnem === "DB") {
      var vals = rest.split(/[,\s]+/).filter(Boolean);
      var dbn = vals.length || 1;
      for (var b = 0; b < dbn; b++) touched[loc + b] = true;
      loc += dbn;
      if (loc > maxLoc) maxLoc = loc;
      continue;
    }

    var sz = CAT_MNEMONICS[mnem];
    if (sz == null) {
      errors.push("Line " + (i + 1) + ": unknown mnemonic '" + mnem + "'");
      continue;
    }
    // Rough adjustment: if the text has an address above FFH, add 1 byte
    var up = rest.toUpperCase();
    if (/\b1[0-9A-F]{2}H\b/.test(up) || /\[[01][0-9A-F]{2}H\]/.test(up)) {
      if (mnem === "LD" || mnem === "LOAD" || mnem === "ST" || mnem === "STORE" ||
          mnem === "JMP" || mnem === "JZ" || mnem === "JNZ" || mnem === "JC" || mnem === "JS") {
        sz += 1;
      }
    }
    for (var c = 0; c < sz; c++) touched[loc + c] = true;
    loc += sz;
    if (loc > maxLoc) maxLoc = loc;
    instructions++;
  }

  var byteCount = 0;
  var pagesSet = {};
  for (var a in touched) {
    byteCount++;
    pagesSet[Math.floor(parseInt(a, 10) / CAT_PAGE_SIZE)] = true;
  }
  var pages = 0;
  for (var p in pagesSet) pages++;
  if (pages === 0 && byteCount === 0) pages = 0;
  else if (pages === 0) pages = Math.ceil(byteCount / CAT_PAGE_SIZE);

  return {
    instructions: instructions,
    bytes: byteCount,
    pages: pages,
    errors: errors
  };
}

/**
 * Pure model of a catalog program.
 */
function catalogCreateEntry(id, name, description, sourceLines, status) {
  var c = catalogCountSource(sourceLines);
  return {
    id: id,
    name: name,
    description: description || "",
    instructions: c.instructions,
    bytes: c.bytes,
    pages: c.pages,
    status: status || (c.errors.length ? "Error" : "Draft"),
    source: Array.isArray(sourceLines) ? sourceLines.slice() : String(sourceLines || "").split("\n"),
    countErrors: c.errors
  };
}

/**
 * Migrates the 5 loose programs from the Programas sheet (columns A, H, K, O, R).
 * Documented assumptions:
 *  - Col A rows 2.. = Program 1 (memory access / carry), header in A1.
 *  - Col H rows 3.. = Program 2 (accumulator with a DEC/JNZ loop).
 *  - Col K rows 3.. = Program 3 (INC/CMP counter).
 *  - Col O rows 3.. = Program 4 (CMP and store).
 *  - Col R rows 3.. = Program 5 (compare with two HLT exits).
 * Absolute index jumps are rewritten as labels when obvious.
 */
function catalogDefaultMigratedPrograms() {
  return [
    catalogCreateEntry(1, "carry-memory",
      "Loads AX/BX from 80H/81H, adds, branches on carry; writes the result.",
      [
        "; Migrated from Programas!A (indexes -> labels)",
        "start:",
        "  LD AX, [80H]",
        "  LD BX, [81H]",
        "  ADD AX, BX",
        "  JC end",
        "  ST [80H], BX",
        "  ST [80H], AX",
        "  JMP start",
        "end:",
        "  HLT"
      ], "Draft"),
    catalogCreateEntry(2, "accumulator-loop",
      "Adds 03H four times into AX using DEC/JNZ; stores at 20H.",
      [
        "; Migrated from Programas!H",
        "  MOV AX, 00H",
        "  MOV BX, 04H",
        "loop:",
        "  ADD AX, 03H",
        "  DEC BX",
        "  JNZ loop",
        "  ST [20H], AX",
        "  HLT"
      ], "Draft"),
    catalogCreateEntry(3, "counter-five",
      "Increments AX until 5 and stores it at 20H.",
      [
        "; Migrated from Programas!K",
        "  MOV AX, 00H",
        "loop:",
        "  INC AX",
        "  CMP AX, 05H",
        "  JNZ loop",
        "  ST [20H], AX",
        "  HLT"
      ], "Draft"),
    catalogCreateEntry(4, "cmp-store",
      "Compares AX=03H with BX=08H and stores AX at 20H.",
      [
        "; Migrated from Programas!O",
        "  MOV AX, 03H",
        "  MOV BX, 08H",
        "  CMP AX, BX",
        "  ST [20H], AX",
        "  HLT"
      ], "Draft"),
    catalogCreateEntry(5, "cmp-double-hlt",
      "If AX==[10H] writes 00H; otherwise FFH. Two HLT exits.",
      [
        "; Migrated from Programas!R",
        "  MOV AX, 0AH",
        "  LD BX, [10H]",
        "  CMP AX, BX",
        "  JZ equal",
        "  ST [30H], 00H",
        "  HLT",
        "equal:",
        "  ST [30H], FFH",
        "  HLT"
      ], "Draft")
  ];
}

/**
 * Serializes entries to table rows (without source).
 */
function catalogEntriesToRows(entries) {
  var rows = [CAT_HEADER.slice()];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    rows.push([
      e.id,
      e.name,
      e.description,
      e.instructions,
      e.bytes,
      e.pages,
      e.status
    ]);
  }
  return rows;
}

/**
 * Builds the exportable .asm text of a program.
 */
function catalogExportAsm(entry) {
  var header = [
    "; Program: " + entry.name,
    "; ID: " + entry.id,
    "; " + (entry.description || ""),
    "; Bytes≈" + entry.bytes + "  Pages≈" + entry.pages + "  Instr≈" + entry.instructions,
    ""
  ];
  return header.concat(entry.source).join("\n") + "\n";
}

// --- Google Sheets glue ---

function catalogGetSheet_(name, create) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh && create) sh = ss.insertSheet(name);
  return sh;
}

/**
 * Creates/updates the Directory sheet with the table and the dropdown.
 * Migrates from Programas when Directory is empty.
 */
function catalogInitDirectory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dir = catalogGetSheet_(CAT_SHEET_NAME, true);
  var editor = catalogGetSheet_(CAT_EDITOR_SHEET, true);

  var last = dir.getLastRow();
  var entries;
  if (last < 2) {
    entries = catalogDefaultMigratedPrograms();
    // Save sources on SRC_n sheets
    for (var i = 0; i < entries.length; i++) {
      catalogSaveSource_(entries[i]);
    }
    var rows = catalogEntriesToRows(entries);
    dir.clear();
    dir.getRange(1, 1, rows.length, CAT_HEADER.length).setValues(rows);
    dir.getRange(1, 1, 1, CAT_HEADER.length)
      .setFontWeight("bold").setBackground("#1F4E78").setFontColor("#FFFFFF");
    // Selector
    dir.getRange("A1").setNote("Program catalog (emulated disk)");
    dir.getRange(CAT_SELECTOR_CELL).setValue(entries[0].name);
    var names = entries.map(function (e) { return e.name; });
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(names, true)
      .setAllowInvalid(false)
      .build();
    dir.getRange(CAT_SELECTOR_CELL).setDataValidation(rule);
    dir.getRange("A1").setValue("ID"); // restore header after the note
    // Selector label to the left of B1; a helper row is clearer than D1/E1
    dir.insertRows(1);
    dir.getRange("A1").setValue("Active program:");
    dir.getRange("B1").setValue(entries[0].name);
    dir.getRange("B1").setDataValidation(rule);
    dir.getRange("C1").setValue("Buttons: Open / New / Duplicate (assign these functions)");
    // Rewrite the table from row 3
    dir.getRange(3, 1, rows.length, CAT_HEADER.length).setValues(rows);
    dir.getRange(3, 1, 1, CAT_HEADER.length)
      .setFontWeight("bold").setBackground("#1F4E78").setFontColor("#FFFFFF");
  }

  SpreadsheetApp.getUi().alert(
    "Directory ready. Use the dropdown in B1 and the buttons:\n" +
    "catalogOpenInEditor / catalogNewProgram / catalogDuplicateProgram"
  );
}

function catalogSaveSource_(entry) {
  var sheetName = CAT_SOURCE_PREFIX + entry.id;
  var sh = catalogGetSheet_(sheetName, true);
  sh.clear();
  var vals = entry.source.map(function (l) { return [l]; });
  if (vals.length === 0) vals = [[""]];
  sh.getRange(1, 1, vals.length, 1).setValues(vals);
  sh.getRange("B1").setValue(entry.name);
  sh.getRange("C1").setValue(entry.description);
}

function catalogReadSource_(id) {
  var sh = catalogGetSheet_(CAT_SOURCE_PREFIX + id, false);
  if (!sh) return [];
  var values = sh.getRange(CAT_EDITOR_RANGE).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    out.push(values[i][0] == null ? "" : String(values[i][0]));
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

function catalogReadTable_() {
  var dir = catalogGetSheet_(CAT_SHEET_NAME, false);
  if (!dir) return [];
  // Find the header row (looks for "ID")
  var data = dir.getDataRange().getValues();
  var start = 0;
  for (var r = 0; r < data.length; r++) {
    if (String(data[r][0]).toUpperCase() === "ID") { start = r; break; }
  }
  var entries = [];
  for (var i = start + 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] === "" || row[0] == null) continue;
    entries.push({
      id: Number(row[0]),
      name: String(row[1] || ""),
      description: String(row[2] || ""),
      instructions: Number(row[3] || 0),
      bytes: Number(row[4] || 0),
      pages: Number(row[5] || 0),
      status: String(row[6] || "Draft"),
      rowIndex: i + 1 // 1-based sheet row
    });
  }
  return entries;
}

function catalogFindByName_(name) {
  var all = catalogReadTable_();
  var up = String(name || "").toUpperCase();
  for (var i = 0; i < all.length; i++) {
    if (all[i].name.toUpperCase() === up) return all[i];
  }
  return null;
}

function catalogActiveProgramName_() {
  var dir = catalogGetSheet_(CAT_SHEET_NAME, false);
  if (!dir) return null;
  return String(dir.getRange("B1").getValue() || "").trim();
}

/**
 * Button: Open in editor — copies the active program's source to the Editor sheet.
 */
function catalogOpenInEditor() {
  var name = catalogActiveProgramName_();
  var entry = catalogFindByName_(name);
  if (!entry) {
    SpreadsheetApp.getUi().alert("Select a valid program in B1.");
    return;
  }
  var source = catalogReadSource_(entry.id);
  var editor = catalogGetSheet_(CAT_EDITOR_SHEET, true);
  editor.getRange(CAT_EDITOR_RANGE).clearContent();
  if (source.length) {
    var vals = source.map(function (l) { return [l]; });
    editor.getRange(1, 1, vals.length, 1).setValues(vals);
  }
  editor.getRange("B1").setValue(entry.name);
  SpreadsheetApp.getUi().alert("Program '" + entry.name + "' opened in Editor.");
}

/**
 * Button: New program — adds an empty entry and opens it.
 */
function catalogNewProgram() {
  var all = catalogReadTable_();
  var maxId = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id > maxId) maxId = all[i].id;
  }
  var created = catalogCreateEntry(maxId + 1, "program-" + (maxId + 1),
    "New program", ["  NOP", "  HLT"], "Draft");
  catalogSaveSource_(created);

  var dir = catalogGetSheet_(CAT_SHEET_NAME, true);
  var rows = catalogReadTable_();
  // Find the last data row
  var data = dir.getDataRange().getValues();
  var last = data.length + 1;
  dir.getRange(last, 1, 1, 7).setValues([[
    created.id, created.name, created.description,
    created.instructions, created.bytes, created.pages, created.status
  ]]);

  // Update dropdown validation
  rows.push(created);
  var names = rows.map(function (e) { return e.name; });
  names.push(created.name);
  // unique
  var seen = {};
  var uniq = [];
  for (var k = 0; k < names.length; k++) {
    if (!seen[names[k]]) { seen[names[k]] = true; uniq.push(names[k]); }
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(uniq, true).build();
  dir.getRange("B1").setDataValidation(rule).setValue(created.name);

  catalogOpenInEditor();
}

/**
 * Button: Duplicate — clones the active program with a new ID/name.
 */
function catalogDuplicateProgram() {
  var name = catalogActiveProgramName_();
  var entry = catalogFindByName_(name);
  if (!entry) {
    SpreadsheetApp.getUi().alert("Select a valid program in B1.");
    return;
  }
  var source = catalogReadSource_(entry.id);
  var all = catalogReadTable_();
  var maxId = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id > maxId) maxId = all[i].id;
  }
  var copy = catalogCreateEntry(
    maxId + 1,
    entry.name + "-copy",
    entry.description + " (copy)",
    source,
    "Draft"
  );
  catalogSaveSource_(copy);

  var dir = catalogGetSheet_(CAT_SHEET_NAME, true);
  var data = dir.getDataRange().getValues();
  var last = data.length + 1;
  dir.getRange(last, 1, 1, 7).setValues([[
    copy.id, copy.name, copy.description,
    copy.instructions, copy.bytes, copy.pages, copy.status
  ]]);

  var names = all.map(function (e) { return e.name; });
  names.push(copy.name);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(names, true).build();
  dir.getRange("B1").setDataValidation(rule).setValue(copy.name);
  SpreadsheetApp.getUi().alert("Duplicated as '" + copy.name + "'.");
}

/**
 * Recomputes #instr/bytes/pages for every row by reading SRC_*.
 */
function catalogRefreshMetadata() {
  var all = catalogReadTable_();
  var dir = catalogGetSheet_(CAT_SHEET_NAME, false);
  for (var i = 0; i < all.length; i++) {
    var source = catalogReadSource_(all[i].id);
    var c = catalogCountSource(source);
    dir.getRange(all[i].rowIndex, 4, 1, 3).setValues([[c.instructions, c.bytes, c.pages]]);
  }
}
