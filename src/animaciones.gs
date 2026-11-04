// Animation.gs

function animarTrayectoBus(celdasArray, colorHex) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  
  for (var i = 0; i < celdasArray.length; i++) {
    var rango = sheet.getRange(celdasArray[i]);
    var colorOriginal = rango.getBackground();
    
    rango.setBackground(colorHex);
    SpreadsheetApp.flush();
    Utilities.sleep(100);
    
    rango.setBackground(colorOriginal); // Restaura el color base
  }


}