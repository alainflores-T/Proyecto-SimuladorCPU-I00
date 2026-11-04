function cargarDesdeHojaProgramas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojaPrincipal = ss.getSheetByName(SHEET_NAME); // "Hoja 1"
  var hojaProgramas = ss.getSheetByName("Programas"); // Tu pestaña
  
  resetCPU(); // Limpia la RAM y registros primero
  
  // Limpiar el área visual de la pila de instrucciones antes de cargar
  hojaPrincipal.getRange(STACK_START_ROW, STACK_COL, 16, 1).setValue("").setBackground(null);
  
  // Lee las primeras 16 filas de la columna A en la hoja "Programas"
  var datos = hojaProgramas.getRange("A2:A18").getValues();
  
  for (var i = 0; i < datos.length; i++) {
    var instruccion = datos[i][0];
    if (instruccion && instruccion.toString().trim() !== "") {
      var direccionHex = i.toString(16).toUpperCase().padStart(2, '0') + "H";
      
      // 1. Cargar en matriz RAM
      var celdaRAM = obtenerCeldaRAM(direccionHex);
      if (celdaRAM) celdaRAM.setValue(instruccion);
      
      // 2. Cargar en la Pila de Instrucciones visual (Columna I)
      var textoPila = direccionHex + ": " + instruccion;
      hojaPrincipal.getRange(STACK_START_ROW + i, STACK_COL).setValue(textoPila);
    }
  }
  registrarLog(hojaPrincipal, "Programa cargado en RAM y Pila de Instrucciones.");
}