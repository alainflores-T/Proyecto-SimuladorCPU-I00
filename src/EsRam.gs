/**
 * RAM de E/S dedicada: 8 bytes de cola de teclado + 8 bytes de vídeo LCD.
 * No ocupa ningún marco de los 256 B paginables (O8:AD23 sigue siendo 8×32).
 * La decisión está en docs/decision-es-vm.md y en POLITICA_ES.
 * La hoja "Perifericos" solo se crea si no existe, o si ya es de este módulo.
 */
var ES_RAM_CLAVE = "ES_RAM_v1";
var ES_RAM_NOTA = "ES-RAM-v1";
var ES_RAM_HOJA = "Perifericos";
var ES_RAM_BYTES = 16;

function esRamVacia_() {
  var bytes = [];
  var i;
  for (i = 0; i < ES_RAM_BYTES; i++) bytes.push(0);
  return { version: 1, bytes: bytes };
}

function esRamCargar_() {
  var raw = null;
  try { raw = PropertiesService.getDocumentProperties().getProperty(ES_RAM_CLAVE); } catch (e) { raw = null; }
  if (!raw) return esRamVacia_();
  var obj;
  try { obj = JSON.parse(raw); } catch (e2) { obj = null; }
  if (!obj || !obj.bytes || obj.bytes.length !== ES_RAM_BYTES) return esRamVacia_();
  return obj;
}

function esRamGuardar_(estado) {
  PropertiesService.getDocumentProperties().setProperty(ES_RAM_CLAVE, JSON.stringify(estado));
}

function esRamLista() {
  try {
    return !!PropertiesService.getDocumentProperties().getProperty(ES_RAM_CLAVE);
  } catch (e) { return false; }
}

function esRamHoja_() {
  if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) return null;
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) return null;
  return libro.getSheetByName(ES_RAM_HOJA);
}

function esRamPintar_(estado) {
  var hoja = esRamHoja_();
  if (!hoja) return;
  var nota = "";
  try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (e) { nota = ""; }
  if (nota !== ES_RAM_NOTA) return;
  var teclado = [estado.bytes.slice(0, 8)];
  var lcd = [estado.bytes.slice(8, 16)];
  hoja.getRange(3, 1, 1, 8).setValues(teclado);
  hoja.getRange(5, 1, 1, 8).setValues(lcd);
}

function esRamInstalar() {
  var estado = esRamCargar_();
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(ES_RAM_HOJA);
  if (!hoja) {
    hoja = libro.insertSheet(ES_RAM_HOJA);
    hoja.getRange(1, 1).setValue("RAM de E/S dedicada (16 B)").setNote(ES_RAM_NOTA);
    hoja.getRange(2, 1).setValue("Teclado 8 B (no es un marco)");
    hoja.getRange(4, 1).setValue("LCD / vídeo 8 B (no es un marco)");
    hoja.getRange(6, 1).setValue("Los 8 marcos de 32 B de Hoja 1 no se recortan.");
  } else {
    var nota = "";
    try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (eNota) { nota = ""; }
    if (nota !== ES_RAM_NOTA) {
      var ocupada = String(hoja.getRange(1, 1).getValue() || "") !== "";
      if (ocupada) throw new Error("Perifericos existe y no es de este módulo. No se escribió nada.");
      hoja.getRange(1, 1).setValue("RAM de E/S dedicada (16 B)").setNote(ES_RAM_NOTA);
      hoja.getRange(2, 1).setValue("Teclado 8 B (no es un marco)");
      hoja.getRange(4, 1).setValue("LCD / vídeo 8 B (no es un marco)");
    }
  }
  esRamGuardar_(estado);
  esRamPintar_(estado);
  return estado;
}

function esRamLeerRegion(region) {
  if (!region || typeof region.start !== "number" || typeof region.bytes !== "number") {
    return { ok: false, reason: "Región de E/S inválida." };
  }
  if (region.start < 0 || region.bytes < 1 || region.start + region.bytes > ES_RAM_BYTES) {
    return { ok: false, reason: "La región de E/S no cabe en los 16 bytes dedicados." };
  }
  var estado = esRamCargar_();
  var out = [];
  var i;
  for (i = 0; i < region.bytes; i++) out.push(estado.bytes[region.start + i] & 255);
  return { ok: true, bytes: out };
}

function esRamEscribirRegion(region, bytes) {
  var leido = esRamLeerRegion(region);
  if (!leido.ok) return leido;
  if (!bytes || bytes.length !== region.bytes) return { ok: false, reason: "La E/S dedicada esperaba " + region.bytes + " bytes." };
  var estado = esRamCargar_();
  var i;
  for (i = 0; i < region.bytes; i++) {
    var n = bytes[i];
    if (typeof n !== "number" || n !== n || Math.floor(n) !== n || n < 0 || n > 255) {
      return { ok: false, reason: "Byte de E/S fuera de 0..255." };
    }
    estado.bytes[region.start + i] = n;
  }
  esRamGuardar_(estado);
  esRamPintar_(estado);
  return { ok: true };
}

function esRamLimpiar() {
  var estado = esRamVacia_();
  esRamGuardar_(estado);
  esRamPintar_(estado);
  return estado;
}
