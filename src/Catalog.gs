function catalogBuiltinPrograms() {
  return [
        {
      id: 1,
      name: "Arithmetic AX..DX",
      description: "Mandatory program. AX = BX * CX by repeated addition. DX keeps the original BX. Expected AX=0CH.",
      file: "arithmetic-ax-dx.asm",
      lines: [
        "; Program 1. AX = BX * CX by repeated addition. DX keeps the original BX.",
        "; Expected after HLT, if the CPU runs this text: AX=0CH, BX=04H, CX=00H, DX=04H, ZF=1.",
        "; No memory operand, so this program alone cannot raise a page fault or a cache miss.",
        "  MOV AX, 00H          ; AX = 0, the product",
        "  MOV BX, 04H          ; BX = 4, the multiplicand",
        "  MOV CX, 03H          ; CX = 3, the loop counter",
        "  MOV DX, BX           ; DX = 4, a copy of BX that the loop does not change",
        "loop:",
        "  ADD AX, DX           ; AX = AX + DX",
        "  DEC CX               ; CX = CX - 1. ZF becomes 1 when CX reaches 0",
        "  JNZ loop             ; repeat while CX is not 0",
        "  HLT                  ; stop. AX should be 0CH",
      ]
    },
    {
      id: 2,
      name: "Keyboard to LCD",
      description: "Mandatory program. Eight IN/OUT pairs. Empty queue and Enter are not implemented (issues #33-#35).",
      file: "keyboard-lcd-echo.asm",
      lines: [
        "; Program 2. Eight IN [KBD] / OUT [LCD] pairs, then HLT.",
        "; The CPU on develop has no IN or OUT case in faseExecute.",
        "; Issues #33, #34 and #35 are not implemented, so there is no empty-queue",
        "; value and no Enter key code to test. This file does not invent one.",
        "; Expected LCD text cannot be produced until those issues exist.",
        "  MOV CX, 08H          ; eight positions on the 8x1 LCD",
        "echo:",
        "  IN AX, [KBD]         ; read one byte from the keyboard port",
        "  OUT [LCD], AX        ; send that byte to the LCD port",
        "  DEC CX               ; one position filled",
        "  JNZ echo             ; stop after 8 transfers, not on Enter",
        "  HLT                  ; stop. LCD contents are not defined yet",
      ]
    },
    {
      id: 3,
      name: "Scattered accesses",
      description: "Mandatory program. Nine virtual pages and four dirty ST writes. Page faults are not executed yet.",
      file: "scattered-access.asm",
      lines: [
        "; Program 3. Touch 9 virtual pages of 32 bytes. Four ST instructions are dirty writes.",
        "; Pages: 0 (code), 2, 3, 5, 7, 9, 11, 14, 15. More than the 8 physical frames.",
        "; Page faults, replacement and cache hits are not produced by assemble().",
        "; Fetch still uses physical RAM until issue #25 connects the MMU.",
        "  LD AX, [40H]         ; read page 2",
        "  LD BX, [A0H]         ; read page 5",
        "  ADD AX, BX           ; AX = byte[40H] + byte[A0H]. No memory access",
        "  ST [120H], AX        ; dirty write, page 9",
        "  ST [1C0H], BX        ; dirty write, page 14",
        "  LD CX, [60H]         ; read page 3",
        "  ST [E0H], CX         ; dirty write, page 7",
        "  LD DX, [160H]        ; read page 11",
        "  ST [1E0H], DX        ; dirty write, page 15",
        "  HLT                  ; stop. Code itself occupies page 0",
        "ORG 40H                ; page 2",
        "  DB 01H               ; initial byte read by LD AX",
        "ORG 60H                ; page 3",
        "  DB 03H               ; initial byte read by LD CX",
        "ORG A0H                ; page 5",
        "  DB 02H               ; initial byte read by LD BX",
        "ORG E0H                ; page 7",
        "  DB 05H               ; byte overwritten by ST [E0H]",
        "ORG 120H               ; page 9",
        "  DB 06H               ; byte overwritten by ST [120H]",
        "ORG 160H               ; page 11",
        "  DB 04H               ; initial byte read by LD DX",
        "ORG 1C0H               ; page 14",
        "  DB 07H               ; byte overwritten by ST [1C0H]",
        "ORG 1E0H               ; page 15",
        "  DB 08H               ; byte overwritten by ST [1E0H]",
      ]
    },
    {
      id: 4,
      name: "Carry memory",
      description: "Migrated from Programas!A. Adds two memory bytes and jumps on carry.",
      file: "carry-memory.asm",
      lines: [
        "; Migrated from Programas!A",
        "; Load AX/BX from 80H/81H, add, jump on carry, and write the result.",
        "start:",
        "  LD AX, [80H]",
        "  LD BX, [81H]",
        "  ADD AX, BX",
        "  JC end",
        "  ST [80H], BX",
        "  ST [80H], AX",
        "  JMP start",
        "end:",
        "  HLT",
      ]
    },
    {
      id: 5,
      name: "Accumulator loop",
      description: "Migrated from Programas!H. Adds 03H four times into AX.",
      file: "accumulator-loop.asm",
      lines: [
        "; Migrated from Programas!H",
        "; Add 03H four times into AX. BX is the counter.",
        "  MOV AX, 00H",
        "  MOV BX, 04H",
        "loop:",
        "  ADD AX, 03H",
        "  DEC BX",
        "  JNZ loop",
        "  ST [20H], AX",
        "  HLT",
      ]
    },
    {
      id: 6,
      name: "Count to five",
      description: "Migrated from Programas!K. Increments AX until 5 and stores it.",
      file: "count-to-five.asm",
      lines: [
        "; Migrated from Programas!K",
        "; Increment AX until 5 and store it at 20H.",
        "  MOV AX, 00H",
        "loop:",
        "  INC AX",
        "  CMP AX, 05H",
        "  JNZ loop",
        "  ST [20H], AX",
        "  HLT",
      ]
    },
    {
      id: 7,
      name: "Compare and store",
      description: "Migrated from Programas!O. Compares AX with BX and stores AX.",
      file: "compare-store.asm",
      lines: [
        "; Migrated from Programas!O",
        "; Compare AX=03H with BX=08H and store AX at 20H.",
        "  MOV AX, 03H",
        "  MOV BX, 08H",
        "  CMP AX, BX",
        "  ST [20H], AX",
        "  HLT",
      ]
    },
    {
      id: 8,
      name: "Compare, two HLT exits",
      description: "Migrated from Programas!R. Stores FFH when AX equals memory, otherwise 00H.",
      file: "compare-double-hlt.asm",
      lines: [
        "; Migrated from Programas!R",
        "; If AX equals [10H], store FFH; otherwise store 00H. Two HLT exits.",
        "  MOV AX, 0AH",
        "  LD BX, [10H]",
        "  CMP AX, BX",
        "  JZ equal",
        "  ST [30H], 00H",
        "  HLT",
        "equal:",
        "  ST [30H], FFH",
        "  HLT",
      ]
    },
  ];
}
/**
 * Catalog.gs — Program directory for issue #17.
 *
 * Owns the Directory and Sources sheets. Does not rename Programas, Hoja 1 or LOG.
 * Does not define onOpen, so a teammate can own that hook.
 * If assemble() from Assembler.gs is already loaded, metadata uses it.
 * Otherwise the status stays "Source" and byte counts stay blank.
 * "Loaded" is reserved for the loader (issue #20).
 */

