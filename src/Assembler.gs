/**
 * Assembler.gs — Ensamblador de dos pasadas para la ISA del simulador.
 * Lógica pura (sin SpreadsheetApp) arriba; pegamento de Sheets al final.
 * Codificación alineada con docs/ISA.md y codificarInstruccion de Alain (PR #41).
 */

// --- Tablas de la ISA (independientes de develop / ramas ajenas) ---
var ASM_OPCODES = {
  "NOP": 0x00, "MOV": 0x01, "ADD": 0x02, "SUB": 0x03, "INC": 0x04,
  "DEC": 0x05, "CMP": 0x06, "LD": 0x07, "LOAD": 0x07, "ST": 0x08,
  "STORE": 0x08, "JMP": 0x09, "JZ": 0x0A, "JNZ": 0x0B, "JC": 0x0C,
  "JS": 0x0D, "AND": 0x0E, "OR": 0x0F, "IN": 0x20, "OUT": 0x21,
  "HLT": 0xFF
};

var ASM_REG_CODES = { "AX": 0x00, "BX": 0x01, "CX": 0x02, "DX": 0x03 };
var ASM_PORT_CODES = { "KBD": 0x00, "LCD": 0x01 };
var ASM_FLAG_INMEDIATO = 0x10;
var ASM_PAGE_SIZE = 32; // bytes por página virtual

/**
 * Convierte un entero 0..255 a hex de 2 dígitos (sin sufijo H).
 */
function asmAHex2(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, "0");
}

/**
 * Convierte un entero a dirección hex con sufijo H (2 o 3 dígitos).
 */
function asmAHexDir(n) {
  var w = n > 0xFF ? 3 : 2;
  return (n & 0x1FF).toString(16).toUpperCase().padStart(w, "0") + "H";
}

/**
 * Quita corchetes de un operando: "[30H]" -> "30H".
 */
function asmLimpiarCorchetes(op) {
  return String(op || "").replace(/[\[\]]/g, "").trim();
}

/**
 * Parsea un número: 80H, 0x80, 128, 1000B. Devuelve entero o NaN.
 */
