/**
 * Disassembler.gs — Desensamblador inverso de la ISA.
 * Dado el arreglo exacto de bytes de UNA instrucción, recupera el mnemónico.
 * Así se evita la ambigüedad de direcciones de 1 vs 2 bytes en un stream crudo.
 */

var DIS_OPCODES_BASE = {
  0x00: "NOP", 0x01: "MOV", 0x02: "ADD", 0x03: "SUB", 0x04: "INC",
  0x05: "DEC", 0x06: "CMP", 0x07: "LD", 0x08: "ST", 0x09: "JMP",
  0x0A: "JZ", 0x0B: "JNZ", 0x0C: "JC", 0x0D: "JS", 0x0E: "AND",
  0x0F: "OR", 0x20: "IN", 0x21: "OUT", 0xFF: "HLT"
};

var DIS_REG_NAMES = { 0: "AX", 1: "BX", 2: "CX", 3: "DX" };
var DIS_PORT_NAMES = { 0: "KBD", 1: "LCD" };
var DIS_FLAG_INMEDIATO = 0x10;

function disAHexDir(n) {
  var w = n > 0xFF ? 3 : 2;
  return (n & 0x1FF).toString(16).toUpperCase().padStart(w, "0") + "H";
}

function disAHex2(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, "0") + "H";
}

/**
 * Lee una dirección de `bytes` a partir de `offset` sabiendo cuántos bytes
 * de dirección quedan (`restantes`). Devuelve {valor, leidos}.
 */
function disLeerAddr(bytes, offset, restantes) {
  if (restantes >= 2) {
    var hi = bytes[offset] & 0xFF;
    var lo = bytes[offset + 1] & 0xFF;
    return { valor: ((hi << 8) | lo) & 0x1FF, leidos: 2 };
  }
  if (restantes >= 1) {
    return { valor: bytes[offset] & 0xFF, leidos: 1 };
  }
  throw new Error("Bytes insuficientes para dirección");
}

/**
 * Desensambla UNA instrucción completa (arreglo de bytes exacto).
 * Retorna { ok, mnemonic, text, dest, src, bytes, length, immediate }
 */