var CATALOG_SHEET = "Directory";
var CATALOG_SOURCE_SHEET = "Sources";
var CATALOG_EDITOR_SHEET = "Editor";
var CATALOG_SELECTOR = "B1";
var CATALOG_HEADER_ROW = 3;
var CATALOG_SOURCE_ROWS = 80;
var CATALOG_HEADERS = ["ID", "Name", "Description", "Instructions", "Bytes", "Virtual pages", "Status"];

/** Counts executable lines when the assembler is not loaded yet. */
function catalogCountInstructions(lines) {
  var count = 0;
  for (var i = 0; i < lines.length; i++) {
    var text = String(lines[i]).split(";")[0].split("//")[0].trim();
    if (!text) continue;
    text = text.replace(/^[A-Za-z_][A-Za-z0-9_]*:\s*/, "");
    if (!text) continue;
    var mnemonic = text.split(/\s+/)[0].toUpperCase();
    if (mnemonic === "ORG" || mnemonic === "EQU" || mnemonic === "DB") continue;
    count++;
  }
  return count;
}

/** Instructions, emitted bytes, touched 32-byte pages, and status. */
function catalogMeasure(lines) {
  if (typeof assemble === "function") {
    var result = assemble(lines);
    return {
      instructions: result.instructionCount,
      bytes: result.emittedBytes,
      pages: result.pages,
      status: result.ok ? "Assembled" : "Error"
    };
  }
  return {
    instructions: catalogCountInstructions(lines),
    bytes: "",
    pages: "",
    status: "Source"
  };
}