function asmParseNumero(texto) {
  var t = String(texto || "").trim().toUpperCase();
  if (!t) return NaN;
  if (t.endsWith("H")) return parseInt(t.slice(0, -1), 16);
  if (t.startsWith("0X")) return parseInt(t.slice(2), 16);
  if (t.endsWith("B") && /^[01]+B$/.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
  return NaN;
}

/**
 * ¿Es nombre de registro AX..DX?
 */
function asmEsRegistro(nombre) {
  return ASM_REG_CODES.hasOwnProperty(String(nombre || "").toUpperCase());
}

/**
 * ¿Es puerto KBD/LCD?
 */
function asmEsPuerto(nombre) {
  return ASM_PORT_CODES.hasOwnProperty(String(nombre || "").toUpperCase());
}

/**
 * Separa una línea de fuente en {etiqueta, mnemonic, dest, src, cruda, vacia, comentario}.
 * Soporta "LABEL:" sola o "LABEL: MNEM op, op". Comentarios con ; o //.
 */
function asmParseLinea(lineaCruda) {
  var cruda = String(lineaCruda == null ? "" : lineaCruda);
  var sinComentario = cruda.split(";")[0].split("//")[0].trim();
  if (!sinComentario) {
    return { vacia: true, cruda: cruda, etiqueta: null, mnemonic: null, dest: "", src: "" };
  }

  var etiqueta = null;
  var resto = sinComentario;
  var mEtq = resto.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
  if (mEtq) {
    etiqueta = mEtq[1].toUpperCase();
    resto = (mEtq[2] || "").trim();
  }

  if (!resto) {
    return { vacia: false, cruda: cruda, etiqueta: etiqueta, mnemonic: null, dest: "", src: "" };
  }

  var partes = resto.split(/\s+/);
  var mnemonic = (partes[0] || "").toUpperCase();
  var ops = resto.substring(partes[0].length).trim();
  var dest = "";
  var src = "";
  if (ops.length > 0) {
    if (ops.indexOf(",") !== -1) {
      var opsParts = ops.split(",");
      dest = (opsParts[0] || "").trim();
      src = opsParts.slice(1).join(",").trim();
    } else {
      // Un solo operando (JMP addr, INC reg, ...)
      dest = ops.trim();
      src = "";
    }
  }

  return {
    vacia: false,
    cruda: cruda,
    etiqueta: etiqueta,
    mnemonic: mnemonic,
    dest: dest,
    src: src
  };
}

/**
 * Clasifica y describe un operando para el ensamblador.
 * tipo: "reg" | "port" | "imm" | "addr" | "label" | "none"
 */
function asmClasificarOperando(operando, forzarAddr) {
  if (!operando || !String(operando).trim()) {
    return { tipo: "none" };
  }
  var original = String(operando).trim();
  var limpio = asmLimpiarCorchetes(original).toUpperCase();
  var tieneCorchetes = original.indexOf("[") !== -1;

  if (asmEsRegistro(limpio) && !tieneCorchetes && !forzarAddr) {
    return { tipo: "reg", valor: ASM_REG_CODES[limpio], nombre: limpio };
  }
  if (asmEsPuerto(limpio)) {
    return { tipo: "port", valor: ASM_PORT_CODES[limpio], nombre: limpio };
  }

  var n = asmParseNumero(limpio);
  if (!isNaN(n)) {
    if (tieneCorchetes || forzarAddr) {
      return { tipo: "addr", valor: n & 0x1FF };
    }
    return { tipo: "imm", valor: n & 0xFF };
  }

  // Etiqueta simbólica
  if (/^[A-Z_][A-Z0-9_]*$/.test(limpio)) {
    return { tipo: "label", nombre: limpio, comoAddr: tieneCorchetes || !!forzarAddr };
  }

  return { tipo: "error", mensaje: "Operando inválido '" + original + "'" };
}

/**
 * Tamaño en bytes de un operando de dirección ya resuelto (1 si <=FFH, 2 si no).
 */
function asmTamanoAddr(valor) {
  return (valor > 0xFF) ? 2 : 1;
}

/**
 * Calcula el tamaño en bytes de una instrucción (mnemonic + operandos ya clasificados).
 * Los labels se resuelven con simbolos (mapa nombre→addr) o se asume 1 byte si aún no existen.
 */
function asmTamanoInstruccion(mnemonic, destInfo, srcInfo, simbolos) {
  if (!mnemonic) return 0;
  if (mnemonic === "ORG" || mnemonic === "EQU") return 0;
  if (mnemonic === "DB") {
    // DB acepta lista separada por espacios en dest+src reconstituido — se maneja aparte
    return -1; // señal: calcular fuera
  }
  if (mnemonic === "NOP" || mnemonic === "HLT") return 1;

  var op = ASM_OPCODES[mnemonic];
  if (op === undefined) return -2;

  function resuelve(info) {
    if (!info || info.tipo === "none") return null;
    if (info.tipo === "label") {
      if (simbolos && simbolos.hasOwnProperty(info.nombre)) {
        return { tipo: "addr", valor: simbolos[info.nombre] };
      }
      return { tipo: "addr", valor: 0 }; // provisional 1 byte
    }
    return info;
  }

  var d = resuelve(destInfo);
  var s = resuelve(srcInfo);
  var bytes = 1; // opcode

  function addOp(info, esAddr) {
    if (!info || info.tipo === "none") return;
    if (info.tipo === "reg" || info.tipo === "port" || info.tipo === "imm") {
      bytes += 1;
    } else if (info.tipo === "addr" || esAddr) {
      bytes += asmTamanoAddr(info.valor || 0);
    }
  }

  // Formatos especiales
  if (mnemonic === "INC" || mnemonic === "DEC") {
    addOp(d, false);
    return bytes;
  }
  if (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
      mnemonic === "JC" || mnemonic === "JS") {
    // destino = dirección / etiqueta
    if (d && d.tipo === "imm") d = { tipo: "addr", valor: d.valor };
    addOp(d || { tipo: "addr", valor: 0 }, true);
    return bytes;
  }
  if (mnemonic === "LD" || mnemonic === "LOAD") {
    addOp(d, false); // reg
    // src es dirección
    if (s && s.tipo === "imm") s = { tipo: "addr", valor: s.valor };
    if (s && s.tipo === "reg") s = { tipo: "addr", valor: 0 }; // raro
    addOp(s || { tipo: "addr", valor: 0 }, true);
    return bytes;
  }
  if (mnemonic === "ST" || mnemonic === "STORE") {
    // dest = addr, src = reg|imm
    if (d && d.tipo === "imm") d = { tipo: "addr", valor: d.valor };
    addOp(d || { tipo: "addr", valor: 0 }, true);
    addOp(s, false);
    return bytes;
  }
  if (mnemonic === "IN") {
    addOp(d, false); // reg
    addOp(s, false); // port
    return bytes;
  }
  if (mnemonic === "OUT") {
    addOp(d, false); // port (o addr-like)
    addOp(s, false); // reg
    return bytes;
  }

  // MOV/ADD/SUB/CMP/AND/OR: reg, reg|imm
  addOp(d, false);
  addOp(s, false);
  return bytes;
}

/**
 * Emite los bytes de un operando de dirección (big-endian si > FFH).
 */
function asmEmitirAddr(bytes, valor) {
  var v = valor & 0x1FF;
  if (v > 0xFF) bytes.push(v >> 8);
  bytes.push(v & 0xFF);
}

/**
 * Emite bytes de una instrucción con símbolos ya resueltos.
 * Devuelve array de enteros 0..255 o lanza Error.
 */
function asmEmitirInstruccion(mnemonic, destRaw, srcRaw, simbolos, numLinea) {
  var pref = "Línea " + numLinea + ": ";
  if (!mnemonic) return [];

  if (mnemonic === "ORG" || mnemonic === "EQU") return [];

  if (mnemonic === "DB") {
    var lista = [destRaw, srcRaw].filter(function (x) { return x && String(x).trim(); })
      .join(",").split(/[,\s]+/).filter(Boolean);
    // Re-parse: dest puede traer "01H 02H 03H" si no había comas en parse
    if ((!srcRaw || !String(srcRaw).trim()) && destRaw && destRaw.indexOf(",") === -1) {
      lista = String(destRaw).trim().split(/\s+/).filter(Boolean);
    } else {
      lista = String(destRaw || "").split(",").concat(String(srcRaw || "").split(","))
        .map(function (x) { return x.trim(); }).filter(Boolean);
    }
    var outDb = [];
    for (var i = 0; i < lista.length; i++) {
      var item = lista[i];
      var n = asmParseNumero(item);
      if (isNaN(n)) {
        // ¿carácter 'A'?
        var mCh = item.match(/^'(.)'$/);
        if (mCh) n = mCh[1].charCodeAt(0);
      }
      if (isNaN(n) || n < 0 || n > 0xFF) {
        throw new Error(pref + "DB: valor inválido '" + item + "'");
      }
      outDb.push(n & 0xFF);
    }
    if (outDb.length === 0) throw new Error(pref + "DB requiere al menos un byte");
    return outDb;
  }

  if (!(mnemonic in ASM_OPCODES) && mnemonic !== "LOAD" && mnemonic !== "STORE") {
    throw new Error(pref + "Mnemonic desconocido '" + mnemonic + "'");
  }

  // Forzar dirección en operandos según mnemonic
  var forzarDestAddr = (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
    mnemonic === "JC" || mnemonic === "JS" || mnemonic === "ST" || mnemonic === "STORE" ||
    mnemonic === "OUT");
  var forzarSrcAddr = (mnemonic === "LD" || mnemonic === "LOAD" || mnemonic === "IN");

  // OUT: dest es puerto; IN: src es puerto — no son addr numéricos libres
  if (mnemonic === "OUT") forzarDestAddr = false;
  if (mnemonic === "IN") forzarSrcAddr = false;

  var dInfo = asmClasificarOperando(destRaw, forzarDestAddr && !asmEsPuerto(asmLimpiarCorchetes(destRaw)));
  var sInfo = asmClasificarOperando(srcRaw, forzarSrcAddr && !asmEsPuerto(asmLimpiarCorchetes(srcRaw)));

  // LD/ST: números sin corchetes también son direcciones
  if ((mnemonic === "LD" || mnemonic === "LOAD") && sInfo.tipo === "imm") {
    sInfo = { tipo: "addr", valor: sInfo.valor };
  }
  if ((mnemonic === "ST" || mnemonic === "STORE") && dInfo.tipo === "imm") {
    dInfo = { tipo: "addr", valor: dInfo.valor };
  }
  if ((mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
       mnemonic === "JC" || mnemonic === "JS") && dInfo.tipo === "imm") {
    dInfo = { tipo: "addr", valor: dInfo.valor };
  }

  function resolver(info, rol) {
    if (!info || info.tipo === "none") return info;
    if (info.tipo === "error") throw new Error(pref + info.mensaje);
    if (info.tipo === "label") {
      if (!simbolos || !simbolos.hasOwnProperty(info.nombre)) {
        throw new Error(pref + "Etiqueta no definida '" + info.nombre + "'");
      }
      return { tipo: "addr", valor: simbolos[info.nombre] };
    }
    return info;
  }

  dInfo = resolver(dInfo, "dest");
  sInfo = resolver(sInfo, "src");

  var opcode = ASM_OPCODES[mnemonic];

  // +10H si el origen es inmediato (no aplica a LD)
  if (sInfo && sInfo.tipo === "imm" && mnemonic !== "LD" && mnemonic !== "LOAD") {
    opcode = (opcode + ASM_FLAG_INMEDIATO) & 0xFF;
  }

  // Validaciones por formato
  function need(cond, msg) { if (!cond) throw new Error(pref + msg); }

  if (mnemonic === "NOP" || mnemonic === "HLT") {
    need(!destRaw && !srcRaw, mnemonic + " no lleva operandos");
    return [opcode];
  }
  if (mnemonic === "INC" || mnemonic === "DEC") {
    need(dInfo && dInfo.tipo === "reg", mnemonic + " requiere un registro");
    need(!srcRaw, mnemonic + " no lleva segundo operando");
    return [opcode, dInfo.valor];
  }
  if (mnemonic === "JMP" || mnemonic === "JZ" || mnemonic === "JNZ" ||
      mnemonic === "JC" || mnemonic === "JS") {
    need(dInfo && dInfo.tipo === "addr", mnemonic + " requiere una dirección o etiqueta");
    var bJ = [opcode];
    asmEmitirAddr(bJ, dInfo.valor);
    return bJ;
  }
  if (mnemonic === "LD" || mnemonic === "LOAD") {
    need(dInfo && dInfo.tipo === "reg", "LD requiere registro destino");
    need(sInfo && sInfo.tipo === "addr", "LD requiere dirección fuente (ej. [80H] o etiqueta)");
    var bL = [opcode, dInfo.valor];
    asmEmitirAddr(bL, sInfo.valor);
    return bL;
  }
  if (mnemonic === "ST" || mnemonic === "STORE") {
    need(dInfo && dInfo.tipo === "addr", "ST requiere dirección destino");
    need(sInfo && (sInfo.tipo === "reg" || sInfo.tipo === "imm"), "ST requiere registro o inmediato");
    var bS = [opcode];
    // Si src es imm, opcode ya tiene +10H
    asmEmitirAddr(bS, dInfo.valor);
    bS.push(sInfo.valor & 0xFF);
    return bS;
  }
  if (mnemonic === "IN") {
    need(dInfo && dInfo.tipo === "reg", "IN requiere registro destino");
    need(sInfo && sInfo.tipo === "port", "IN requiere puerto [KBD]");
    return [opcode, dInfo.valor, sInfo.valor];
  }
  if (mnemonic === "OUT") {
    need(dInfo && dInfo.tipo === "port", "OUT requiere puerto [LCD]");
    need(sInfo && sInfo.tipo === "reg", "OUT requiere registro fuente");
    return [opcode, dInfo.valor, sInfo.valor];
  }

  // ALU / MOV / CMP
  need(dInfo && dInfo.tipo === "reg", mnemonic + " requiere registro destino");
  need(sInfo && (sInfo.tipo === "reg" || sInfo.tipo === "imm"),
    mnemonic + " requiere registro o inmediato fuente");
  return [opcode, dInfo.valor, sInfo.valor & 0xFF];
}

/**
 * Ensambla un programa completo (texto o array de líneas).
 * Retorna {
 *   ok, errors[], symbols{}, listing: [{address, bytes, hex, source, line}],
 *   bytes: Uint8-like array denso desde org mínimo, image: {addr→byte},
 *   entry, size, pages, instructionCount
 * }
 */
function ensamblar(fuente) {
  var lineas = Array.isArray(fuente)
    ? fuente
    : String(fuente).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  var errors = [];
  var parsed = [];

  for (var i = 0; i < lineas.length; i++) {
    var pl = asmParseLinea(lineas[i]);
    pl.numLinea = i + 1;
    parsed.push(pl);
  }

  // --- Pasada 1 (+ iteraciones si cambian tamaños de addr) ---
  var simbolos = {};
  var maxIter = 5;
  var locFinal = 0;

  function pasada1() {
    var loc = 0;
    var nuevos = {};
    for (var i = 0; i < parsed.length; i++) {
      var p = parsed[i];
      if (p.vacia) continue;

      if (p.etiqueta) {
        if (nuevos.hasOwnProperty(p.etiqueta) || simbolos.hasOwnProperty(p.etiqueta)) {
          // permitir redeclaración al mismo valor en re-pasadas
          if (nuevos.hasOwnProperty(p.etiqueta) && nuevos[p.etiqueta] !== loc) {
            errors.push("Línea " + p.numLinea + ": etiqueta duplicada '" + p.etiqueta + "'");
          }
        }
        nuevos[p.etiqueta] = loc;
      }

      if (!p.mnemonic) continue;

      if (p.mnemonic === "ORG") {
        var orgVal = asmParseNumero(asmLimpiarCorchetes(p.dest));
        if (isNaN(orgVal)) {
          errors.push("Línea " + p.numLinea + ": ORG requiere dirección");
        } else {
          loc = orgVal & 0x1FF;
        }
        continue;
      }
      if (p.mnemonic === "EQU") {
        // LABEL: EQU valor — la etiqueta ya tomó `loc`; corregimos
        var equVal = asmParseNumero(p.dest);
        if (p.etiqueta && !isNaN(equVal)) {
          nuevos[p.etiqueta] = equVal & 0x1FF;
        } else {
          errors.push("Línea " + p.numLinea + ": EQU inválido (usa ETIQUETA: EQU valor)");
        }
        continue;
      }

      // Clasificar para tamaño
      var forzarDA = (p.mnemonic === "JMP" || p.mnemonic === "JZ" || p.mnemonic === "JNZ" ||
        p.mnemonic === "JC" || p.mnemonic === "JS" || p.mnemonic === "ST" || p.mnemonic === "STORE");
      var forzarSA = (p.mnemonic === "LD" || p.mnemonic === "LOAD");
      if (p.mnemonic === "OUT") forzarDA = false;
      if (p.mnemonic === "IN") forzarSA = false;

      var dInfo = asmClasificarOperando(p.dest, forzarDA && !asmEsPuerto(asmLimpiarCorchetes(p.dest)));
      var sInfo = asmClasificarOperando(p.src, forzarSA && !asmEsPuerto(asmLimpiarCorchetes(p.src)));

      if (p.mnemonic === "DB") {
        var tmpSym = {};
        for (var k in simbolos) tmpSym[k] = simbolos[k];
        for (var k2 in nuevos) tmpSym[k2] = nuevos[k2];
        try {
          var dbBytes = asmEmitirInstruccion("DB", p.dest, p.src, tmpSym, p.numLinea);
          loc = (loc + dbBytes.length) & 0x1FF;
        } catch (eDb) {
          // tamaño provisional 1; el error se reporta en pasada 2
          loc = (loc + 1) & 0x1FF;
        }
        continue;
      }

      if (!(p.mnemonic in ASM_OPCODES) && p.mnemonic !== "LOAD" && p.mnemonic !== "STORE") {
        // se reporta en pasada 2
        continue;
      }

      var mergeSym = {};
      for (var ks in simbolos) mergeSym[ks] = simbolos[ks];
      for (var kn in nuevos) mergeSym[kn] = nuevos[kn];

      var tam = asmTamanoInstruccion(p.mnemonic, dInfo, sInfo, mergeSym);
      if (tam < 0) tam = 1;
      loc = (loc + tam) & 0x1FF;
    }
    return { simbolos: nuevos, loc: loc };
  }

  for (var iter = 0; iter < maxIter; iter++) {
    errors = errors.filter(function () { return false; }); // reset solo de duplicados? keep empty
    errors = [];
    var r1 = pasada1();
    var estable = true;
    for (var nom in r1.simbolos) {
      if (simbolos[nom] !== r1.simbolos[nom]) estable = false;
    }
    for (var nom2 in simbolos) {
      if (!r1.simbolos.hasOwnProperty(nom2)) estable = false;
    }
    simbolos = r1.simbolos;
    locFinal = r1.loc;
    if (estable && iter > 0) break;
  }

  // --- Pasada 2: emitir bytes + listing ---
  var listing = [];
  var image = {}; // addr -> byte
  var loc2 = 0;
  var instructionCount = 0;
  var entry = null;

  for (var j = 0; j < parsed.length; j++) {
    var p2 = parsed[j];
    if (p2.vacia) continue;

    if (p2.mnemonic === "ORG") {
      var ov = asmParseNumero(asmLimpiarCorchetes(p2.dest));
      if (!isNaN(ov)) loc2 = ov & 0x1FF;
      listing.push({
        address: loc2,
        bytes: [],
        hex: "",
        source: String(lineas[j]).trim(),
        line: p2.numLinea,
        directive: true
      });
      continue;
    }
    if (p2.mnemonic === "EQU") {
      listing.push({
        address: simbolos[p2.etiqueta] || 0,
        bytes: [],
        hex: "",
        source: String(lineas[j]).trim(),
        line: p2.numLinea,
        directive: true
      });
      continue;
    }

    if (!p2.mnemonic && p2.etiqueta) {
      listing.push({
        address: simbolos[p2.etiqueta] || loc2,
        bytes: [],
        hex: "",
        source: String(lineas[j]).trim(),
        line: p2.numLinea,
        directive: true
      });
      continue;
    }

    if (!p2.mnemonic) continue;

    try {
      var emitted = asmEmitirInstruccion(p2.mnemonic, p2.dest, p2.src, simbolos, p2.numLinea);
      if (entry === null && emitted.length > 0 && p2.mnemonic !== "DB") {
        entry = loc2;
      }
      if (emitted.length > 0 && p2.mnemonic !== "DB" && p2.mnemonic !== "ORG") {
        instructionCount++;
      }
      // DB también cuenta para bytes pero no como instrucción ejecutable estricta
      var hexParts = emitted.map(asmAHex2);
      for (var b = 0; b < emitted.length; b++) {
        image[loc2 + b] = emitted[b];
      }
      listing.push({
        address: loc2,
        bytes: emitted.slice(),
        hex: hexParts.join(" "),
        source: String(lineas[j]).trim(),
        line: p2.numLinea
      });
      loc2 = (loc2 + emitted.length) & 0x1FF;
    } catch (err) {
      errors.push(err.message || String(err));
      listing.push({
        address: loc2,
        bytes: [],
        hex: "????",
        source: String(lineas[j]).trim(),
        line: p2.numLinea,
        error: true
      });
    }
  }

  // Bytes densos desde 0 hasta max addr tocado
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
  // Páginas tocadas (no solo ceil): contar páginas con al menos un byte
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
    symbols: simbolos,
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
 * Formatea el listing como texto: Address | HEX bytes | Source
 */
function formatearListing(resultado) {
  var lineas = [];
  lineas.push("Address | HEX bytes      | Source");
  lineas.push("--------+----------------+---------------------------");
  var L = resultado.listing || [];
  for (var i = 0; i < L.length; i++) {
    var e = L[i];
    var addr = asmAHexDir(e.address).padEnd(7, " ");
    var hex = (e.hex || "").padEnd(14, " ");
    lineas.push(addr + " | " + hex + " | " + e.source);
  }
  if (resultado.errors && resultado.errors.length) {
    lineas.push("");
    lineas.push("ERRORES:");
    for (var j = 0; j < resultado.errors.length; j++) {
      lineas.push("  - " + resultado.errors[j]);
    }
  }
  return lineas.join("\n");
}

// --- Pegamento Google Sheets (no se ejecuta en Node) ---

/** Rango por defecto del editor de fuente (hoja Editor o Programas). */
var ASM_EDITOR_SHEET = "Editor";
var ASM_EDITOR_RANGE = "A1:A200";
var ASM_LISTING_SHEET = "Hoja 1";
// Reemplaza la pila I3:I13 (+ filas extra)
var ASM_LISTING_START_ROW = 3;
var ASM_LISTING_COL = 9; // I
var ASM_LISTING_MAX_ROWS = 40;

/**
 * Lee el fuente desde la hoja Editor (columna A) y escribe el listing
 * en Hoja 1 columna I (Address | HEX | Source), reemplazando el Instruction Stack.
 */
function ensamblarYMostrarListing() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaEd = ss.getSheetByName(ASM_EDITOR_SHEET) || ss.getSheetByName("Programas");
  if (!hojaEd) {
    SpreadsheetApp.getUi().alert("No se encontró la hoja Editor ni Programas.");
    return;
  }
  var valores = hojaEd.getRange(ASM_EDITOR_RANGE).getValues();
  var lineas = [];
  for (var i = 0; i < valores.length; i++) {
    lineas.push(valores[i][0] == null ? "" : String(valores[i][0]));
  }
  // recortar cola vacía
  while (lineas.length && !String(lineas[lineas.length - 1]).trim()) lineas.pop();

  var res = ensamblar(lineas);
  var hoja = ss.getSheetByName(ASM_LISTING_SHEET) || ss.getActiveSheet();
  hoja.getRange(ASM_LISTING_START_ROW, ASM_LISTING_COL, ASM_LISTING_MAX_ROWS, 1)
    .clearContent().setBackground(null);

  var filas = [];
  filas.push(["Address | HEX | Source"]);
  for (var k = 0; k < res.listing.length && k < ASM_LISTING_MAX_ROWS - 1; k++) {
    var e = res.listing[k];
    var texto = asmAHexDir(e.address) + ": " + (e.hex || "") + "  |  " + e.source;
    filas.push([texto]);
  }
  hoja.getRange(ASM_LISTING_START_ROW, ASM_LISTING_COL, filas.length, 1).setValues(filas);

  if (!res.ok) {
    SpreadsheetApp.getUi().alert("Ensamblado con errores:\n" + res.errors.join("\n"));
  } else {
    SpreadsheetApp.getUi().alert(
      "Ensamblado OK. " + res.instructionCount + " instrucciones, " +
      res.size + " bytes, " + res.pages + " página(s)."
    );
  }
  return res;
}

/**
 * Ensambla un texto libre (útil desde el editor o pruebas).
 */
function ensamblarTexto(texto) {
  return ensamblar(texto);
}
