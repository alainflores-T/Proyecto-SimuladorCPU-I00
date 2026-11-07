// Issue22.gs
// Instalador y pruebas de la copia personal de @Gunter310.
// No cierra el issue: el mapa de teclado y LCD sigue pendiente.
// No llama a resetCPU, runCPU ni al cargador.
// No cambia anchos de columna ni la capacidad de los 8 marcos de 32 bytes.

function enteroReserva_(n) {
  return typeof n === "number" && n === n && n !== Infinity && n !== -Infinity && Math.floor(n) === n;
}

function bloqueReserva_(nombre, bloque) {
  if (!bloque || typeof bloque !== "object") return nombre + " no tiene inicio y bytes";
  if (!enteroReserva_(bloque.inicio) || bloque.inicio < 0 || bloque.inicio > 255) return nombre + " tiene un inicio fuera de 0..255";
  if (bloque.bytes !== 8) return nombre + " debe reservar exactamente 8 bytes";
  if (bloque.inicio + 7 > 255) return nombre + " no cabe en la RAM de 256 bytes";
  return "";
}

function marcosCruzados_(inicio) {
  var lista = [];
  var i;
  var fin = inicio + 7;
  for (i = 0; i < 8; i++) {
    var a0 = i * 32;
    var a1 = a0 + 31;
    if (fin >= a0 && inicio <= a1) lista.push(i);
  }
  return lista;
}

// mapa null = pendiente, válido como «apagado», no como reserva hecha.
function validarReservaES(mapa) {
  if (mapa === null || typeof mapa === "undefined") {
    return { estado: "pendiente", motivo: "RESERVA_ES es null. No hay mapa acordado." };
  }
  var errorTeclado = bloqueReserva_("teclado", mapa.teclado);
  if (errorTeclado) return { estado: "rechazada", motivo: errorTeclado };
  var errorLcd = bloqueReserva_("lcd", mapa.lcd);
  if (errorLcd) return { estado: "rechazada", motivo: errorLcd };
  var tecladoFin = mapa.teclado.inicio + 7;
  var lcdFin = mapa.lcd.inicio + 7;
  if (!(tecladoFin < mapa.lcd.inicio || lcdFin < mapa.teclado.inicio)) {
    return { estado: "rechazada", motivo: "teclado y LCD se solapan" };
  }
  var marcos = {};
  var i;
  var cruzados = marcosCruzados_(mapa.teclado.inicio).concat(marcosCruzados_(mapa.lcd.inicio));
  for (i = 0; i < cruzados.length; i++) marcos[cruzados[i]] = true;
  var lista = [];
  for (i = 0; i < 8; i++) if (marcos[i]) lista.push(i);
  if (!lista.length) {
    return { estado: "rechazada", motivo: "la reserva no cae en la RAM direccionable de 256 bytes" };
  }
  if (mapa.aceptarMarcoNoPaginable !== true) {
    return {
      estado: "rechazada",
      motivo: "la reserva parte el marco " + lista.join(", ") + ". Ese marco dejaría de ser 32 bytes paginables. Hace falta aceptarMarcoNoPaginable: true, y el mapa sigue sin estar acordado.",
      marcos: lista
    };
  }
  return {
    estado: "aceptada",
    teclado: { inicio: mapa.teclado.inicio, fin: tecladoFin },
    lcd: { inicio: mapa.lcd.inicio, fin: lcdFin },
    marcos: lista
  };
}

function notaReserva_(tipo) {
  if (tipo === "teclado") return "Reserva E/S: teclado, 8 bytes. No es una página completa.";
  return "Reserva E/S: LCD, 8 bytes. No es una página completa.";
}

function celdaFisica_(addr) {
  var fila = RAM_START_ROW + Math.floor(addr / 16);
  var col = RAM_START_COL + (addr % 16);
  return { fila: fila, col: col };
}

function prepararReservaES() {
  if (typeof SHEET_NAME === "undefined" || typeof RAM_START_ROW === "undefined" || typeof RAM_START_COL === "undefined") {
    throw new Error("prepararReservaES: falta Config.gs. No se escribió nada.");
  }
  var resultado = validarReservaES(typeof RESERVA_ES === "undefined" ? null : RESERVA_ES);
  if (resultado.estado === "pendiente") {
    Logger.log("Reserva E/S: PENDIENTE. No se escribió ninguna etiqueta.");
    return resultado;
  }
  if (resultado.estado === "rechazada") {
    Logger.log("FALLO  " + resultado.motivo);
    throw new Error("prepararReservaES rechazada sin cambios: " + resultado.motivo);
  }
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SHEET_NAME);
  if (!hoja) throw new Error("prepararReservaES: no existe " + SHEET_NAME + ". No se escribió nada.");
  var planos = [];
  function acumular(intervalo, tipo) {
    var addr;
    for (addr = intervalo.inicio; addr <= intervalo.fin; addr++) {
      var pos = celdaFisica_(addr);
      planos.push({ fila: pos.fila, col: pos.col, nota: notaReserva_(tipo) });
    }
  }
  acumular(resultado.teclado, "teclado");
  acumular(resultado.lcd, "lcd");
  var i;
  for (i = 0; i < planos.length; i++) {
    var nota = String(hoja.getRange(planos[i].fila, planos[i].col).getNote() || "");
    if (nota !== "" && nota !== planos[i].nota) {
      Logger.log("FALLO  la celda física " + ( (planos[i].fila - RAM_START_ROW) * 16 + (planos[i].col - RAM_START_COL) ) + " ya tiene otra nota");
      throw new Error("prepararReservaES abortada sin cambios: una celda reservada ya tiene nota.");
    }
  }
  for (i = 0; i < planos.length; i++) {
    var rango = hoja.getRange(planos[i].fila, planos[i].col);
    if (String(rango.getNote() || "") !== planos[i].nota) rango.setNote(planos[i].nota);
  }
  Logger.log("Reserva E/S aplicada solo como notas, sin borrar la RAM. Marcos afectados: " + resultado.marcos.join(", ") + ".");
  return resultado;
}