function catalogEnsureSheet(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function catalogTrimLines(lines) {
  var copy = lines.slice();
  while (copy.length && !String(copy[copy.length - 1]).trim()) copy.pop();
  return copy;
}

function catalogReadPrograms(sourceSheet) {
  var width = sourceSheet.getLastColumn();
  if (!width) return [];
  var values = sourceSheet.getRange(1, 1, CATALOG_SOURCE_ROWS, width).getValues();
  var programs = [];
  for (var c = 0; c < width; c++) {
    if (values[0][c] === "" || values[0][c] == null) continue;
    var lines = [];
    for (var r = 2; r < values.length; r++) lines.push(values[r][c] == null ? "" : String(values[r][c]));
    programs.push({
      id: values[0][c],
      name: String(values[1][c] || ""),
      lines: catalogTrimLines(lines),
      column: c + 1
    });
  }
  return programs;
}

function catalogWriteProgram(sourceSheet, column, program) {
  var columnValues = [[program.id], [program.name]];
  var lines = program.lines || [];
  var r;
  for (r = 0; r < lines.length; r++) columnValues.push([lines[r]]);
  while (columnValues.length < CATALOG_SOURCE_ROWS) columnValues.push([""]);
  sourceSheet.getRange(1, column, CATALOG_SOURCE_ROWS, 1).setValues(columnValues);
}

function catalogSeedIfEmpty(sourceSheet) {
  if (sourceSheet.getLastColumn() > 0 && sourceSheet.getRange(1, 1).getValue() !== "") return;
  var builtins = catalogBuiltinPrograms();
  for (var i = 0; i < builtins.length; i++) catalogWriteProgram(sourceSheet, i + 1, builtins[i]);
}

function catalogDescriptionMap(directory) {
  var map = {};
  var builtins = catalogBuiltinPrograms();
  for (var i = 0; i < builtins.length; i++) map[String(builtins[i].id)] = builtins[i].description;
  if (!directory) return map;
  var last = directory.getLastRow();
  if (last < CATALOG_HEADER_ROW + 1) return map;
  var rows = directory.getRange(CATALOG_HEADER_ROW + 1, 1, last - CATALOG_HEADER_ROW, 3).getValues();
  for (var r = 0; r < rows.length; r++) {
    if (rows[r][0] === "" || rows[r][0] == null) continue;
    if (rows[r][2]) map[String(rows[r][0])] = String(rows[r][2]);
  }
  return map;
}

function catalogRefreshDirectory(directory, programs, descriptions) {
  var rows = [CATALOG_HEADERS];
  for (var i = 0; i < programs.length; i++) {
    var program = programs[i];
    var measured = catalogMeasure(program.lines);
    rows.push([
      program.id,
      program.name,
      descriptions[String(program.id)] || "",
      measured.instructions,
      measured.bytes,
      measured.pages,
      measured.status
    ]);
  }
  directory.getRange(CATALOG_HEADER_ROW, 1, Math.max(rows.length, 1), CATALOG_HEADERS.length).clearContent();
  directory.getRange(CATALOG_HEADER_ROW, 1, rows.length, CATALOG_HEADERS.length).setValues(rows);
  directory.getRange("A1").setValue("Active program");
  var names = programs.map(function (program) { return program.name; });
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(false).build();
  directory.getRange(CATALOG_SELECTOR).setDataValidation(rule);
  if (!directory.getRange(CATALOG_SELECTOR).getValue() && names.length) {
    directory.getRange(CATALOG_SELECTOR).setValue(names[0]);
  }
}

function catalogFindProgram(programs, name) {
  var wanted = String(name || "").trim();
  for (var i = 0; i < programs.length; i++) {
    if (programs[i].name === wanted) return programs[i];
  }
  return null;
}

function catalogNextId(programs) {
  var maxId = 0;
  for (var i = 0; i < programs.length; i++) {
    var n = parseInt(programs[i].id, 10);
    if (!isNaN(n) && n > maxId) maxId = n;
  }
  return maxId + 1;
}

/** Creates Directory, Sources and the selector. Safe to run again: it does not delete extra programs. */
function catalogInitialize() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sources = catalogEnsureSheet(ss, CATALOG_SOURCE_SHEET);
  var directory = catalogEnsureSheet(ss, CATALOG_SHEET);
  catalogEnsureSheet(ss, CATALOG_EDITOR_SHEET);
  var descriptions = catalogDescriptionMap(directory);
  catalogSeedIfEmpty(sources);
  catalogRefreshDirectory(directory, catalogReadPrograms(sources), descriptions);
}

