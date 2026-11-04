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
  "JS": 0x0D, "HLT": 0xFF
};
const REG_CODES = { "AX": 0x00, "BX": 0x01, "CX": 0x02, "DX": 0x03 };
const FLAG_INMEDIATO = 0x10; // se suma al opcode si el origen es un valor

function aHex2(n) {
  return (n & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

// Devuelve {valor, esInmediato} o null si no hay operando
function codificarOperando(operando) {
  if (!operando) return null;
  if (REG_CODES.hasOwnProperty(operando)) {
    return { valor: REG_CODES[operando], esInmediato: false };
  }
  var n;
  if (operando.endsWith("H")) n = parseInt(operando.slice(0, -1), 16);
  else if (operando.endsWith("B")) n = parseInt(operando.slice(0, -1), 2);
  else n = parseInt(operando, 10);
  if (isNaN(n)) return null;
  return { valor: n, esInmediato: true };
}

function codificarInstruccion(codigoIR) {
  var inst = decodificarInstruccion(codigoIR);
  var opcode = OPCODES[inst.op];
  if (opcode === undefined) return "??";

  var d = codificarOperando(inst.dest);
  var s = codificarOperando(inst.src);
  if (s && s.esInmediato) opcode += FLAG_INMEDIATO;

  var bytes = [aHex2(opcode)];
  if (d) bytes.push(aHex2(d.valor));
  if (s) bytes.push(aHex2(s.valor));
  return bytes.join(" ");
}