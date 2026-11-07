// CacheEstructura.gs
// Issue 27: tamaños y paneles. No hay hit, miss ni animación (issues 28 y 29).
// Dirección física de 8 bits. Línea de 8 bytes: offset = 3 bits.
// L1I y L1D: una línea cada una, sin índice. Tag = 5 bits (dirección >> 3).
// L2 unificada, correspondencia directa de 4 líneas.
//   índice = 2 bits, (dirección >> 3) & 3. Tag = 3 bits, dirección >> 5.
// Dirty queda vacío: la política de escritura es el issue 28.
// El estado vive en PropertiesService. La hoja Caches solo lo muestra.
// No se pinta Hoja 1: el hueco entre CPU y RAM ya es el panel de buses.

var CACHE_HOJA = "Caches";
var CACHE_NOTA = "CACHE-ESTRUCTURA-v1";
var CACHE_CLAVE = "CACHE_ESTRUCTURA_v1";

function libroCache_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error("Cache: no hay un libro activo. No se escribió nada.");
  return libro;
}

function lineaVacia_() {
  return { valid: false, tag: null, bytes: ["", "", "", "", "", "", "", ""], uso: null, dirty: null };
}

function estadoVacio_() {
  return { version: 1, reloj: 0, l1i: lineaVacia_(), l1d: lineaVacia_(), l2: [lineaVacia_(), lineaVacia_(), lineaVacia_(), lineaVacia_()] };
}

function estadoValido_(obj) {
  if (!obj || obj.version !== 1 || typeof obj.reloj !== "number") return false;
  function lineaOk(ln) {
    return ln && typeof ln.valid === "boolean" && ln.bytes && ln.bytes.length === 8 && ln.dirty === null;
  }
  if (!lineaOk(obj.l1i) || !lineaOk(obj.l1d) || !obj.l2 || obj.l2.length !== 4) return false;
  var i;
  for (i = 0; i < 4; i++) if (!lineaOk(obj.l2[i])) return false;
  return true;
}

function cargarCache_() {
  var raw = PropertiesService.getDocumentProperties().getProperty(CACHE_CLAVE);
  if (!raw) return null;
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { obj = null; }
  if (!estadoValido_(obj)) throw new Error("Cache: el estado guardado no es válido. No se escribió nada.");
  return obj;
}

function guardarCache_(estado) {
  PropertiesService.getDocumentProperties().setProperty(CACHE_CLAVE, JSON.stringify(estado));
}

function enteroDir_(n) {
  return typeof n === "number" && n === n && Math.floor(n) === n && n >= 0 && n <= 255;
}

function describirDireccionCache(direccion) {
  if (!enteroDir_(direccion)) throw new Error("Cache: la dirección física debe ser un entero 0..255.");
  var linea = direccion >> 3;
  return {
    direccion: direccion,
    offset: direccion & 7,
    l1: { indice: 0, tag: linea },
    l2: { indice: linea & 3, tag: linea >> 2 }
  };
}

function describirOrganizacionCache() {
  return {
    offsetBits: 3,
    lineaBytes: 8,
    l1iLineas: 1,
    l1dLineas: 1,
    l1TagBits: 5,
    l2Lineas: 4,
    l2IndexBits: 2,
    l2TagBits: 3,
    l2Organizacion: "directa-4",
    dirty: "pendiente-issue-28"
  };
}

function claveLinea_(nivel, indice) {
  if (nivel === "L1I") return { lado: "l1i", indice: 0 };
  if (nivel === "L1D") return { lado: "l1d", indice: 0 };
  if (nivel === "L2" && indice >= 0 && indice <= 3 && Math.floor(indice) === indice) return { lado: "l2", indice: indice };
  throw new Error("Cache: nivel desconocido. Use L1I, L1D o L2 con índice 0..3.");
}

function leerLinea_(estado, nivel, indice) {
  var c = claveLinea_(nivel, indice);
  return c.lado === "l2" ? estado.l2[c.indice] : estado[c.lado];
}

