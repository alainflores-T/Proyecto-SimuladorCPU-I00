/**
 * FetchBytes.gs — Virtual fetch of one variable-length instruction.
 * Boundaries record instruction starts and emitted byte lengths.
 * Live virtual-memory bytes remain authoritative.
 * Physical text mode does not use this file.
 */
var LOADER_BOUNDARIES_KEY = "LOADER_BOUNDARIES";

function cpuVirtualModeOn() {
  return typeof memoriaVirtualActiva === "function" && !!memoriaVirtualActiva();
}

function cpuParseAddress(value) {
  if (typeof value === "number" && value === value && Math.floor(value) === value && value >= 0 && value <= 511) return value;
  var text = String(value == null ? "" : value).trim();
  if (!/^[0-9A-Fa-f]{1,3}H$/i.test(text)) return null;
  var n = parseInt(text.slice(0, -1), 16);
  if (n !== n || n < 0 || n > 511) return null;
  return n;
}

function cpuFormatAddress(n) {
  var width = n > 255 ? 3 : 2;
  var hex = (n & 0x1FF).toString(16).toUpperCase();
  while (hex.length < width) hex = "0" + hex;
  return hex + "H";
}

function cpuFormatBytes(bytes) {
  var parts = [];
  var i;
  for (i = 0; i < bytes.length; i++) {
    var hex = (bytes[i] & 0xFF).toString(16).toUpperCase();
    if (hex.length < 2) hex = "0" + hex;
    parts.push(hex);
  }
  return parts.join(" ");
}

function cpuOpcodeInfo(op) {
  op = op & 0xFF;
  if ((op & 0x10) && op !== 0x20 && op !== 0x21 && op !== 0xFF && DIS_OPCODES[op & ~0x10]) {
    return { mnemonic: DIS_OPCODES[op & ~0x10], immediate: true };
  }
  if (!DIS_OPCODES[op]) return null;
  return { mnemonic: DIS_OPCODES[op], immediate: false };
}

function cpuLegalLength(opcode, length) {
  var info = cpuOpcodeInfo(opcode);
  if (!info) return false;
  var name = info.mnemonic;
  if (name === "NOP" || name === "HLT") return length === 1;
  if (name === "INC" || name === "DEC") return length === 2;
  if (name === "JMP" || name === "JZ" || name === "JNZ" || name === "JC" || name === "JS") return length === 2 || length === 3;
  if (name === "LD" || name === "ST") return length === 3 || length === 4;
  if (name === "IN" || name === "OUT") return length === 3;
  return length === 3;
}

function loaderBoundariesFromListing(listing) {
  var map = {};
  var i;
  for (i = 0; i < listing.length; i++) {
    var entry = listing[i];
    if (!entry.bytes || !entry.bytes.length) continue;
    var parsed = asmParseLine(entry.source);
    if (!parsed.mnemonic || parsed.mnemonic === "DB" || parsed.mnemonic === "ORG" || parsed.mnemonic === "EQU") continue;
    map[String(entry.address)] = entry.bytes.length;
  }
  return map;
}

function cpuSaveBoundaries(map) {
  if (typeof PropertiesService === "undefined") return;
  PropertiesService.getDocumentProperties().setProperty(LOADER_BOUNDARIES_KEY, JSON.stringify(map || {}));
}

function cpuClearBoundaries() {
  if (typeof PropertiesService === "undefined") return;
  PropertiesService.getDocumentProperties().deleteProperty(LOADER_BOUNDARIES_KEY);
}

