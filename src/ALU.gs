function ejecutarALU(sheet, op, val1, val2) {
  // Función interna inteligente para detectar la base numérica (Hex, Bin o Dec)
  function decodificarValor(val) {
    var str = String(val).trim();
    if (str === "") return 0;
    if (str.endsWith("H")) return parseInt(str.replace("H", ""), 16);
    if (str.endsWith("B")) return parseInt(str.replace("B", ""), 2);
    return parseInt(str, 10);
  }
  
  // Para INC y DEC, forzamos visualmente que el Operador 2 sea "1"
  if (op === "INC" || op === "DEC") {
    val2 = 1;
  }
  
  var v1 = decodificarValor(val1);
  var v2 = decodificarValor(val2);
  var resultado = 0;
  var simbolo = "";
  
  switch(op) {
    case "ADD": resultado = v1 + v2; simbolo = "+"; break;
    case "SUB": resultado = v1 - v2; simbolo = "-"; break;
    case "MOV": resultado = v2; simbolo = "<-"; break;
    case "INC": resultado = v1 + 1; simbolo = "+"; break;
    case "DEC": resultado = v1 - 1; simbolo = "-"; break;
    case "CMP": resultado = v1 - v2; simbolo = "CMP"; break;
  }
  
  // Imprimir operadores en la interfaz de la ALU
  sheet.getRange(ALU_OP1).setValue(val1);
  sheet.getRange(ALU_OP2).setValue(val2);
  
  // Se agrega la comilla simple ("'") antes del símbolo para forzar formato de texto en Google Sheets
  sheet.getRange(ALU_SYM).setValue("'" + simbolo);
  
  // Banderas (8 bits)
  var zeroFlag  = ((resultado & 0xFF) === 0) ? 1 : 0; 
  var carryFlag = (resultado > 255 || resultado < 0) ? 1 : 0;
  var signFlag  = ((resultado & 0x80) !== 0) ? 1 : 0;
  
  function actualizarBandera(rango, valor, nombre) {
    var celda = sheet.getRange(rango);
    var valorAnterior = celda.getValue();
    celda.setValue(valor);
    
    if (valor === 1 && valorAnterior !== 1) {
      registrarLog(sheet, "BANDERAS: ¡" + nombre + " activada!");
      celda.setBackground("#FFCDD2"); 
    } else if (valor === 0) {
      celda.setBackground(null); 
    }
  }

  actualizarBandera(FLAG_ZF, zeroFlag, "Zero Flag (ZF)");
  actualizarBandera(FLAG_CF, carryFlag, "Carry Flag (CF)");
  actualizarBandera(FLAG_SF, signFlag, "Sign Flag (SF)");
  
  // El resultado se calcula temporalmente en HEX para enviarlo a los registros
  var resultadoHex = (resultado & 0xFF).toString(16).toUpperCase().padStart(2, '0') + "H";
  
  // Imprimir resultado final en la ALU
  sheet.getRange(ALU_RES).setValue(resultadoHex);
  
  return resultadoHex;
}