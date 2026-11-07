/**
 * Assembler.gs — Two-pass assembler for the simulator ISA.
 *
 * Encoding is not duplicated. Pass 2 resolves labels, then calls Alain's
 * codificarInstruccion (Decoder.gs on develop) so opcodes, the +10H immediate
 * flag, register codes and 9-bit addresses stay in one place.
 *
 * Sheets glue is at the bottom. It does not write raw bytes into RAM: the CPU
 * on develop still executes text instructions. The byte image is returned for
 * the loader (issue #20).
 */

var ASM_PAGE_SIZE = 32; // bytes per virtual page, same block size as the ISA notes

/**
 * Parses 80H, 0x80, 128 or 1000B. Returns an integer or NaN.
 * Register and port names are not numbers (BX must not be read as binary).
 */
function asmParseNumber(text) {
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

/** 9-bit address token. Values above FFH use 3 hex digits so codificarInstruccion emits 2 bytes. */
function asmFormatAddr(n) {
  var v = n & 0x1FF;
  var width = v > 0xFF ? 3 : 2;
  return v.toString(16).toUpperCase().padStart(width, "0") + "H";
}

function asmFormatImm(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, "0") + "H";
}

/**
 * Splits a source line into {label, mnemonic, dest, src, tail, raw, empty}.
 * Supports a bare "LABEL:" or "LABEL: MNEM op, op". Comments use ; or //.
 * DB keeps the full tail because decodificarInstruccion only keeps two operands.
 */
function asmParseLine(rawLine) {
  var raw = String(rawLine == null ? "" : rawLine);
  var withoutComment = raw.split(";")[0].split("//")[0].trim();
  if (!withoutComment) {
    return { empty: true, raw: raw, label: null, mnemonic: null, dest: "", src: "", tail: "" };
  }

  var label = null;
  var rest = withoutComment;
  var labelMatch = rest.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
  if (labelMatch) {
    label = labelMatch[1].toUpperCase();
    rest = (labelMatch[2] || "").trim();
  }
  if (!rest) {
    return { empty: false, raw: raw, label: label, mnemonic: null, dest: "", src: "", tail: "" };
  }

  var parts = rest.split(/\s+/);
  var mnemonic = (parts[0] || "").toUpperCase();
  var tail = rest.substring(parts[0].length).trim();
  var dest = "";
  var src = "";
  if (tail) {
    if (tail.indexOf(",") !== -1) {
      var ops = tail.split(",");
      dest = (ops[0] || "").trim();
      src = ops.slice(1).join(",").trim();
    } else {
      dest = tail;
    }
  }
  return { empty: false, raw: raw, label: label, mnemonic: mnemonic, dest: dest, src: src, tail: tail };
}

function asmIsAddressRole(mnemonic, role) {
  if (role === "dest") {
    return mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
      mnemonic === "JC" || mnemonic === "JS" || mnemonic === "ST" || mnemonic === "STORE";
  }
  return mnemonic === "LD" || mnemonic === "LOAD";
}

/**
 * Renders one operand for codificarInstruccion.
 * Unknown labels become 00H during pass 1 (forward reference) and throw in pass 2.
 */
function asmRenderOperand(raw, mnemonic, role, symbols, prefix, allowForward) {
  if (!raw || !String(raw).trim()) return "";
  var original = String(raw).trim();
  var cleaned = limpiarDireccion(original).toUpperCase();
  var brackets = original.indexOf("[") !== -1;
  if (!cleaned) return "";

  if (REG_CODES.hasOwnProperty(cleaned) || PORT_CODES.hasOwnProperty(cleaned)) {
    return brackets ? "[" + cleaned + "]" : cleaned;
  }

  var asAddress = brackets || asmIsAddressRole(mnemonic, role);
  var number = asmParseNumber(cleaned);
  if (!isNaN(number)) {
    if (asAddress) return "[" + asmFormatAddr(number) + "]";
    return asmFormatImm(number);
  }

  if (/^[A-Z_][A-Z0-9_]*$/.test(cleaned)) {
    if (!symbols || !Object.prototype.hasOwnProperty.call(symbols, cleaned)) {
      if (allowForward) return asAddress ? "[00H]" : "00H";
      throw new Error(prefix + "Undefined label '" + cleaned + "'");
    }
    var rendered = asmFormatAddr(symbols[cleaned]);
    return asAddress ? "[" + rendered + "]" : rendered;
  }
  throw new Error(prefix + "Invalid operand '" + original + "'");
}