function anotarUsoCache(nivel, indice) {
  var estado = cargarCache_();
  if (!estado) throw new Error("Cache: ejecute instalarCaches antes de anotar uso.");
  var ln = leerLinea_(estado, nivel, indice);
  estado.reloj += 1;
  ln.uso = estado.reloj;
  guardarCache_(estado);
  var hoja = libroCache_().getSheetByName(CACHE_HOJA);
  if (hoja && String(hoja.getRange(1, 1).getNote() || "") === CACHE_NOTA) pintarCache_(hoja, estado);
  return ln.uso;
}

function resetCaches() {
  var previo = cargarCache_();
  var estado = estadoVacio_();
  if (previo && typeof previo.reloj === "number") estado.reloj = 0;
  guardarCache_(estado);
  var hoja = libroCache_().getSheetByName(CACHE_HOJA);
  if (hoja && String(hoja.getRange(1, 1).getNote() || "") === CACHE_NOTA) pintarCache_(hoja, estado);
  return estado;
}

function textoTag_(tag) { return tag === null || typeof tag === "undefined" ? "—" : tag; }

function filaLinea_(nivel, indice, ln) {
  var nombre = nivel === "L2" ? "L2." + indice : nivel;
  var fila = [nombre, ln.valid ? 1 : 0, textoTag_(ln.tag), "—"];
  var i;
  for (i = 0; i < 8; i++) fila.push(ln.bytes[i]);
  fila.push(ln.uso === null || typeof ln.uso === "undefined" ? "—" : ln.uso);
  return fila;
}

