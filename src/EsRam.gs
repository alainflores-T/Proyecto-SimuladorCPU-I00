/**
 * Ventana de E/S dentro de los 256 B.
 * Marco 7 = E0H-FFH. Teclado F0H-F7H. LCD F8H-FFH.
 * E0H-EFH es relleno del mismo marco: se ve en la matriz y no se pagina.
 * No hay un segundo banco. page-in y write-back no eligen este marco.
 */
var ES_RAM_NOTA = "ES-RAM-v1";
var ES_RAM_HOJA = "Perifericos";
var ES_RAM_FLAG = "ES_VENTANA_v1";

function marcoReservadoES_() {
  if (typeof POLITICA_ES === "undefined" || !POLITICA_ES) return null;
  return POLITICA_ES.marcoReservado;
}

function marcosElegiblesReemplazo_() {
  var pin = marcoReservadoES_();
  var lista = [];
  var i;
  for (i = 0; i < 8; i++) if (i !== pin) lista.push(i);
  return lista;
}

function esDireccionReservada_(addr) {
  if (typeof POLITICA_ES === "undefined" || !POLITICA_ES) return false;
  return addr >= POLITICA_ES.reservaInicio && addr < POLITICA_ES.reservaInicio + POLITICA_ES.reservaBytes;
}

function esRamLista() {
  try {
    return PropertiesService.getDocumentProperties().getProperty(ES_RAM_FLAG) === POLITICA_ES.nombre;
  } catch (e) { return false; }
}

function esRamByte_(valor) {
  if (valor === "" || valor == null) return 0;
  if (typeof valor === "number" && valor === valor && Math.floor(valor) === valor && valor >= 0 && valor <= 255) return valor;
  var texto = String(valor).trim();
  if (/^[0-9A-Fa-f]{1,2}H$/i.test(texto)) return parseInt(texto.slice(0, -1), 16);
  if (/^[0-9]{1,3}$/.test(texto)) {
    var n = parseInt(texto, 10);
    return n <= 255 ? n : null;
  }
  return null;
}

function esRamLeerRegion(region) {
  if (region && typeof region.inicio === "number" && typeof region.start !== "number") region = { start: region.inicio, bytes: region.bytes };
  if (!region || typeof region.start !== "number" || typeof region.bytes !== "number") {
    return { ok: false, reason: "Región de E/S inválida." };
  }
  if (!esDireccionReservada_(region.start) || !esDireccionReservada_(region.start + region.bytes - 1)) {
    return { ok: false, reason: "La E/S solo ocupa el marco 7 (E0H-FFH)." };
  }
  if (typeof readPhysical !== "function") return { ok: false, reason: "readPhysical no está disponible." };
  var out = [];
  var i;
  for (i = 0; i < region.bytes; i++) {
    var n = esRamByte_(readPhysical(region.start + i));
    if (n === null) return { ok: false, reason: "RAM " + (region.start + i) + " no es un byte de E/S." };
    out.push(n);
  }
  return { ok: true, bytes: out };
}

function esRamEscribirRegion(region, bytes) {
  var leido = esRamLeerRegion(region);
  if (!leido.ok) return leido;
  if (!bytes || bytes.length !== region.bytes) return { ok: false, reason: "Se esperaban " + region.bytes + " bytes en la ventana de E/S." };
  if (typeof writePhysical !== "function") return { ok: false, reason: "writePhysical no está disponible." };
  var i;
  for (i = 0; i < region.bytes; i++) {
    var n = bytes[i];
    if (typeof n !== "number" || n !== n || Math.floor(n) !== n || n < 0 || n > 255) {
      return { ok: false, reason: "Byte de E/S fuera de 0..255." };
    }
    writePhysical(region.start + i, n);
  }
  if (typeof invalidarCachePagina === "function") {
    try { invalidarCachePagina({ pfn: marcoReservadoES_() }); } catch (eInv) {}
  }
  esRamPintar_();
  return { ok: true };
}

function esRamPintar_() {
  if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) return;
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ES_RAM_HOJA);
  if (!hoja) return;
  var nota = "";
  try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (e) { nota = ""; }
  if (nota !== ES_RAM_NOTA) return;
  var teclado = esRamLeerRegion(POLITICA_ES.teclado);
  var lcd = esRamLeerRegion(POLITICA_ES.lcd);
  if (teclado.ok) hoja.getRange(3, 1, 1, 8).setValues([teclado.bytes]);
  if (lcd.ok) hoja.getRange(5, 1, 1, 8).setValues([lcd.bytes]);
  var chars = [];
  var i;
  if (lcd.ok) {
    for (i = 0; i < lcd.bytes.length; i++) {
      var n = lcd.bytes[i];
      chars.push(n >= 32 && n <= 126 ? String.fromCharCode(n) : (n === 0 ? "" : "."));
    }
    hoja.getRange(6, 1, 1, 8).setValues([chars]);
  }
}

function esRamInstalar() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(ES_RAM_HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(ES_RAM_HOJA);
  } else {
    var nota = "";
    try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (eNota) { nota = ""; }
    if (nota !== ES_RAM_NOTA && String(hoja.getRange(1, 1).getValue() || "") !== "") {
      throw new Error("Perifericos existe y no es de este módulo. No se escribió nada.");
    }
  }
  var titulo = hoja.getRange(1, 1);
  titulo.setValue("E/S dentro de los 256 B — marco 7");
  if (titulo.setNote) titulo.setNote(ES_RAM_NOTA);
  hoja.getRange(2, 1).setValue("Teclado F0H-F7H (8 B, readPhysical)");
  hoja.getRange(4, 1).setValue("LCD F8H-FFH (8 B de vídeo)");
  hoja.getRange(7, 1).setValue("E0H-EFH es relleno del marco 7. No es página ni un segundo banco. Marcos elegibles: 0-6.");
  PropertiesService.getDocumentProperties().setProperty(ES_RAM_FLAG, POLITICA_ES.nombre);
  esRamPintar_();
  return { ok: true, teclado: POLITICA_ES.teclado, lcd: POLITICA_ES.lcd };
}

function esRamLimpiar() {
  if (!esRamLista() || typeof writePhysical !== "function") return { ok: false, reason: "ventana" };
  var addr;
  for (addr = POLITICA_ES.teclado.inicio; addr < POLITICA_ES.lcd.inicio + POLITICA_ES.lcd.bytes; addr++) {
    writePhysical(addr, 0);
  }
  if (typeof invalidarCachePagina === "function") {
    try { invalidarCachePagina({ pfn: marcoReservadoES_() }); } catch (eInv) {}
  }
  esRamPintar_();
  return { ok: true };
}
