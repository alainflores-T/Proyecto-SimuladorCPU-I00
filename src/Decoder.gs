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