/** Copies the selected program into Editor column A. Other programs stay on Sources. */
function catalogOpenInEditor() {
   if (typeof editorLoadSelected === "function") {
    editorLoadSelected();
    return;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var directory = ss.getSheetByName(CATALOG_SHEET);
  var sources = ss.getSheetByName(CATALOG_SOURCE_SHEET);
  if (!directory || !sources) {
    SpreadsheetApp.getUi().alert("Run catalogInitialize first.");
    return;
  }
  var programs = catalogReadPrograms(sources);
  var selected = catalogFindProgram(programs, directory.getRange(CATALOG_SELECTOR).getValue());
  if (!selected) {
    SpreadsheetApp.getUi().alert("Select a program in Directory!B1.");
    return;
  }
  var editor = catalogEnsureSheet(ss, CATALOG_EDITOR_SHEET);
  var block = [];
  var i;
  for (i = 0; i < 200; i++) block.push([i < selected.lines.length ? selected.lines[i] : ""]);
  editor.getRange(1, 1, 200, 1).setValues(block);
}

/** Appends an empty program. Existing columns are left as they are. */
function catalogNewProgram() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sources = ss.getSheetByName(CATALOG_SOURCE_SHEET);
  var directory = ss.getSheetByName(CATALOG_SHEET);
  if (!sources || !directory) {
    SpreadsheetApp.getUi().alert("Run catalogInitialize first.");
    return;
  }
  var programs = catalogReadPrograms(sources);
  var id = catalogNextId(programs);
  catalogWriteProgram(sources, programs.length + 1, { id: id, name: "Program " + id, lines: ["; New program", "  HLT"] });
  catalogRefreshDirectory(directory, catalogReadPrograms(sources), catalogDescriptionMap(directory));
  directory.getRange(CATALOG_SELECTOR).setValue("Program " + id);
}

/** Copies the selected program into a new column and keeps the original. */
function catalogDuplicate() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sources = ss.getSheetByName(CATALOG_SOURCE_SHEET);
  var directory = ss.getSheetByName(CATALOG_SHEET);
  if (!sources || !directory) {
    SpreadsheetApp.getUi().alert("Run catalogInitialize first.");
    return;
  }
  var programs = catalogReadPrograms(sources);
  var selected = catalogFindProgram(programs, directory.getRange(CATALOG_SELECTOR).getValue());
  if (!selected) {
    SpreadsheetApp.getUi().alert("Select a program in Directory!B1.");
    return;
  }
  var id = catalogNextId(programs);
  var name = "Copy of " + selected.name;
  catalogWriteProgram(sources, programs.length + 1, { id: id, name: name, lines: selected.lines.slice() });
  catalogRefreshDirectory(directory, catalogReadPrograms(sources), catalogDescriptionMap(directory));
  directory.getRange(CATALOG_SELECTOR).setValue(name);
}

/** Adds the Catalog menu. Do not also define onOpen in this file. */
function catalogInstallMenu() {
  SpreadsheetApp.getUi().createMenu("Catalog")
    .addItem("Initialize directory", "catalogInitialize")
    .addItem("Open in editor", "catalogOpenInEditor")
    .addItem("New program", "catalogNewProgram")
    .addItem("Duplicate", "catalogDuplicate")
    .addToUi();
}
function catalogRefreshMandatory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sources = ss.getSheetByName(CATALOG_SOURCE_SHEET);
  var directory = ss.getSheetByName(CATALOG_SHEET);
  if (!sources || !directory) {
    SpreadsheetApp.getUi().alert("Run catalogInitialize first.");
    return;
  }
  var builtins = catalogBuiltinPrograms();
  var programs = catalogReadPrograms(sources);
  var b;
  for (b = 0; b < builtins.length && builtins[b].id <= 3; b++) {
    var column = b + 1;
    var p;
    for (p = 0; p < programs.length; p++) {
      if (String(programs[p].id) === String(builtins[b].id)) column = programs[p].column;
    }
    catalogWriteProgram(sources, column, builtins[b]);
  }
  catalogRefreshDirectory(directory, catalogReadPrograms(sources), catalogDescriptionMap(directory));
}