function asmEmitDb(tail, prefix) {
  var items = String(tail || "").split(/[,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  if (items.length === 0) throw new Error(prefix + "DB requires at least one byte");
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var token = items[i];
    var n = asmParseNumber(token);
    if (isNaN(n)) {
      var charMatch = token.match(/^'(.)'$/);
      if (charMatch) n = charMatch[1].charCodeAt(0);
    }
    if (isNaN(n) || n < 0 || n > 0xFF) throw new Error(prefix + "DB: invalid value '" + token + "'");
    out.push(n & 0xFF);
  }
  return out;
}

/** Builds the text Alain's encoder understands and returns integer bytes. */
function asmEmitInstruction(mnemonic, dest, src, symbols, lineNumber, allowForward) {
  var prefix = "Line " + lineNumber + ": ";
  if (mnemonic === "DB") return asmEmitDb(dest ? (src ? dest + "," + src : dest) : src, prefix);
  if (!(mnemonic in OPCODES)) throw new Error(prefix + "Unknown mnemonic '" + mnemonic + "'");

  var renderedDest = asmRenderOperand(dest, mnemonic, "dest", symbols, prefix, allowForward);
  var renderedSrc = asmRenderOperand(src, mnemonic, "src", symbols, prefix, allowForward);
  var text = mnemonic;
  if (renderedDest) text += " " + renderedDest;
  if (renderedSrc) text += ", " + renderedSrc;

  var hex = codificarInstruccion(text);
  if (!hex || hex === "??") throw new Error(prefix + "Could not encode '" + text + "'");
  var bytes = hex.split(/\s+/).map(function (h) { return parseInt(h, 16); });
  if (bytes.some(function (b) { return isNaN(b); })) {
    throw new Error(prefix + "Could not encode '" + text + "'");
  }
  return bytes;
}

/**
 * Assembles a full program (text or an array of lines).
 * Returns ok, errors, symbols, listing, image, bytes, entry, size,
 * emittedBytes, pages, instructionCount.
 */
function assemble(sourceText) {
  var lines = Array.isArray(sourceText)
    ? sourceText
    : String(sourceText).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  var parsed = [];
  for (var i = 0; i < lines.length; i++) {
    var row = asmParseLine(lines[i]);
    row.lineNumber = i + 1;
    parsed.push(row);
  }

  var symbols = {};
  var errors = [];
  var maxIter = 6;

  function pass1() {
    var loc = 0;
    var nextSymbols = {};
    var localErrors = [];
    for (var i = 0; i < parsed.length; i++) {
      var row = parsed[i];
      if (row.empty) continue;
      if (row.label) {
        if (Object.prototype.hasOwnProperty.call(nextSymbols, row.label) && nextSymbols[row.label] !== loc && row.mnemonic !== "EQU") {
          localErrors.push("Line " + row.lineNumber + ": duplicate label '" + row.label + "'");
        }
        if (row.mnemonic !== "EQU") nextSymbols[row.label] = loc;
      }
      if (!row.mnemonic) continue;
      if (row.mnemonic === "ORG") {
        var orgValue = asmParseNumber(limpiarDireccion(row.dest));
        if (isNaN(orgValue)) localErrors.push("Line " + row.lineNumber + ": ORG requires an address");
        else loc = orgValue & 0x1FF;
        continue;
      }
      if (row.mnemonic === "EQU") {
        var equValue = asmParseNumber(row.dest);
        if (row.label && !isNaN(equValue)) nextSymbols[row.label] = equValue & 0x1FF;
        else localErrors.push("Line " + row.lineNumber + ": invalid EQU (use LABEL: EQU value)");
        continue;
      }
      var merged = {};
      for (var name in symbols) merged[name] = symbols[name];
      for (var name2 in nextSymbols) merged[name2] = nextSymbols[name2];
      try {
        var emitted = asmEmitInstruction(row.mnemonic, row.dest, row.src, merged, row.lineNumber, true);
        loc = (loc + emitted.length) & 0x1FF;
      } catch (err) {
        if (String(err.message).indexOf("Undefined label") === -1) localErrors.push(err.message);
        loc = (loc + 1) & 0x1FF;
      }
    }
    return { symbols: nextSymbols, errors: localErrors };
  }

  for (var iter = 0; iter < maxIter; iter++) {
    var pass = pass1();
    var stable = true;
    var key;
    for (key in pass.symbols) if (symbols[key] !== pass.symbols[key]) stable = false;
    for (key in symbols) if (!Object.prototype.hasOwnProperty.call(pass.symbols, key)) stable = false;
    symbols = pass.symbols;
    errors = pass.errors;
    if (stable && iter > 0) break;
  }

  var listing = [];
  var image = {};
  var loc2 = 0;
  var instructionCount = 0;
  var emittedBytes = 0;
  var entry = null;

  for (var j = 0; j < parsed.length; j++) {
    var row2 = parsed[j];
    if (row2.empty) continue;
    if (row2.mnemonic === "ORG") {
      var org2 = asmParseNumber(limpiarDireccion(row2.dest));
      if (!isNaN(org2)) loc2 = org2 & 0x1FF;
      listing.push({ address: loc2, bytes: [], hex: "", source: String(lines[j]).trim(), line: row2.lineNumber, directive: true });
      continue;
    }
    if (row2.mnemonic === "EQU" || (!row2.mnemonic && row2.label)) {
      listing.push({
        address: row2.label && Object.prototype.hasOwnProperty.call(symbols, row2.label) ? symbols[row2.label] : loc2,
        bytes: [], hex: "", source: String(lines[j]).trim(), line: row2.lineNumber, directive: true
      });
      continue;
    }
    if (!row2.mnemonic) continue;
    try {
      var bytes = asmEmitInstruction(row2.mnemonic, row2.dest, row2.src, symbols, row2.lineNumber, false);
      if (entry === null && row2.mnemonic !== "DB") entry = loc2;
      if (row2.mnemonic !== "DB") instructionCount++;
      for (var b = 0; b < bytes.length; b++) image[loc2 + b] = bytes[b];
      emittedBytes += bytes.length;
      listing.push({
        address: loc2,
        bytes: bytes.slice(),
        hex: bytes.map(function (n) { return aHex2(n); }).join(" "),
        source: String(lines[j]).trim(),
        line: row2.lineNumber
      });
      loc2 = (loc2 + bytes.length) & 0x1FF;
    } catch (err2) {
      errors.push(err2.message || String(err2));
      listing.push({
        address: loc2, bytes: [], hex: "????", source: String(lines[j]).trim(),
        line: row2.lineNumber, error: true
      });
    }
  }

  var maxAddr = -1;
  for (var addr in image) {
    var ai = parseInt(addr, 10);
    if (ai > maxAddr) maxAddr = ai;
  }
  var dense = [];
  for (var x = 0; x <= maxAddr; x++) dense.push(Object.prototype.hasOwnProperty.call(image, x) ? image[x] : 0);

  var pagesSet = {};
  for (var addr2 in image) pagesSet[Math.floor(parseInt(addr2, 10) / ASM_PAGE_SIZE)] = true;
  var pages = 0;
  for (var pg in pagesSet) pages++;

  return {
    ok: errors.length === 0,
    errors: errors,
    symbols: symbols,
    listing: listing,
    bytes: dense,
    image: image,
    entry: entry == null ? 0 : entry,
    size: maxAddr >= 0 ? maxAddr + 1 : 0,
    emittedBytes: emittedBytes,
    pages: pages,
    instructionCount: instructionCount
  };
}

/** Formats the listing as text: Address | HEX bytes | Source */
function formatListing(result) {
  var out = [];
  out.push("Address | HEX bytes      | Source");
  out.push("--------+----------------+---------------------------");
  var listing = result.listing || [];
  for (var i = 0; i < listing.length; i++) {
    var entry = listing[i];
    out.push(asmFormatAddr(entry.address).padEnd(7, " ") + " | " + (entry.hex || "").padEnd(14, " ") + " | " + entry.source);
  }
  if (result.errors && result.errors.length) {
    out.push("");
    out.push("ERRORS:");
    for (var j = 0; j < result.errors.length; j++) out.push("  - " + result.errors[j]);
  }
  return out.join("\n");
}

// --- Google Sheets glue (not executed by the Node tests) ---

var ASM_EDITOR_SHEET = "Editor";
var ASM_EDITOR_RANGE = "A1:A200";
var ASM_LEGACY_SHEET = "Programas";
var ASM_LEGACY_RANGE = "A2:A200";
var ASM_LISTING_SHEET = "Hoja 1";
var ASM_LISTING_START_ROW = 3; // same cell as STACK_START_ROW in Config.gs
var ASM_LISTING_COL = 9;       // column I, same as STACK_COL
var ASM_LISTING_MAX_ROWS = 40;

function asmReadSourceLines() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var editor = ss.getSheetByName(ASM_EDITOR_SHEET);
  var lines = [];
  var values;
  var i;
  if (editor) {
    values = editor.getRange(ASM_EDITOR_RANGE).getValues();
    for (i = 0; i < values.length; i++) lines.push(values[i][0] == null ? "" : String(values[i][0]));
    while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
    if (lines.length) return lines;
  }
  var legacy = ss.getSheetByName(ASM_LEGACY_SHEET);
  if (!legacy) {
    SpreadsheetApp.getUi().alert("Could not find sheet Editor or Programas.");
    return null;
  }
  values = legacy.getRange(ASM_LEGACY_RANGE).getValues();
  lines = [];
  for (i = 0; i < values.length; i++) lines.push(values[i][0] == null ? "" : String(values[i][0]));
  while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();
  return lines;
}