function desensamblarInstruccion(byteArr) {
  var bytes = Array.isArray(byteArr) ? byteArr : [];
  if (bytes.length === 0) {
    return { ok: false, error: "Sin bytes", text: "???", length: 0 };
  }

  var op = bytes[0] & 0xFF;
  var imm = false;
  var base = op;
  // Opcodes con flag de inmediato (+10H) en el nibble alto bajo
  if ((op & DIS_FLAG_INMEDIATO) && DIS_OPCODES_BASE[op & ~DIS_FLAG_INMEDIATO] &&
      op !== 0x20 && op !== 0x21 && op !== 0xFF) {
    // 0x11 = MOV imm, 0x12 = ADD imm, ... 0x18 = ST imm, 0x1E = AND imm, 0x1F = OR imm
    var sinFlag = op & ~DIS_FLAG_INMEDIATO;
    if (DIS_OPCODES_BASE[sinFlag]) {
      base = sinFlag;
      imm = true;
    }
  }

  var mnemonic = DIS_OPCODES_BASE[base];
  if (!mnemonic) {
    // ¿opcode inmediato desconocido?
    if (DIS_OPCODES_BASE[op]) {
      mnemonic = DIS_OPCODES_BASE[op];
      base = op;
    } else {
      return {
        ok: false,
        error: "Opcode desconocido " + disAHex2(op),
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
      throw new Error("Instrucción truncada para " + mnemonic);
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
      var ad = disLeerAddr(bytes, i, rest);
      dest = disAHexDir(ad.valor);
      i += ad.leidos;
      text = mnemonic + " " + dest;
    } else if (mnemonic === "LD") {
      need(1);
      dest = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      i++;
      var adL = disLeerAddr(bytes, i, bytes.length - i);
      src = "[" + disAHexDir(adL.valor) + "]";
      i += adL.leidos;
      text = "LD " + dest + ", " + src;
    } else if (mnemonic === "ST") {
      // bytes: opcode, addr..., src
      // src es el último byte; addr es lo del medio
      need(2);
      var srcByte = bytes[bytes.length - 1] & 0xFF;
      var addrBytes = bytes.slice(i, bytes.length - 1);
      var adS;
      if (addrBytes.length >= 2) {
        adS = { valor: ((addrBytes[0] << 8) | addrBytes[1]) & 0x1FF, leidos: 2 };
      } else {
        adS = { valor: addrBytes[0] & 0xFF, leidos: 1 };
      }
      dest = "[" + disAHexDir(adS.valor) + "]";
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
      var puerto = DIS_PORT_NAMES[bytes[i]] || disAHex2(bytes[i]);
      i++;
      src = "[" + puerto + "]";
      text = "IN " + dest + ", " + src;
    } else if (mnemonic === "OUT") {
      need(2);
      var pOut = DIS_PORT_NAMES[bytes[i]] || disAHex2(bytes[i]);
      i++;
      src = DIS_REG_NAMES[bytes[i]] || ("R" + bytes[i]);
      i++;
      dest = "[" + pOut + "]";
      text = "OUT " + dest + ", " + src;
    } else {
      // MOV ADD SUB CMP AND OR (reg/reg o reg/imm)
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
 * Desensambla un listing producido por ensamblar() y devuelve textos.
 * Ideal para la prueba de ida y vuelta.
 */
function desensamblarListing(listing) {
  var out = [];
  for (var i = 0; i < listing.length; i++) {
    var e = listing[i];
    if (!e.bytes || e.bytes.length === 0) continue;
    if (e.directive) continue;
    var d = desensamblarInstruccion(e.bytes);
    out.push(d);
  }
  return out;
}

/**
 * Normaliza un mnemónico fuente para comparar ida-y-vuelta
 * (mayúsculas, corchetes en LD/ST/IN/OUT, sufijo H en hex).
 */
function asmNormalizarParaComparar(texto) {
  var p = asmParseLinea(texto);
  if (p.vacia || !p.mnemonic) return "";
  if (p.mnemonic === "ORG" || p.mnemonic === "EQU" || p.mnemonic === "DB") {
    return String(texto).trim().toUpperCase().replace(/\s+/g, " ");
  }
  // Re-ensamblar vía bytes y desensamblar sería circular; normalizamos texto
  var dest = p.dest;
  var src = p.src;
  var m = p.mnemonic === "LOAD" ? "LD" : (p.mnemonic === "STORE" ? "ST" : p.mnemonic);

  function normOp(op, comoAddr, comoPuerto) {
    if (!op) return "";
    var lim = asmLimpiarCorchetes(op).toUpperCase();
    if (asmEsRegistro(lim) && !comoAddr && !comoPuerto) return lim;
    if (asmEsPuerto(lim) || comoPuerto) return "[" + lim + "]";
    var n = asmParseNumero(lim);
    if (!isNaN(n)) {
      if (comoAddr) return "[" + disAHexDir(n) + "]";
      return disAHex2(n & 0xFF);
    }
    // etiqueta: se compara tras ensamblar por bytes, no por texto
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
    var nd = asmLimpiarCorchetes(dest).toUpperCase();
    var nn = asmParseNumero(nd);
    if (!isNaN(nn)) return m + " " + disAHexDir(nn);
    return m + " " + nd;
  }
  if (m === "INC" || m === "DEC" || m === "NOP" || m === "HLT") {
    return src ? m + " " + normOp(dest, false, false) : (dest ? m + " " + normOp(dest, false, false) : m);
  }
  return m + " " + normOp(dest, false, false) + ", " + normOp(src, false, false);
}

/**
 * Prueba de ida y vuelta sobre un fuente.
 * Retorna { ok, mismatches: [{line, source, disassembled}] }.
 */
function pruebaIdaYVuelta(fuente) {
  var res = ensamblar(fuente);
  if (!res.ok) {
    return { ok: false, assembleErrors: res.errors, mismatches: [] };
  }
  var mismatches = [];
  for (var i = 0; i < res.listing.length; i++) {
    var e = res.listing[i];
    if (!e.bytes || !e.bytes.length) continue;
    // Saltar DB: el desensamblador no recupera DB
    var parsed = asmParseLinea(e.source);
    if (parsed.mnemonic === "DB" || parsed.mnemonic === "ORG" || parsed.mnemonic === "EQU") continue;
    if (!parsed.mnemonic) continue;

    var d = desensamblarInstruccion(e.bytes);
    if (!d.ok) {
      mismatches.push({ line: e.line, source: e.source, disassembled: d.error });
      continue;
    }
    // Comparar por re-ensamblado del texto desensamblado
    var re = ensamblar(d.text);
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
