/**
 * Disassembler.gs — Inverse of codificarInstruccion.
 * Given the exact byte array of ONE instruction, recover the mnemonic.
 * The caller knows the instruction length, so a 1-byte address is not
 * confused with a 2-byte address.
 */

var DIS_OPCODES = {
  0x00: "NOP", 0x01: "MOV", 0x02: "ADD", 0x03: "SUB", 0x04: "INC",
  0x05: "DEC", 0x06: "CMP", 0x07: "LD", 0x08: "ST", 0x09: "JMP",
  0x0A: "JZ", 0x0B: "JNZ", 0x0C: "JC", 0x0D: "JS", 0x0E: "AND",
  0x0F: "OR", 0x20: "IN", 0x21: "OUT", 0xFF: "HLT"
};
var DIS_REGS = { 0: "AX", 1: "BX", 2: "CX", 3: "DX" };
var DIS_PORTS = { 0: "KBD", 1: "LCD" };
var DIS_IMMEDIATE_FLAG = 0x10;

function disFormatAddr(n) {
  var v = n & 0x1FF;
  var width = v > 0xFF ? 3 : 2;
  return v.toString(16).toUpperCase().padStart(width, "0") + "H";
}

function disFormatByte(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, "0") + "H";
}

function disReadAddress(bytes, offset, remaining) {
  if (remaining >= 2) {
    return { value: (((bytes[offset] & 0xFF) << 8) | (bytes[offset + 1] & 0xFF)) & 0x1FF, bytesRead: 2 };
  }
  if (remaining >= 1) return { value: bytes[offset] & 0xFF, bytesRead: 1 };
  throw new Error("Not enough bytes for an address");
}

/**
 * Disassembles ONE complete instruction.
 * Returns { ok, mnemonic, text, dest, src, bytes, length, immediate }.
 */
function disassembleInstruction(byteArr) {
  var bytes = Array.isArray(byteArr) ? byteArr : [];
  if (bytes.length === 0) return { ok: false, error: "No bytes", text: "???", length: 0 };

  var op = bytes[0] & 0xFF;
  var immediate = false;
  var base = op;
  if ((op & DIS_IMMEDIATE_FLAG) && op !== 0x20 && op !== 0x21 && op !== 0xFF) {
    var withoutFlag = op & ~DIS_IMMEDIATE_FLAG;
    if (DIS_OPCODES[withoutFlag]) {
      base = withoutFlag;
      immediate = true;
    }
  }
  var mnemonic = DIS_OPCODES[base];
  if (!mnemonic) {
    return { ok: false, error: "Unknown opcode " + disFormatByte(op), text: "??", length: bytes.length, bytes: bytes.slice() };
  }

  var i = 1;
  var dest = "";
  var src = "";
  var text = mnemonic;

  function need(n) {
    if (bytes.length < i + n) throw new Error("Truncated instruction for " + mnemonic);
  }

  try {
    if (mnemonic === "NOP" || mnemonic === "HLT") {
      text = mnemonic;
    } else if (mnemonic === "INC" || mnemonic === "DEC") {
      need(1);
      dest = DIS_REGS[bytes[i]] || ("R" + bytes[i]);
      i++;
      text = mnemonic + " " + dest;
    } else if (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" || mnemonic === "JC" || mnemonic === "JS") {
      var jump = disReadAddress(bytes, i, bytes.length - i);
      dest = disFormatAddr(jump.value);
      i += jump.bytesRead;
      text = mnemonic + " " + dest;
    } else if (mnemonic === "LD") {
      need(1);
      dest = DIS_REGS[bytes[i]] || ("R" + bytes[i]);
      i++;
      var loadAddr = disReadAddress(bytes, i, bytes.length - i);
      src = "[" + disFormatAddr(loadAddr.value) + "]";
      i += loadAddr.bytesRead;
      text = "LD " + dest + ", " + src;
    } else if (mnemonic === "ST") {
      need(2);
      var srcByte = bytes[bytes.length - 1] & 0xFF;
      var addrBytes = bytes.slice(i, bytes.length - 1);
      var stored;
      if (addrBytes.length >= 2) stored = ((addrBytes[0] << 8) | addrBytes[1]) & 0x1FF;
      else stored = addrBytes[0] & 0xFF;
      dest = "[" + disFormatAddr(stored) + "]";
      src = immediate ? disFormatByte(srcByte) : (DIS_REGS[srcByte] || ("R" + srcByte));
      text = "ST " + dest + ", " + src;
    } else if (mnemonic === "IN") {
      need(2);
      dest = DIS_REGS[bytes[i]] || ("R" + bytes[i]);
      i++;
      var inPort = DIS_PORTS[bytes[i]] || disFormatByte(bytes[i]);
      src = "[" + inPort + "]";
      text = "IN " + dest + ", " + src;
    } else if (mnemonic === "OUT") {
      need(2);
      var outPort = DIS_PORTS[bytes[i]] || disFormatByte(bytes[i]);
      i++;
      src = DIS_REGS[bytes[i]] || ("R" + bytes[i]);
      dest = "[" + outPort + "]";
      text = "OUT " + dest + ", " + src;
    } else {
      need(2);
      dest = DIS_REGS[bytes[i]] || ("R" + bytes[i]);
      i++;
      src = immediate ? disFormatByte(bytes[i]) : (DIS_REGS[bytes[i]] || ("R" + bytes[i]));
      text = mnemonic + " " + dest + ", " + src;
    }
  } catch (err) {
    return { ok: false, error: err.message || String(err), text: "???", length: bytes.length, bytes: bytes.slice() };
  }

  return { ok: true, mnemonic: mnemonic, text: text, dest: dest, src: src, immediate: immediate, bytes: bytes.slice(), length: bytes.length };
}

