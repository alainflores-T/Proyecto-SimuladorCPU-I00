/**
 * Assembler.gs — Two-pass assembler for the simulator ISA.
 * Pure logic (no SpreadsheetApp) above; Sheets glue at the bottom.
 * Encoding aligned with docs/ISA.md and Alain's codificarInstruccion (PR #41).
 */

// --- ISA tables (independent of develop / other branches) ---
var ASM_OPCODES = {
  "NOP": 0x00, "MOV": 0x01, "ADD": 0x02, "SUB": 0x03, "INC": 0x04,
  "DEC": 0x05, "CMP": 0x06, "LD": 0x07, "LOAD": 0x07, "ST": 0x08,
  "STORE": 0x08, "JMP": 0x09, "JZ": 0x0A, "JNZ": 0x0B, "JC": 0x0C,
  "JS": 0x0D, "AND": 0x0E, "OR": 0x0F, "IN": 0x20, "OUT": 0x21,
  "HLT": 0xFF
};

var ASM_REG_CODES = { "AX": 0x00, "BX": 0x01, "CX": 0x02, "DX": 0x03 };
var ASM_PORT_CODES = { "KBD": 0x00, "LCD": 0x01 };
var ASM_FLAG_IMMEDIATE = 0x10;
var ASM_PAGE_SIZE = 32; // bytes per virtual page

/**
 * Converts an integer 0..255 to 2-digit hex (no H suffix).
 */