function cpuLoadBoundaries() {
  if (typeof PropertiesService === "undefined") return {};
  var raw = PropertiesService.getDocumentProperties().getProperty(LOADER_BOUNDARIES_KEY);
  if (!raw) return {};
  try {
    var parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function cpuParseMemoryByte(value) {
  if (typeof value === "number" && value === value && Math.floor(value) === value && value >= 0 && value <= 255) return value;
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

function cpuDecodeSlice(bytes) {
  if (!bytes || !bytes.length) return { ok: false, reason: "No bytes." };
  if (!cpuLegalLength(bytes[0], bytes.length)) {
    return { ok: false, reason: "Live opcode " + cpuFormatBytes([bytes[0]]) + " cannot be " + bytes.length + " bytes." };
  }
  var decoded = disassembleInstruction(bytes);
  if (!decoded.ok) return { ok: false, reason: decoded.error || "Decode failed." };
  return { ok: true, text: decoded.text, hex: cpuFormatBytes(bytes), bytes: bytes.slice() };
}

function cpuReadVirtualByte(sheet, address) {
  var cell = sheet.getRange(REG_MAR);
  if (cell.setNumberFormat) cell.setNumberFormat("@");
  cell.setValue(cpuFormatAddress(address));
  var raw = (typeof leerMemoriaIntegrada === "function")
    ? leerMemoriaIntegrada(sheet, "instruccion")
    : leerMemoriaCPU(sheet);
  var byte = cpuParseMemoryByte(raw);
  if (byte === null) return { ok: false, reason: "Virtual byte at " + cpuFormatAddress(address) + " is not numeric." };
  return { ok: true, byte: byte };
}

function cpuFetchVirtualInstruction(sheet) {
  if (typeof leerMemoriaIntegrada !== "function" && typeof leerMemoriaCPU !== "function") {
    return { ok: false, reason: "leerMemoriaCPU is missing." };
  }
  var pc = cpuParseAddress(sheet.getRange(REG_PC).getValue());
  if (pc === null) return { ok: false, reason: "PC is not a virtual address." };
  var map = cpuLoadBoundaries();
  var length = map[String(pc)];
  if (!length) return { ok: false, reason: "PC " + cpuFormatAddress(pc) + " is not an instruction boundary." };
  var bytes = [];
  var i;
  for (i = 0; i < length; i++) {
    if (pc + i > 511) return { ok: false, reason: "Instruction runs past 1FFH." };
    var read = cpuReadVirtualByte(sheet, pc + i);
    if (!read.ok) return read;
    bytes.push(read.byte);
  }
  var decoded = cpuDecodeSlice(bytes);
  if (!decoded.ok) return decoded;
  var next = pc + length;
  if (next > 511) next = 0;
  return { ok: true, bytes: bytes, text: decoded.text, hex: decoded.hex, nextPc: next };
}

function cpuStopFetch(sheet, reason) {
  sheet.getRange(CPU_STATE).setValue("HALT");
  if (typeof registrarLog === "function") registrarLog(sheet, "FETCH stopped: " + reason);
  return { ok: false, reason: reason };
}

function cpuApplyVirtualFetch2(sheet) {
  var fetched = cpuFetchVirtualInstruction(sheet);
  if (!fetched.ok) return cpuStopFetch(sheet, fetched.reason);
  sheet.getRange(CPU_STATE).setValue("FETCH_2");
  var cell = sheet.getRange(REG_MDR);
  if (cell.setNumberFormat) cell.setNumberFormat("@");
  cell.setValue(fetched.hex);
  return fetched;
}

function cpuApplyVirtualFetch3(sheet) {
  var previous = String(sheet.getRange(REG_MDR).getValue() || "");
  var fetched = cpuFetchVirtualInstruction(sheet);
  if (!fetched.ok) return cpuStopFetch(sheet, fetched.reason);
  if (previous && previous !== fetched.hex && typeof registrarLog === "function") {
    registrarLog(sheet, "FETCH: MDR showed " + previous + " but live bytes are " + fetched.hex + ". IR uses the live bytes.");
  }
  sheet.getRange(CPU_STATE).setValue("FETCH_3");
  var ir = sheet.getRange(REG_IR);
  if (ir.setNumberFormat) ir.setNumberFormat("@");
  ir.setValue(fetched.text);
  sheet.getRange(REG_IR_MAQ).setValue("'" + fetched.hex);
  var pc = sheet.getRange(REG_PC);
  if (pc.setNumberFormat) pc.setNumberFormat("@");
  pc.setValue(cpuFormatAddress(fetched.nextPc));
  return fetched;
}