/**
 * Round-trip check. DB, ORG and EQU are skipped: they are directives, not instructions.
 * Returns { ok, mismatches, assembleErrors }.
 */
function roundTripTest(sourceText) {
  var result = assemble(sourceText);
  if (!result.ok) return { ok: false, assembleErrors: result.errors, mismatches: [] };
  var mismatches = [];
  for (var i = 0; i < result.listing.length; i++) {
    var entry = result.listing[i];
    if (!entry.bytes || !entry.bytes.length) continue;
    var parsed = asmParseLine(entry.source);
    if (!parsed.mnemonic || parsed.mnemonic === "DB" || parsed.mnemonic === "ORG" || parsed.mnemonic === "EQU") continue;
    var decoded = disassembleInstruction(entry.bytes);
    if (!decoded.ok) {
      mismatches.push({ line: entry.line, source: entry.source, disassembled: decoded.error });
      continue;
    }
    var again = assemble(decoded.text);
    var againHex = again.ok && again.listing.length ? again.listing[0].hex : "";
    if (!again.ok || againHex !== entry.hex) {
      mismatches.push({ line: entry.line, source: entry.source, disassembled: decoded.text, origHex: entry.hex, reHex: againHex });
    }
  }
  return { ok: mismatches.length === 0, mismatches: mismatches };
}

/**
 * Reads the machine-code IR (REG_IR_MAQ) and appends the mnemonic to the LOG.
 * Call this from faseDecode without editing Alain's existing log line.
 */
function logDisassembledIr(sheet) {
  var raw = String(sheet.getRange(REG_IR_MAQ).getValue() || "").replace(/'/g, "").trim();
  if (!raw || raw === "??") return;
  var bytes = raw.split(/\s+/).map(function (hex) { return parseInt(hex, 16); });
  if (bytes.some(function (n) { return isNaN(n); })) return;
  var decoded = disassembleInstruction(bytes);
  if (decoded.ok && typeof registrarLogDetallado === "function") {
    registrarLogDetallado(sheet, "IR mnemonic: " + decoded.text);
  }
}