function asmAHex2(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Converts an integer to a hex address with an H suffix (2 or 3 digits).
 */
function asmToHexAddress(n) {
  var w = n > 0xFF ? 3 : 2;
  return (n & 0x1FF).toString(16).toUpperCase().padStart(w, "0") + "H";
}

/**
 * Strips brackets from an operand: "[30H]" -> "30H".
 */
function asmStripBrackets(op) {
  return String(op || "").replace(/[\[\]]/g, "").trim();
}

/**
 * Parses a number: 80H, 0x80, 128, 1000B. Returns an integer or NaN.
 */
function asmParseNumber(text) {
  var t = String(text || "").trim().toUpperCase();
  if (!t) return NaN;
  if (t.endsWith("H")) return parseInt(t.slice(0, -1), 16);
  if (t.startsWith("0X")) return parseInt(t.slice(2), 16);
  if (t.endsWith("B") && /^[01]+B$/.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
  return NaN;
}

/**
 * Is this an AX..DX register name?
 */
function asmIsRegister(name) {
  return ASM_REG_CODES.hasOwnProperty(String(name || "").toUpperCase());
}

/**
 * Is this a KBD/LCD port?
 */
function asmIsPort(name) {
  return ASM_PORT_CODES.hasOwnProperty(String(name || "").toUpperCase());
}

/**
 * Splits a source line into {label, mnemonic, dest, src, raw, empty}.
 * Supports a bare "LABEL:" or "LABEL: MNEM op, op". Comments use ; or //.
 */
function asmParseLine(rawLine) {
  var raw = String(rawLine == null ? "" : rawLine);
  var withoutComment = raw.split(";")[0].split("//")[0].trim();
  if (!withoutComment) {
    return { empty: true, raw: raw, label: null, mnemonic: null, dest: "", src: "" };
  }

  var label = null;
  var rest = withoutComment;
  var labelMatch = rest.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
  if (labelMatch) {
    label = labelMatch[1].toUpperCase();
    rest = (labelMatch[2] || "").trim();
  }

  if (!rest) {
    return { empty: false, raw: raw, label: label, mnemonic: null, dest: "", src: "" };
  }

  var parts = rest.split(/\s+/);
  var mnemonic = (parts[0] || "").toUpperCase();
  var ops = rest.substring(parts[0].length).trim();
  var dest = "";
  var src = "";
  if (ops.length > 0) {
    if (ops.indexOf(",") !== -1) {
      var opsParts = ops.split(",");
      dest = (opsParts[0] || "").trim();
      src = opsParts.slice(1).join(",").trim();
    } else {
      // Single operand (JMP addr, INC reg, ...)
      dest = ops.trim();
      src = "";
    }
  }

  return {
    empty: false,
    raw: raw,
    label: label,
    mnemonic: mnemonic,
    dest: dest,
    src: src
  };
}

/**
 * Classifies an operand for the assembler.
 * kind: "reg" | "port" | "imm" | "addr" | "label" | "none"
 */
function asmClassifyOperand(operand, forceAddr) {
  if (!operand || !String(operand).trim()) {
    return { kind: "none" };
  }
  var original = String(operand).trim();
  var cleaned = asmStripBrackets(original).toUpperCase();
  var hasBrackets = original.indexOf("[") !== -1;

  if (asmIsRegister(cleaned) && !hasBrackets && !forceAddr) {
    return { kind: "reg", value: ASM_REG_CODES[cleaned], name: cleaned };
  }
  if (asmIsPort(cleaned)) {
    return { kind: "port", value: ASM_PORT_CODES[cleaned], name: cleaned };
  }

  var n = asmParseNumber(cleaned);
  if (!isNaN(n)) {
    if (hasBrackets || forceAddr) {
      return { kind: "addr", value: n & 0x1FF };
    }
    return { kind: "imm", value: n & 0xFF };
  }

  // Symbolic label
  if (/^[A-Z_][A-Z0-9_]*$/.test(cleaned)) {
    return { kind: "label", name: cleaned, asAddr: hasBrackets || !!forceAddr };
  }

  return { kind: "error", message: "Invalid operand '" + original + "'" };
}

/**
 * Byte size of an already-resolved address operand (1 if <= FFH, otherwise 2).
 */
function asmAddressSize(value) {
  return (value > 0xFF) ? 2 : 1;
}

/**
 * Byte size of an instruction (mnemonic + already classified operands).
 * Labels are resolved with symbolsMap (name to address) or assumed to be 1 byte if missing.
 */
function asmInstructionSize(mnemonic, destInfo, srcInfo, symbolsMap) {
  if (!mnemonic) return 0;
  if (mnemonic === "ORG" || mnemonic === "EQU") return 0;
  if (mnemonic === "DB") {
    // DB takes a list rebuilt from dest+src — sized separately
    return -1; // signal: compute outside
  }
  if (mnemonic === "NOP" || mnemonic === "HLT") return 1;

  var op = ASM_OPCODES[mnemonic];
  if (op === undefined) return -2;

  function resolveInfo(info) {
    if (!info || info.kind === "none") return null;
    if (info.kind === "label") {
      if (symbolsMap && symbolsMap.hasOwnProperty(info.name)) {
        return { kind: "addr", value: symbolsMap[info.name] };
      }
      return { kind: "addr", value: 0 }; // provisional 1 byte
    }
    return info;
  }

  var d = resolveInfo(destInfo);
  var s = resolveInfo(srcInfo);
  var bytes = 1; // opcode

  function addOp(info, isAddr) {
    if (!info || info.kind === "none") return;
    if (info.kind === "reg" || info.kind === "port" || info.kind === "imm") {
      bytes += 1;
    } else if (info.kind === "addr" || isAddr) {
      bytes += asmAddressSize(info.value || 0);
    }
  }

  // Special formats
  if (mnemonic === "INC" || mnemonic === "DEC") {
    addOp(d, false);
    return bytes;
  }
  if (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
      mnemonic === "JC" || mnemonic === "JS") {
    // destination = address / label
    if (d && d.kind === "imm") d = { kind: "addr", value: d.value };
    addOp(d || { kind: "addr", value: 0 }, true);
    return bytes;
  }
  if (mnemonic === "LD" || mnemonic === "LOAD") {
    addOp(d, false); // reg
    // src is an address
    if (s && s.kind === "imm") s = { kind: "addr", value: s.value };
    if (s && s.kind === "reg") s = { kind: "addr", value: 0 }; // unusual
    addOp(s || { kind: "addr", value: 0 }, true);
    return bytes;
  }
  if (mnemonic === "ST" || mnemonic === "STORE") {
    // dest = addr, src = reg|imm
    if (d && d.kind === "imm") d = { kind: "addr", value: d.value };
    addOp(d || { kind: "addr", value: 0 }, true);
    addOp(s, false);
    return bytes;
  }
  if (mnemonic === "IN") {
    addOp(d, false); // reg
    addOp(s, false); // port
    return bytes;
  }
  if (mnemonic === "OUT") {
    addOp(d, false); // port (or address-like)
    addOp(s, false); // reg
    return bytes;
  }

  // MOV/ADD/SUB/CMP/AND/OR: reg, reg|imm
  addOp(d, false);
  addOp(s, false);
  return bytes;
}

/**
 * Emits the bytes of an address operand (big-endian when > FFH).
 */
function asmEmitAddress(bytes, value) {
  var v = value & 0x1FF;
  if (v > 0xFF) bytes.push(v >> 8);
  bytes.push(v & 0xFF);
}

/**
 * Emits the bytes of an instruction with symbols already resolved.
 * Returns an array of integers 0..255 or throws Error.
 */
function asmEmitInstruction(mnemonic, destRaw, srcRaw, symbolsMap, lineNumber) {
  var prefix = "Line " + lineNumber + ": ";
  if (!mnemonic) return [];

  if (mnemonic === "ORG" || mnemonic === "EQU") return [];

  if (mnemonic === "DB") {
    var items = [destRaw, srcRaw].filter(function (x) { return x && String(x).trim(); })
      .join(",").split(/[,\s]+/).filter(Boolean);
    // Re-parse: dest may hold "01H 02H 03H" when the parse had no commas
    if ((!srcRaw || !String(srcRaw).trim()) && destRaw && destRaw.indexOf(",") === -1) {
      items = String(destRaw).trim().split(/\s+/).filter(Boolean);
    } else {
      items = String(destRaw || "").split(",").concat(String(srcRaw || "").split(","))
        .map(function (x) { return x.trim(); }).filter(Boolean);
    }
    var dbBytes = [];
    for (var i = 0; i < items.length; i++) {
      var token = items[i];
      var n = asmParseNumber(token);
      if (isNaN(n)) {
        // Character literal 'A'?
        var charMatch = token.match(/^'(.)'$/);
        if (charMatch) n = charMatch[1].charCodeAt(0);
      }
      if (isNaN(n) || n < 0 || n > 0xFF) {
        throw new Error(prefix + "DB: invalid value '" + token + "'");
      }
      dbBytes.push(n & 0xFF);
    }
    if (dbBytes.length === 0) throw new Error(prefix + "DB requires at least one byte");
    return dbBytes;
  }

  if (!(mnemonic in ASM_OPCODES) && mnemonic !== "LOAD" && mnemonic !== "STORE") {
    throw new Error(prefix + "Unknown mnemonic '" + mnemonic + "'");
  }

  // Force address mode on operands according to the mnemonic
  var forceDestAddr = (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
    mnemonic === "JC" || mnemonic === "JS" || mnemonic === "ST" || mnemonic === "STORE" ||
    mnemonic === "OUT");
  var forceSrcAddr = (mnemonic === "LD" || mnemonic === "LOAD" || mnemonic === "IN");

  // OUT: dest is a port; IN: src is a port — not free numeric addresses
  if (mnemonic === "OUT") forceDestAddr = false;
  if (mnemonic === "IN") forceSrcAddr = false;

  var dInfo = asmClassifyOperand(destRaw, forceDestAddr && !asmIsPort(asmStripBrackets(destRaw)));
  var sInfo = asmClassifyOperand(srcRaw, forceSrcAddr && !asmIsPort(asmStripBrackets(srcRaw)));

  // LD/ST: bare numbers are addresses too
  if ((mnemonic === "LD" || mnemonic === "LOAD") && sInfo.kind === "imm") {
    sInfo = { kind: "addr", value: sInfo.value };
  }
  if ((mnemonic === "ST" || mnemonic === "STORE") && dInfo.kind === "imm") {
    dInfo = { kind: "addr", value: dInfo.value };
  }
  if ((mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
       mnemonic === "JC" || mnemonic === "JS") && dInfo.kind === "imm") {
    dInfo = { kind: "addr", value: dInfo.value };
  }

  function resolveOperand(info, role) {
    if (!info || info.kind === "none") return info;
    if (info.kind === "error") throw new Error(prefix + info.message);
    if (info.kind === "label") {
      if (!symbolsMap || !symbolsMap.hasOwnProperty(info.name)) {
        throw new Error(prefix + "Undefined label '" + info.name + "'");
      }
      return { kind: "addr", value: symbolsMap[info.name] };
    }
    return info;
  }

  dInfo = resolveOperand(dInfo, "dest");
  sInfo = resolveOperand(sInfo, "src");

  var opcode = ASM_OPCODES[mnemonic];

  // +10H when the source is an immediate (does not apply to LD)
  if (sInfo && sInfo.kind === "imm" && mnemonic !== "LD" && mnemonic !== "LOAD") {
    opcode = (opcode + ASM_FLAG_IMMEDIATE) & 0xFF;
  }

  // Per-format checks
  function need(cond, msg) { if (!cond) throw new Error(prefix + msg); }

  if (mnemonic === "NOP" || mnemonic === "HLT") {
    need(!destRaw && !srcRaw, mnemonic + " takes no operands");
    return [opcode];
  }
  if (mnemonic === "INC" || mnemonic === "DEC") {
    need(dInfo && dInfo.kind === "reg", mnemonic + " requires a register");
    need(!srcRaw, mnemonic + " takes no second operand");
    return [opcode, dInfo.value];
  }
  if (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
      mnemonic === "JC" || mnemonic === "JS") {
    need(dInfo && dInfo.kind === "addr", mnemonic + " requires an address or label");
    var jumpBytes = [opcode];
    asmEmitAddress(jumpBytes, dInfo.value);
    return jumpBytes;
  }
  if (mnemonic === "LD" || mnemonic === "LOAD") {
    need(dInfo && dInfo.kind === "reg", "LD requires a destination register");
    need(sInfo && sInfo.kind === "addr", "LD requires a source address (e.g. [80H] or a label)");
    var loadBytes = [opcode, dInfo.value];
    asmEmitAddress(loadBytes, sInfo.value);
    return loadBytes;
  }
  if (mnemonic === "ST" || mnemonic === "STORE") {
    need(dInfo && dInfo.kind === "addr", "ST requires a destination address");
    need(sInfo && (sInfo.kind === "reg" || sInfo.kind === "imm"), "ST requires a register or immediate");
    var storeBytes = [opcode];
    // If src is imm, the opcode already has +10H
    asmEmitAddress(storeBytes, dInfo.value);
    storeBytes.push(sInfo.value & 0xFF);
    return storeBytes;
  }
  if (mnemonic === "IN") {
    need(dInfo && dInfo.kind === "reg", "IN requires a destination register");
    need(sInfo && sInfo.kind === "port", "IN requires port [KBD]");
    return [opcode, dInfo.value, sInfo.value];
  }
  if (mnemonic === "OUT") {
    need(dInfo && dInfo.kind === "port", "OUT requires port [LCD]");
    need(sInfo && sInfo.kind === "reg", "OUT requires a source register");
    return [opcode, dInfo.value, sInfo.value];
  }

  // ALU / MOV / CMP
  need(dInfo && dInfo.kind === "reg", mnemonic + " requires a destination register");
  need(sInfo && (sInfo.kind === "reg" || sInfo.kind === "imm"),
    mnemonic + " requires a source register or immediate");
  return [opcode, dInfo.value, sInfo.value & 0xFF];
}

/**
 * Assembles a full program (text or an array of lines).
 * Returns {
 *   ok, errors[], symbols{}, listing: [{address, bytes, hex, source, line}],
 *   bytes: dense Uint8-like array from the lowest touched address, image: {addr→byte},
 *   entry, size, pages, instructionCount
 * }
 */
function assemble(sourceText) {
  var lines = Array.isArray(sourceText)
    ? sourceText
    : String(sourceText).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  var errors = [];
  var parsed = [];

  for (var i = 0; i < lines.length; i++) {
    var pl = asmParseLine(lines[i]);
    pl.lineNumber = i + 1;
    parsed.push(pl);
  }

  // --- Pass 1 (repeat while address sizes change) ---
  var symbolsMap = {};
  var maxIter = 5;
  var finalLoc = 0;

  function pass1() {
    var loc = 0;
    var nextSymbols = {};
    for (var i = 0; i < parsed.length; i++) {
      var p = parsed[i];
      if (p.empty) continue;

      if (p.label) {
        if (nextSymbols.hasOwnProperty(p.label) || symbolsMap.hasOwnProperty(p.label)) {
          // allow the same value to be redeclared on later passes
          if (nextSymbols.hasOwnProperty(p.label) && nextSymbols[p.label] !== loc) {
            errors.push("Line " + p.lineNumber + ": duplicate label '" + p.label + "'");
          }
        }
        nextSymbols[p.label] = loc;
      }

      if (!p.mnemonic) continue;

      if (p.mnemonic === "ORG") {
        var orgValue = asmParseNumber(asmStripBrackets(p.dest));
        if (isNaN(orgValue)) {
          errors.push("Line " + p.lineNumber + ": ORG requires an address");
        } else {
          loc = orgValue & 0x1FF;
        }
        continue;
      }
      if (p.mnemonic === "EQU") {
        // LABEL: EQU value — the label already took `loc`; correct it
        var equValue = asmParseNumber(p.dest);
        if (p.label && !isNaN(equValue)) {
          nextSymbols[p.label] = equValue & 0x1FF;
        } else {
          errors.push("Line " + p.lineNumber + ": invalid EQU (use LABEL: EQU value)");
        }
        continue;
      }

      // Classify to compute the size
      var forceDA = (p.mnemonic === "JMP" || p.mnemonic === "JZ" || p.mnemonic === "JNZ" ||
        p.mnemonic === "JC" || p.mnemonic === "JS" || p.mnemonic === "ST" || p.mnemonic === "STORE");
      var forceSA = (p.mnemonic === "LD" || p.mnemonic === "LOAD");
      if (p.mnemonic === "OUT") forceDA = false;
      if (p.mnemonic === "IN") forceSA = false;

      var dInfo = asmClassifyOperand(p.dest, forceDA && !asmIsPort(asmStripBrackets(p.dest)));
      var sInfo = asmClassifyOperand(p.src, forceSA && !asmIsPort(asmStripBrackets(p.src)));

      if (p.mnemonic === "DB") {
        var tmpSym = {};
        for (var k in symbolsMap) tmpSym[k] = symbolsMap[k];
        for (var k2 in nextSymbols) tmpSym[k2] = nextSymbols[k2];
        try {
          var dbBytes = asmEmitInstruction("DB", p.dest, p.src, tmpSym, p.lineNumber);
          loc = (loc + dbBytes.length) & 0x1FF;
        } catch (eDb) {
          // provisional size 1; the error is reported in pass 2
          loc = (loc + 1) & 0x1FF;
        }
        continue;
      }

      if (!(p.mnemonic in ASM_OPCODES) && p.mnemonic !== "LOAD" && p.mnemonic !== "STORE") {
        // reported in pass 2
        continue;
      }

      var mergeSym = {};
      for (var ks in symbolsMap) mergeSym[ks] = symbolsMap[ks];
      for (var kn in nextSymbols) mergeSym[kn] = nextSymbols[kn];

      var tam = asmInstructionSize(p.mnemonic, dInfo, sInfo, mergeSym);
      if (tam < 0) tam = 1;
      loc = (loc + tam) & 0x1FF;
    }
    return { symbolsMap: nextSymbols, loc: loc };
  }

  for (var iter = 0; iter < maxIter; iter++) {
    errors = errors.filter(function () { return false; }); // clear duplicates from this pass
    errors = [];
    var r1 = pass1();
    var stable = true;
    for (var nom in r1.symbolsMap) {
      if (symbolsMap[nom] !== r1.symbolsMap[nom]) stable = false;
    }
    for (var nom2 in symbolsMap) {
      if (!r1.symbolsMap.hasOwnProperty(nom2)) stable = false;
    }
    symbolsMap = r1.symbolsMap;
    finalLoc = r1.loc;
    if (stable && iter > 0) break;
  }

  // --- Pass 2: emit bytes + listing ---
  var listing = [];
  var image = {}; // addr -> byte
  var loc2 = 0;
  var instructionCount = 0;
  var entry = null;

  for (var j = 0; j < parsed.length; j++) {
    var p2 = parsed[j];
    if (p2.empty) continue;

    if (p2.mnemonic === "ORG") {
      var ov = asmParseNumber(asmStripBrackets(p2.dest));
      if (!isNaN(ov)) loc2 = ov & 0x1FF;
      listing.push({
        address: loc2,
        bytes: [],
        hex: "",
        source: String(lines[j]).trim(),
        line: p2.lineNumber,
        directive: true
      });
      continue;
    }
    if (p2.mnemonic === "EQU") {
      listing.push({
        address: symbolsMap[p2.label] || 0,
        bytes: [],
        hex: "",
        source: String(lines[j]).trim(),
        line: p2.lineNumber,
        directive: true
      });
      continue;
    }

    if (!p2.mnemonic && p2.label) {
      listing.push({
        address: symbolsMap[p2.label] || loc2,
        bytes: [],
        hex: "",
        source: String(lines[j]).trim(),
        line: p2.lineNumber,
        directive: true
      });
      continue;
    }

    if (!p2.mnemonic) continue;

    try {
      var emitted = asmEmitInstruction(p2.mnemonic, p2.dest, p2.src, symbolsMap, p2.lineNumber);
      if (entry === null && emitted.length > 0 && p2.mnemonic !== "DB") {
        entry = loc2;
      }
      if (emitted.length > 0 && p2.mnemonic !== "DB" && p2.mnemonic !== "ORG") {
        instructionCount++;
      }
      // DB counts toward bytes but not as a strictly executable instruction
      var hexParts = emitted.map(asmAHex2);
      for (var b = 0; b < emitted.length; b++) {
        image[loc2 + b] = emitted[b];
      }
      listing.push({
        address: loc2,
        bytes: emitted.slice(),
        hex: hexParts.join(" "),
        source: String(lines[j]).trim(),
        line: p2.lineNumber
      });
      loc2 = (loc2 + emitted.length) & 0x1FF;
    } catch (err) {
      errors.push(err.message || String(err));
      listing.push({
        address: loc2,
        bytes: [],
        hex: "????",
        source: String(lines[j]).trim(),
        line: p2.lineNumber,
        error: true
      });
    }
  }

  // Dense bytes from 0 through the highest touched address
  var maxAddr = -1;
  for (var a in image) {
    var ai = parseInt(a, 10);
    if (ai > maxAddr) maxAddr = ai;
  }
  var dense = [];
  for (var x = 0; x <= maxAddr; x++) {
    dense.push(image.hasOwnProperty(x) ? image[x] : 0);
  }

  var size = maxAddr >= 0 ? maxAddr + 1 : 0;
  // Touched pages (not just ceil): count pages with at least one byte
  var pagesSet = {};
  for (var a2 in image) {
    pagesSet[Math.floor(parseInt(a2, 10) / ASM_PAGE_SIZE)] = true;
  }
  var pages = 0;
  for (var pg in pagesSet) pages++;
  if (pages === 0 && size > 0) pages = Math.ceil(size / ASM_PAGE_SIZE);

  return {
    ok: errors.length === 0,
    errors: errors,
    symbols: symbolsMap,
    listing: listing,
    bytes: dense,
    image: image,
    entry: entry == null ? 0 : entry,
    size: size,
    pages: pages,
    instructionCount: instructionCount
  };
}

/**
 * Formats the listing as text: Address | HEX bytes | Source
 */
function formatListing(result) {
  var lines = [];
  lines.push("Address | HEX bytes      | Source");
  lines.push("--------+----------------+---------------------------");
  var L = result.listing || [];
  for (var i = 0; i < L.length; i++) {
    var e = L[i];
    var addr = asmToHexAddress(e.address).padEnd(7, " ");
    var hex = (e.hex || "").padEnd(14, " ");
    lines.push(addr + " | " + hex + " | " + e.source);
  }
  if (result.errors && result.errors.length) {
    lines.push("");
    lines.push("ERRORS:");
    for (var j = 0; j < result.errors.length; j++) {
      lines.push("  - " + result.errors[j]);
    }
  }
  return lines.join("\n");
}

// --- Google Sheets glue (not executed in Node) ---

/** Default source-editor range (sheet Editor or Programas). */
var ASM_EDITOR_SHEET = "Editor";
var ASM_EDITOR_RANGE = "A1:A200";
var ASM_LISTING_SHEET = "Hoja 1";
// Replaces the I3:I13 stack (+ extra rows)
var ASM_LISTING_START_ROW = 3;
var ASM_LISTING_COL = 9; // I
var ASM_LISTING_MAX_ROWS = 40;

/**
 * Reads source from sheet Editor (column A) and writes the listing
 * on Hoja 1 column I (Address | HEX | Source), replacing the Instruction Stack.
 */
function assembleAndShowListing() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var editorSheet = ss.getSheetByName(ASM_EDITOR_SHEET) || ss.getSheetByName("Programas");
  if (!editorSheet) {
    SpreadsheetApp.getUi().alert("Could not find sheet Editor or Programas.");
    return;
  }
  var values = editorSheet.getRange(ASM_EDITOR_RANGE).getValues();
  var lines = [];
  for (var i = 0; i < values.length; i++) {
    lines.push(values[i][0] == null ? "" : String(values[i][0]));
  }
  // trim the empty tail
  while (lines.length && !String(lines[lines.length - 1]).trim()) lines.pop();

  var res = assemble(lines);
  var sheet = ss.getSheetByName(ASM_LISTING_SHEET) || ss.getActiveSheet();
  sheet.getRange(ASM_LISTING_START_ROW, ASM_LISTING_COL, ASM_LISTING_MAX_ROWS, 1)
    .clearContent().setBackground(null);

  var rows = [];
  rows.push(["Address | HEX | Source"]);
  for (var k = 0; k < res.listing.length && k < ASM_LISTING_MAX_ROWS - 1; k++) {
    var e = res.listing[k];
    var text = asmToHexAddress(e.address) + ": " + (e.hex || "") + "  |  " + e.source;
    rows.push([text]);
  }
  sheet.getRange(ASM_LISTING_START_ROW, ASM_LISTING_COL, rows.length, 1).setValues(rows);

  if (!res.ok) {
    SpreadsheetApp.getUi().alert("Assembly completed with errors:\n" + res.errors.join("\n"));
  } else {
    SpreadsheetApp.getUi().alert(
      "Assembly OK. " + res.instructionCount + " instruction(s), " +
      res.size + " bytes, " + res.pages + " page(s)."
    );
  }
  return res;
}

/**
 * Assembles free-form text (handy from the editor or from tests).
 */
function assembleText(text) {
  return assemble(text);
}
