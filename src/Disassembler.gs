/**
 * Disassembler.gs — Inverse disassembler for the ISA.
 * Given the exact byte array of ONE instruction, recover the mnemonic.
 * That avoids the 1-byte vs 2-byte address ambiguity of a raw stream.
 */

var DIS_OPCODES_BASE = {
  0x00: "NOP", 0x01: "MOV", 0x02: "ADD", 0x03: "SUB", 0x04: "INC",
  0x05: "DEC", 0x06: "CMP", 0x07: "LD", 0x08: "ST", 0x09: "JMP",
  0x0A: "JZ", 0x0B: "JNZ", 0x0C: "JC", 0x0D: "JS", 0x0E: "AND",
  0x0F: "OR", 0x20: "IN", 0x21: "OUT", 0xFF: "HLT"
};

var DIS_REG_NAMES = { 0: "AX", 1: "BX", 2: "CX", 3: "DX" };
var DIS_PORT_NAMES = { 0: "KBD", 1: "LCD" };
var DIS_FLAG_IMMEDIATE = 0x10;

function disToHexAddress(n) {
  var w = n > 0xFF ? 3 : 2;
  return (n & 0x1FF).toString(16).toUpperCase().padStart(w, "0") + "H";
}

function disAHex2(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, "0") + "H";
}

/**
 * Reads an address from `bytes` at `offset`, given how many address bytes
 * remain (`remaining`). Returns {value, bytesRead}.
 */
function disReadAddress(bytes, offset, remaining) {
  if (remaining >= 2) {
    var hi = bytes[offset] & 0xFF;
    var lo = bytes[offset + 1] & 0xFF;
    return { value: ((hi << 8) | lo) & 0x1FF, bytesRead: 2 };
  }
  if (remaining >= 1) {
    return { value: bytes[offset] & 0xFF, bytesRead: 1 };
  }
  throw new Error("Not enough bytes for an address");
}

/**
 * Disassembles ONE complete instruction (exact byte array).
 * Returns { ok, mnemonic, text, dest, src, bytes, length, immediate }
 */
function disassembleInstruction(byteArr) {
  var bytes = Array.isArray(byteArr) ? byteArr : [];
  if (bytes.length === 0) {
    return { ok: false, error: "No bytes", text: "???", length: 0 };
  }

  var op = bytes[0] & 0xFF;
  var imm = false;
  var base = op;
  // Opcodes with the immediate flag (+10H) in the high nibble
  if ((op & DIS_FLAG_IMMEDIATE) && DIS_OPCODES_BASE[op & ~DIS_FLAG_IMMEDIATE] &&
      op !== 0x20 && op !== 0x21 && op !== 0xFF) {
    // 0x11 = MOV imm, 0x12 = ADD imm, ... 0x18 = ST imm, 0x1E = AND imm, 0x1F = OR imm
    var withoutFlag = op & ~DIS_FLAG_IMMEDIATE;
    if (DIS_OPCODES_BASE[withoutFlag]) {
      base = withoutFlag;
      imm = true;
    }
  }

  var mnemonic = DIS_OPCODES_BASE[base];
  if (!mnemonic) {
    // Unknown immediate opcode?
    if (DIS_OPCODES_BASE[op]) {
      mnemonic = DIS_OPCODES_BASE[op];
      base = op;
    } else {
      return {
        ok: false,
        error: "Unknown opcode " + disAHex2(op),
        text: "??",
        length: bytes.length,
        bytes: bytes.slice()
      };
    }
  }

  var i = 1;
  var dest = "";
  var src = "";
  var text = mnemonic;

  function need(n) {
    if (bytes.length < i + n) {
      throw new Error("Truncated instruction for " + mnemonic);
    }
  }

  try {
    if (mnemonic === "NOP" || mnemonic === "HLT") {
      text = mnemonic;
    } else if (mnemonic === "INC" || mnemonic === "DEC") {
      need(1);
      dest = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      i++;
      text = mnemonic + " " + dest;
    } else if (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
               mnemonic === "JC" || mnemonic === "JS") {
      var rest = bytes.length - i;
      var ad = disReadAddress(bytes, i, rest);
      dest = disToHexAddress(ad.value);
      i += ad.bytesRead;
      text = mnemonic + " " + dest;
    } else if (mnemonic === "LD") {
      need(1);
      dest = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      i++;
      var adL = disReadAddress(bytes, i, bytes.length - i);
      src = "[" + disToHexAddress(adL.value) + "]";
      i += adL.bytesRead;
      text = "LD " + dest + ", " + src;
    } else if (mnemonic === "ST") {
      // bytes: opcode, addr..., src
      // src is the last byte; addr is what is in between
      need(2);
      var srcByte = bytes[bytes.length - 1] & 0xFF;
      var addrBytes = bytes.slice(i, bytes.length - 1);
      var adS;
      if (addrBytes.length >= 2) {
        adS = { value: ((addrBytes[0] << 8) | addrBytes[1]) & 0x1FF, bytesRead: 2 };
      } else {
        adS = { value: addrBytes[0] & 0xFF, bytesRead: 1 };
      }
      dest = "[" + disToHexAddress(adS.value) + "]";
      if (imm) {
        src = disAHex2(srcByte);
      } else {
        src = DIS_REG_NAMES[srcByte] || ("R" + srcByte);
      }
      i = bytes.length;
      text = "ST " + dest + ", " + src;
    } else if (mnemonic === "IN") {
      need(2);
      dest = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      i++;
      var portName = DIS_PORT_NAMES[bytes[i]] || disAHex2(bytes[i]);
      i++;
      src = "[" + portName + "]";
      text = "IN " + dest + ", " + src;
    } else if (mnemonic === "OUT") {
      need(2);
      var outPort = DIS_PORT_NAMES[bytes[i]] || disAHex2(bytes[i]);
      i++;
      src = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      i++;
      dest = "[" + outPort + "]";
      text = "OUT " + dest + ", " + src;
    } else {
      // MOV ADD SUB CMP AND OR (reg/reg or reg/imm)
      need(2);
      dest = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      i++;
      if (imm) {
        src = disAHex2(bytes[i]);
      } else {
        src = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      }
      i++;
      text = mnemonic + " " + dest + ", " + src;
    }
  } catch (e) {
    return {
      ok: false,
      error: e.message || String(e),
      text: "???",
      length: bytes.length,
      bytes: bytes.slice()
    };
  }

  return {
    ok: true,
    mnemonic: mnemonic,
    text: text,
    dest: dest,
    src: src,
    immediate: imm,
    bytes: bytes.slice(),
    length: bytes.length
  };
}