/**
 * Reads Editor!A (or Programas!A2 if the editor is empty) and writes
 * Address | HEX | Source on Hoja 1 column I, starting at row 3.
 * This replaces the visible Instruction Stack. It does not modify RAM.
 */
function assembleAndShowListing() {
  var lines = asmReadSourceLines();
  if (!lines) return null;
  var result = assemble(lines);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(ASM_LISTING_SHEET) || ss.getActiveSheet();
  sheet.getRange(ASM_LISTING_START_ROW, ASM_LISTING_COL, ASM_LISTING_MAX_ROWS, 1).clearContent().setBackground(null);

  var rows = [["Address | HEX | Source"]];
  for (var k = 0; k < result.listing.length && rows.length < ASM_LISTING_MAX_ROWS; k++) {
    var entry = result.listing[k];
    rows.push([asmFormatAddr(entry.address) + ": " + (entry.hex || "") + "  |  " + entry.source]);
  }
  sheet.getRange(ASM_LISTING_START_ROW, ASM_LISTING_COL, rows.length, 1).setValues(rows);
  if (!result.ok) {
    SpreadsheetApp.getUi().alert("Assembly completed with errors:\n" + result.errors.join("\n"));
  } else {
    SpreadsheetApp.getUi().alert(
      "Assembly OK. " + result.instructionCount + " instruction(s), " +
      result.emittedBytes + " byte(s), " + result.pages + " virtual page(s)."
    );
  }
  return result;
}

/** Assembles free-form text (editor or tests). */
function assembleText(text) {
  return assemble(text);
}