function matrizCache_(estado) {
  return [
    ["Cachés", "L1I 8 B", "L1D 8 B", "L2 32 B directa 4", "", "", "", "", "", "", "", "", ""],
    ["Línea", "V", "Tag", "Dirty", "B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "Uso"],
    filaLinea_("L1I", 0, estado.l1i),
    filaLinea_("L1D", 0, estado.l1d),
    filaLinea_("L2", 0, estado.l2[0]),
    filaLinea_("L2", 1, estado.l2[1]),
    filaLinea_("L2", 2, estado.l2[2]),
    filaLinea_("L2", 3, estado.l2[3])
  ];
}

function pintarCache_(hoja, estado) {
  var rango = hoja.getRange(1, 1, 8, 13);
  if (rango.setNumberFormat) rango.setNumberFormat("@");
  rango.setValues(matrizCache_(estado));
  var titulo = hoja.getRange(1, 1);
  if (titulo.setNote) titulo.setNote(CACHE_NOTA);
}

function zonaVaciaCache_(hoja) {
  var valores = hoja.getRange(1, 1, 8, 13).getValues();
  var formulas = hoja.getRange(1, 1, 8, 13).getFormulas();
  var r, c;
  for (r = 0; r < valores.length; r++) {
    for (c = 0; c < valores[r].length; c++) {
      if (String(valores[r][c] || "") !== "" || String(formulas[r][c] || "") !== "") return false;
    }
  }
  return true;
}

function instalarCaches() {
  var libro = libroCache_();
  var hoja = libro.getSheetByName(CACHE_HOJA);
  var estado = null;
  try { estado = cargarCache_(); } catch (e) { throw e; }
  if (!estado) estado = estadoVacio_();
  if (!hoja) {
    hoja = libro.insertSheet(CACHE_HOJA);
    guardarCache_(estado);
    pintarCache_(hoja, estado);
    return estado;
  }
  var nota = "";
  try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (eNota) { nota = ""; }
  if (nota !== CACHE_NOTA) {
    if (!zonaVaciaCache_(hoja)) throw new Error("Cache: la hoja Caches existe y no es de este módulo. No se escribió nada.");
  }
  guardarCache_(estado);
  pintarCache_(hoja, estado);
  return estado;
}

function rectanguloSolapa_(fila, col, alto, ancho, rf, cf, ra, ca) {
  return fila < rf + ra && fila + alto > rf && col < cf + ca && col + ancho > cf;
}

function solapaReservado_(fila, col) {
  var alto = 8;
  var ancho = 13;
  var reservas = [
    [2, 2, 1, 1],
    [16, 3, 8, 1],
    [17, 5, 1, 1],
    [3, 9, 16, 1],
    [31, 2, 1, 1],
    [31, 6, 1, 1],
    [34, 8, 1, 1],
    [45, 4, 1, 1],
    [39, 7, 1, 3],
    [15, 10, 12, 2],
    [28, 10, 13, 4],
    [42, 10, 14, 4]
  ];
  if (typeof RAM_START_ROW !== "undefined" && typeof RAM_START_COL !== "undefined") {
    reservas.push([RAM_START_ROW, RAM_START_COL, 16, 16]);
    reservas.push([RAM_START_ROW - 1, RAM_START_COL + 17, 17, 3]);
  }
  var i;
  for (i = 0; i < reservas.length; i++) {
    if (rectanguloSolapa_(fila, col, alto, ancho, reservas[i][0], reservas[i][1], reservas[i][2], reservas[i][3])) return true;
  }
  return false;
}

function anclarCachesEnHoja1(fila, col) {
  if (typeof fila !== "number" || typeof col !== "number" || fila < 1 || col < 1) {
    throw new Error("Cache: ancla inválida. No se escribió Hoja 1.");
  }
  if (solapaReservado_(fila, col)) throw new Error("Cache: ese rectángulo solapa CPU, buses o RAM. No se escribió Hoja 1.");
  var hoja = libroCache_().getSheetByName(typeof SHEET_NAME !== "undefined" ? SHEET_NAME : "Hoja 1");
  if (!hoja) throw new Error("Cache: no existe Hoja 1. No se escribió nada.");
  var valores = hoja.getRange(fila, col, 8, 13).getValues();
  var formulas = hoja.getRange(fila, col, 8, 13).getFormulas();
  var r, c;
  for (r = 0; r < valores.length; r++) {
    for (c = 0; c < valores[r].length; c++) {
      if (String(valores[r][c] || "") !== "" || String(formulas[r][c] || "") !== "") {
        throw new Error("Cache: el rectángulo de Hoja 1 no está vacío. No se escribió nada.");
      }
    }
  }
  var estado = cargarCache_();
  if (!estado) throw new Error("Cache: ejecute instalarCaches antes de anclar. No se escribió Hoja 1.");
  var rango = hoja.getRange(fila, col, 8, 13);
  if (rango.setNumberFormat) rango.setNumberFormat("@");
  rango.setValues(matrizCache_(estado));
  return { fila: fila, col: col };
}

function instalarYProbarIssue27() {
  if (typeof SpreadsheetApp === "undefined" || typeof PropertiesService === "undefined") {
    throw new Error("Cache: faltan servicios de hoja. No se escribió nada.");
  }
  if (typeof SHEET_NAME === "undefined" || typeof RAM_START_ROW === "undefined") {
    throw new Error("Cache: falta Config.gs. No se escribió nada.");
  }
  var libro = libroCache_();
  var hoja1 = libro.getSheetByName(SHEET_NAME);
  if (!hoja1) throw new Error("Cache: no existe Hoja 1. No se escribió nada.");
  var esquina = hoja1.getRange(RAM_START_ROW, RAM_START_COL);
  var ramAntes = esquina.getValue();
  var formulaAntes = esquina.getFormula ? esquina.getFormula() : "";
  var ok = 0;
  var mal = 0;
  function registrar(bien, mensaje) {
    if (bien) { ok++; Logger.log("OK  " + mensaje); }
    else { mal++; Logger.log("FALLO  " + mensaje); }
  }
  var props = PropertiesService.getDocumentProperties();
  var crudo = props.getProperty(CACHE_CLAVE);
  var previa = libro.getSheetByName(CACHE_HOJA);
  if (previa) {
    var notaPrevia = "";
    try { notaPrevia = String(previa.getRange(1, 1).getNote() || ""); } catch (eN) { notaPrevia = ""; }
    if (notaPrevia !== CACHE_NOTA && !zonaVaciaCache_(previa)) {
      throw new Error("Cache: la hoja Caches existe y no es de este módulo. No se escribió nada.");
    }
  }
  Logger.log("Cache: estructuras L1I, L1D y L2. No se recorre la CPU.");
  try {
    var org = describirOrganizacionCache();
    registrar(org.l1iLineas === 1 && org.l1dLineas === 1 && org.l2Lineas === 4 && org.lineaBytes === 8 && org.l1TagBits === 5 && org.l2IndexBits === 2 && org.l2TagBits === 3, "tamaños L1I 8 B, L1D 8 B, L2 32 B y campos de dirección");
    var d0 = describirDireccionCache(0);
    var d7 = describirDireccionCache(7);
    var d8 = describirDireccionCache(8);
    var d32 = describirDireccionCache(32);
    var d255 = describirDireccionCache(255);
    var d20 = describirDireccionCache(20);
    registrar(d0.offset === 0 && d7.offset === 7 && d0.l1.tag === d7.l1.tag && d8.l1.tag === 1, "el offset 0..7 comparte línea y el 8 abre la siguiente");
    registrar(d32.l2.indice === 0 && d32.l2.tag === 1 && d255.l2.indice === 3 && d255.l2.tag === 7 && d20.offset === 4 && d20.l2.indice === 2 && d20.l1.tag === 2, "L2 directa: índice 2 bits y tag 3; L1 tag 5");
    var rechazo = false;
    try { describirDireccionCache(256); } catch (eDir) { rechazo = String(eDir.message).indexOf("Cache:") === 0; }
    try { describirDireccionCache("20"); } catch (eTxt) { if (String(eTxt.message).indexOf("Cache:") !== 0) rechazo = false; }
    registrar(rechazo, "256 y el texto 20 no son dirección física");
    var ancla = false;
    try { anclarCachesEnHoja1(RAM_START_ROW, RAM_START_COL); } catch (eAncla) { ancla = String(eAncla.message).indexOf("solapa") !== -1; }
    registrar(ancla && esquina.getValue() === ramAntes && (esquina.getFormula ? esquina.getFormula() : "") === formulaAntes, "anclar sobre la RAM se rechaza y no la escribe");
    instalarCaches();
    var estado = cargarCache_();
    estado.l1i.valid = true;
    estado.l1i.tag = 3;
    estado.l1i.bytes[0] = "LD AX, 20H";
    guardarCache_(estado);
    instalarCaches();
    var otra = cargarCache_();
    registrar(otra.l1i.valid === true && otra.l1i.tag === 3 && otra.l1i.bytes[0] === "LD AX, 20H" && otra.l1i.dirty === null, "repetir la instalación conserva la línea y no inventa Dirty");
    anotarUsoCache("L1I", 0);
    var hoja = libro.getSheetByName(CACHE_HOJA);
    var vista = hoja.getRange(1, 1, 8, 13).getValues();
    var guardado = cargarCache_();
    registrar(guardado.l1i.uso === 1 && String(vista[2][1]) === "1" && String(vista[2][2]) === "3" && String(vista[2][3]) === "—" && String(vista[2][12]) === "1" && String(vista[5][0]) === "L2.1", "la hoja muestra V, tag, Dirty vacío, el byte y el uso");
    resetCaches();
    var limpio = cargarCache_();
    registrar(limpio.l1i.valid === false && limpio.l1i.tag === null && limpio.l1i.uso === null && limpio.l2[3].valid === false && esquina.getValue() === ramAntes, "el reset invalida las líneas y no toca la RAM");
  } catch (e) {
    registrar(false, "excepción: " + (e && e.message ? e.message : e));
  } finally {
    if (crudo) props.setProperty(CACHE_CLAVE, crudo);
    else guardarCache_(estadoVacio_());
    var hojaFin = libro.getSheetByName(CACHE_HOJA);
    if (hojaFin && String(hojaFin.getRange(1, 1).getNote() || "") === CACHE_NOTA) {
      try { pintarCache_(hojaFin, cargarCache_()); } catch (eP) {}
    }
  }
  var igual = esquina.getValue() === ramAntes && (esquina.getFormula ? esquina.getFormula() : "") === formulaAntes;
  registrar(igual, "la esquina de la RAM y su fórmula quedaron igual");
  Logger.log("RESUMEN instalarYProbarIssue27: " + ok + " OK, " + mal + " fallos.");
  if (mal > 0) throw new Error("instalarYProbarIssue27: " + mal + " fallos.");
  Logger.log("Paneles en la hoja Caches. Hoja 1 no se usa como panel: el hueco visual ya es de los buses.");
}