/**
 * Disassembles a listing produced by assemble() and returns text.
 * Used by the round-trip test.
 */
function disassembleListing(listing) {
  var out = [];
  for (var i = 0; i < listing.length; i++) {
    var e = listing[i];
    if (!e.bytes || e.bytes.length === 0) continue;
    if (e.directive) continue;
    var d = disassembleInstruction(e.bytes);
    out.push(d);
  }
  return out;
}

/**
 * Normalizes a source mnemonic for round-trip comparison
 * (uppercase, brackets on LD/ST/IN/OUT, H suffix on hex).
 */
function asmNormalizeForCompare(text) {
  var p = asmParseLine(text);
  if (p.empty || !p.mnemonic) return "";
  if (p.mnemonic === "ORG" || p.mnemonic === "EQU" || p.mnemonic === "DB") {
    return String(text).trim().toUpperCase().replace(/\s+/g, " ");
  }
  // Re-assembling via bytes and disassembling would be circular; normalize the text
  var dest = p.dest;
  var src = p.src;
  var m = p.mnemonic === "LOAD" ? "LD" : (p.mnemonic === "STORE" ? "ST" : p.mnemonic);

  function normOp(op, asAddress, asPort) {
    if (!op) return "";
    var lim = asmStripBrackets(op).toUpperCase();
    if (asmIsRegister(lim) && !asAddress && !asPort) return lim;
    if (asmIsPort(lim) || asPort) return "[" + lim + "]";
    var n = asmParseNumber(lim);
    if (!isNaN(n)) {
      if (asAddress) return "[" + disToHexAddress(n) + "]";
      return disAHex2(n & 0xFF);
    }
    // label: compared after assemble by bytes, not by text
    return lim;
  }

  if (m === "LD") {
    return "LD " + normOp(dest, false, false) + ", " + normOp(src, true, false);
  }
  if (m === "ST") {
    return "ST " + normOp(dest, true, false) + ", " + normOp(src, false, false);
  }
  if (m === "IN") {
    return "IN " + normOp(dest, false, false) + ", " + normOp(src, false, true);
  }
  if (m === "OUT") {
    return "OUT " + normOp(dest, false, true) + ", " + normOp(src, false, false);
  }
  if (m === "JMP" || m === "JZ" || m === "JNZ" || m === "JC" || m === "JS") {
    var nd = asmStripBrackets(dest).toUpperCase();
    var nn = asmParseNumber(nd);
    if (!isNaN(nn)) return m + " " + disToHexAddress(nn);
    return m + " " + nd;
  }
  if (m === "INC" || m === "DEC" || m === "NOP" || m === "HLT") {
    return src ? m + " " + normOp(dest, false, false) : (dest ? m + " " + normOp(dest, false, false) : m);
  }
  return m + " " + normOp(dest, false, false) + ", " + normOp(src, false, false);
}

/**
 * Round-trip check over source text.
 * Returns { ok, mismatches: [{line, source, disassembled}] }.
 */
function roundTripTest(sourceText) {
  var res = assemble(sourceText);
  if (!res.ok) {
    return { ok: false, assembleErrors: res.errors, mismatches: [] };
  }
  var mismatches = [];
  for (var i = 0; i < res.listing.length; i++) {
    var e = res.listing[i];
    if (!e.bytes || !e.bytes.length) continue;
    // Skip DB: the disassembler does not recover DB
    var parsed = asmParseLine(e.source);
    if (parsed.mnemonic === "DB" || parsed.mnemonic === "ORG" || parsed.mnemonic === "EQU") continue;
    if (!parsed.mnemonic) continue;

    var d = disassembleInstruction(e.bytes);
    if (!d.ok) {
      mismatches.push({ line: e.line, source: e.source, disassembled: d.error });
      continue;
    }
    // Compare by reassembling the disassembled text
    var re = assemble(d.text);
    if (!re.ok || !re.listing.length) {
      mismatches.push({ line: e.line, source: e.source, disassembled: d.text, reason: "reassemble fail" });
      continue;
    }
    var origHex = e.hex;
    var reHex = re.listing[0].hex;
    if (origHex !== reHex) {
      mismatches.push({
        line: e.line,
        source: e.source,
        disassembled: d.text,
        origHex: origHex,
        reHex: reHex
      });
    }
  }
  return { ok: mismatches.length === 0, mismatches: mismatches, listing: res.listing };
}