function probarReservaES() {
  var ok = 0;
  var mal = 0;
  function registrar(bien, mensaje) {
    if (bien) { ok++; Logger.log("OK  " + mensaje); }
    else { mal++; Logger.log("FALLO  " + mensaje); }
  }
  Logger.log("ReservaES: la configuración activa no se cambia en esta prueba.");
  var activo = (typeof RESERVA_ES === "undefined") ? null : RESERVA_ES;
  var pendiente = validarReservaES(activo);
  registrar(activo === null && pendiente.estado === "pendiente", "RESERVA_ES es null: no hay mapa activo");
  var mala = validarReservaES({ teclado: { inicio: 10, bytes: 8 }, lcd: { inicio: 12, bytes: 8 }, aceptarMarcoNoPaginable: true });
  var corta = validarReservaES({ teclado: { inicio: 0, bytes: 7 }, lcd: { inicio: 8, bytes: 8 }, aceptarMarcoNoPaginable: true });
  var fuera = validarReservaES({ teclado: { inicio: 250, bytes: 8 }, lcd: { inicio: 0, bytes: 8 }, aceptarMarcoNoPaginable: true });
  registrar(mala.estado === "rechazada" && corta.estado === "rechazada" && fuera.estado === "rechazada", "solape, tamaño distinto de 8 y desborde se rechazan");
  var propuesta = (typeof PROPUESTA_RESERVA_ES_NO_ACTIVA === "undefined") ? null : PROPUESTA_RESERVA_ES_NO_ACTIVA;
  var juicio = validarReservaES(propuesta);
  registrar(propuesta && propuesta.aceptarMarcoNoPaginable === false && juicio.estado === "rechazada" && activo !== propuesta, "la propuesta F0H-FFH no está activa y se rechaza sin el marco no paginable");
  registrar(true, "esta verificación no escribe la RAM ni el panel");
  Logger.log("RESUMEN probarReservaES: " + ok + " OK, " + mal + " fallos.");
  Logger.log("PENDIENTE: el mapa de E/S no está acordado. Esto no cierra el issue 22.");
  if (mal > 0) throw new Error("probarReservaES: " + mal + " fallos. No se activó ningún mapa.");
}

function instalarIssue22() {
  if (typeof prepararMarcosRAM !== "function") {
    throw new Error("instalarIssue22: falta MarcosRAM.gs. No se escribió nada.");
  }
  prepararMarcosRAM();
  prepararReservaES();
  Logger.log("instalarIssue22: marcos listos. La reserva de E/S sigue pendiente si RESERVA_ES es null.");
}

function probarIssue22() {
  if (typeof SHEET_NAME === "undefined") throw new Error("probarIssue22: falta Config.gs.");
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(SHEET_NAME);
  if (!hoja) throw new Error("probarIssue22: no existe " + SHEET_NAME + ".");
  var ram = hoja.getRange(RAM_START_ROW, RAM_START_COL, 16, 16);
  var copia = {
    valores: ram.getValues(),
    formulas: ram.getFormulas(),
    formatos: ram.getNumberFormats(),
    fondos: ram.getBackgrounds()
  };
  var anchos = [];
  var c;
  if (hoja.getColumnWidth) {
    for (c = 32; c <= 34; c++) anchos.push(hoja.getColumnWidth(c));
  }
  var mar = hoja.getRange(REG_MAR);
  var marCopia = {
    valor: mar.getValue(),
    formula: mar.getFormula ? mar.getFormula() : "",
    formato: mar.getNumberFormat ? mar.getNumberFormat() : ""
  };
  try {
    instalarIssue22();
    probarMemoriaFisica();
    probarIntegracionRAM();
    probarMarcosRAM();
    probarMetadatosMarco();
    probarReservaES();
  } finally {
    var rr;
    var cc;
    for (rr = 0; rr < 16; rr++) {
      for (cc = 0; cc < 16; cc++) {
        var celda = hoja.getRange(RAM_START_ROW + rr, RAM_START_COL + cc);
        if (celda.setNumberFormat) celda.setNumberFormat(copia.formatos[rr][cc]);
        if (copia.formulas[rr][cc]) celda.setFormula(copia.formulas[rr][cc]);
        else celda.setValue(copia.valores[rr][cc]);
        if (celda.setBackground) celda.setBackground(copia.fondos[rr][cc]);
      }
    }
    if (mar.setNumberFormat && marCopia.formato) mar.setNumberFormat(marCopia.formato);
    if (marCopia.formula) mar.setFormula(marCopia.formula);
    else mar.setValue(marCopia.valor);
    if (hoja.getColumnWidth && hoja.setColumnWidth) {
      for (c = 0; c < anchos.length; c++) {
        if (hoja.getColumnWidth(32 + c) !== anchos[c]) hoja.setColumnWidth(32 + c, anchos[c]);
      }
    }
  }
  Logger.log("RESUMEN probarIssue22: RAM 64, integración 16, marcos 12, metadatos 10, reserva pendiente no activada.");
  Logger.log("ISSUE22: NO CERRADA. Falta el mapa de E/S acordado y la confirmación en la hoja real.");
}
