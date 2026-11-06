// Decoder.gs - Decodificador flexible a prueba de espacios y comas
function decodificarInstruccion(codigoIR) {
  if (!codigoIR || codigoIR.toString().trim() === "" || codigoIR.toString().trim() === "00H") {
    return { op: "NOP", dest: "", src: "" };
  }
  
  var instruccion = codigoIR.toString().trim().toUpperCase();
  var partes = instruccion.split(/\s+/);
  var mnemonico = partes[0] || "NOP";
  
  // Extrae el resto de la instrucción (operandos)
  var resto = instruccion.substring(mnemonico.length).trim();
  var dest = "";
  var src  = "";
  
  if (resto.length > 0) {
    // Permite separar tanto si usas comas ("BX, AX") como si usas espacios ("BX AX")
    var operandos = (resto.indexOf(",") !== -1) ? resto.split(",") : resto.split(/\s+/);
    dest = (operandos[0] || "").trim();
    src  = (operandos[1] || "").trim();
  }
  
  return {
    op: mnemonico,
    dest: dest,
    src: src
  };
}
// --- Codificación a código máquina ---
const OPCODES = {
  "NOP": 0x00, "MOV": 0x01, "ADD": 0x02, "SUB": 0x03, "INC": 0x04,
  "DEC": 0x05, "CMP": 0x06, "LD": 0x07, "LOAD": 0x07, "ST": 0x08,
  "STORE": 0x08, "JMP": 0x09, "JZ": 0x0A, "JNZ": 0x0B, "JC": 0x0C,
  "JS": 0x0D, "AND": 0x0E, "OR": 0x0F, "IN": 0x20, "OUT": 0x21,
  "HLT": 0xFF
};
const PORT_CODES = { "KBD": 0x00, "LCD": 0x01 };
const REG_CODES = { "AX": 0x00, "BX": 0x01, "CX": 0x02, "DX": 0x03 };
const FLAG_INMEDIATO = 0x10; // se suma al opcode si el origen es un valor

function aHex2(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function codificarOperando(operando) {
  if (!operando) return null;
  var limpio = limpiarDireccion(operando);
  if (REG_CODES.hasOwnProperty(limpio))  return { valor: REG_CODES[limpio],  esInmediato: false };
  if (PORT_CODES.hasOwnProperty(limpio)) return { valor: PORT_CODES[limpio], esInmediato: false };

  var esDireccion = operando.indexOf("[") !== -1;
  var n;
  if (limpio.endsWith("H")) n = parseInt(limpio.slice(0, -1), 16);
  else if (limpio.endsWith("B")) n = parseInt(limpio.slice(0, -1), 2);
  else n = parseInt(limpio, 10);
  if (isNaN(n)) return null;
  return { valor: n, esInmediato: !esDireccion };
}

// Direcciones de 9 bits (000H-1FFH) ocupan 2 bytes
function agregarBytes(bytes, operando) {
  if (operando.valor > 0xFF) bytes.push(aHex2(operando.valor >> 8));
  bytes.push(aHex2(operando.valor));
}

function codificarInstruccion(codigoIR) {
  var inst = decodificarInstruccion(codigoIR);
  var opcode = OPCODES[inst.op];
  if (opcode === undefined) return "??";

  var d = codificarOperando(inst.dest);
  var s = codificarOperando(inst.src);
  // En LD el origen siempre es una dirección, nunca un inmediato
  if (s && s.esInmediato && inst.op !== "LD" && inst.op !== "LOAD") opcode += FLAG_INMEDIATO;

  var bytes = [aHex2(opcode)];
  if (d) agregarBytes(bytes, d);
  if (s) agregarBytes(bytes, s);
  return bytes.join(" ");
}