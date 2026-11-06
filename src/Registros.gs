// Registros.gs - Acceso genérico a AX, BX, CX y DX
function esRegistro(nombre) {
  return REGISTROS_GENERALES.hasOwnProperty(nombre);
}

function leerRegistro(sheet, nombre) {
  return sheet.getRange(REGISTROS_GENERALES[nombre]).getValue();
}

function escribirRegistro(sheet, nombre, valor) {
  var celda = REGISTROS_GENERALES[nombre];
  sheet.getRange(celda).setValue(valor);
  resaltarCelda(sheet, celda, "#C8E6C9");
}

// Si el operando es un registro devuelve su valor; si no, es un inmediato (ej. "05H")
function obtenerOperando(sheet, operando) {
  return esRegistro(operando) ? leerRegistro(sheet, operando) : operando;
}

// Quita los corchetes de una dirección: "[30H]" -> "30H"
function limpiarDireccion(operando) {
  return String(operando).replace(/[\[\]]/g, "").trim();
}