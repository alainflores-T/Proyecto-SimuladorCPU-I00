// CacheVisual.gs
// Issue 29: color y contadores del acceso. No cambia la política del 28.
// L2 solo cuenta cuando L1 falla. Un rango no cacheable no cuenta.
// Un acceso que lanza no cuenta. Step y Run usan el mismo leerCacheCPU.
// La animación con espera está apagada (0 ms). activarAnimacionCache(40) la enciende, tope 40 ms y 8 bytes.

var CACHE_CONTADORES_CLAVE = "CACHE_CONTADORES_v1";
var CACHE_ANIM_CLAVE = "CACHE_ANIM_MS_v1";

function contadorVacio_() { return { h: 0, m: 0 }; }

function contadoresNuevos_(sesion) {
  return { version: 1, sesion: sesion, l1i: contadorVacio_(), l1d: contadorVacio_(), l2: contadorVacio_(), eventos: [] };
}

function cargarContadores_() {
  var raw = null;
  try { raw = PropertiesService.getDocumentProperties().getProperty(CACHE_CONTADORES_CLAVE); } catch (e) { return contadoresNuevos_(1); }
  if (!raw) return contadoresNuevos_(1);
  var obj = JSON.parse(raw);
  if (!obj || !obj.l1i || !obj.l1d || !obj.l2 || typeof obj.sesion !== "number") {
    throw new Error("Cache: los contadores guardados no son válidos.");
  }
  return obj;
}

function caja_(estado, nivel) {
  if (nivel === "L1I") return estado.l1i;
  if (nivel === "L1D") return estado.l1d;
  if (nivel === "L2") return estado.l2;
  throw new Error("Cache: nivel de contador desconocido.");
}

function tasaCache_(caja) {
  var accesos = caja.h + caja.m;
  if (!accesos) return 0;
  return Math.round((1000 * caja.h) / accesos) / 10;
}

function leerContadoresCache() {
  var estado = cargarContadores_();
  function fila(nombre, caja) {
    return { nivel: nombre, hits: caja.h, misses: caja.m, accesos: caja.h + caja.m, tasa: tasaCache_(caja) };
  }
  return { sesion: estado.sesion, eventos: estado.eventos.slice(), l1i: fila("L1I", estado.l1i), l1d: fila("L1D", estado.l1d), l2: fila("L2", estado.l2) };
}

function msAnimacion_() {
  var raw = null;
  try { raw = PropertiesService.getDocumentProperties().getProperty(CACHE_ANIM_CLAVE); } catch (e) { return 0; }
  var n = parseInt(raw, 10);
  if (n !== n || n <= 0) return 0;
  return n > 40 ? 40 : n;
}

function activarAnimacionCache(ms) {
  var valor = 0;
  if (ms === true) valor = 40;
  else if (typeof ms === "number" && ms > 0) valor = ms > 40 ? 40 : Math.floor(ms);
  if (valor === 0 && PropertiesService.getDocumentProperties().deleteProperty) {
    PropertiesService.getDocumentProperties().deleteProperty(CACHE_ANIM_CLAVE);
  } else {
    PropertiesService.getDocumentProperties().setProperty(CACHE_ANIM_CLAVE, String(valor));
  }
  return valor;
}

function hojaCaches_() {
  if (typeof SpreadsheetApp === "undefined") return null;
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) return null;
  var hoja = libro.getSheetByName("Caches");
  if (!hoja) return null;
  var nota = "";
  try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (e) { nota = ""; }
  if (nota !== "CACHE-ESTRUCTURA-v1") return null;
  return hoja;
}

function pintarContadores_(estado, eventos) {
  var hoja = hojaCaches_();
  if (!hoja) return;
  function fila(nombre, caja, resultado) {
    return [nombre, resultado, caja.h, caja.m, caja.h + caja.m, tasaCache_(caja)];
  }
  var ultimo = { L1I: "—", L1D: "—", L2: "—" };
  var i;
  for (i = 0; i < eventos.length; i++) ultimo[eventos[i].nivel] = eventos[i].hit ? "HIT" : "MISS";
  var matriz = [
    ["Nivel", "Ahora", "Hits", "Misses", "Accesos", "Tasa"],
    fila("L1I", estado.l1i, ultimo.L1I),
    fila("L1D", estado.l1d, ultimo.L1D),
    fila("L2", estado.l2, ultimo.L2)
  ];
  var rango = hoja.getRange(10, 1, 4, 6);
  if (rango.setNumberFormat) rango.setNumberFormat("@");
  rango.setValues(matriz);
  function color(resultado) {
    if (resultado === "HIT") return "#C8E6C9";
    if (resultado === "MISS") return "#FFCDD2";
    return null;
  }
  hoja.getRange(11, 2).setBackground(color(ultimo.L1I));
  hoja.getRange(12, 2).setBackground(color(ultimo.L1D));
  hoja.getRange(13, 2).setBackground(color(ultimo.L2));
}

function filaPanel_(nivel, indice) {
  if (nivel === "L1I") return 3;
  if (nivel === "L1D") return 4;
  return 5 + indice;
}

function marcarReemplazo_(eventos) {
  var hoja = hojaCaches_();
  if (!hoja) return;
  var i;
  for (i = 0; i < eventos.length; i++) {
    if (!eventos[i].reemplazo) continue;
    var fila = filaPanel_(eventos[i].nivel, eventos[i].indice || 0);
    hoja.getRange(fila, 1, 1, 13).setBackground("#FFE0B2");
  }
}

function animarOcho_(fila) {
  var ms = msAnimacion_();
  if (!ms) return;
  var hoja = hojaCaches_();
  if (!hoja || typeof Utilities === "undefined" || !Utilities.sleep) return;
  var i;
  for (i = 0; i < 8; i++) {
    hoja.getRange(fila, 5 + i).setBackground("#BBDEFB");
    Utilities.sleep(ms);
  }
}

function anotarEventosCache(eventos) {
  if (!eventos || !eventos.length) return;
  var props = PropertiesService.getDocumentProperties();
  var backup = props.getProperty(CACHE_CONTADORES_CLAVE);
  var estado = cargarContadores_();
  var i;
  for (i = 0; i < eventos.length; i++) {
    var caja = caja_(estado, eventos[i].nivel);
    if (eventos[i].hit) caja.h += 1;
    else caja.m += 1;
    estado.eventos.push("CACHE " + eventos[i].nivel + (eventos[i].hit ? " HIT" : " MISS"));
  }
  props.setProperty(CACHE_CONTADORES_CLAVE, JSON.stringify(estado));
  try {
    pintarContadores_(estado, eventos);
    marcarReemplazo_(eventos);
    var j;
    for (j = 0; j < eventos.length; j++) {
      if (!eventos[j].hit) animarOcho_(filaPanel_(eventos[j].nivel, eventos[j].indice || 0));
    }
    if (typeof registrarLog === "function") {
      var libro = (typeof SpreadsheetApp !== "undefined") ? SpreadsheetApp.getActiveSpreadsheet() : null;
      var hoja = libro ? (libro.getSheetByName(typeof SHEET_NAME !== "undefined" ? SHEET_NAME : "Hoja 1") || libro.getActiveSheet()) : null;
      for (j = 0; j < eventos.length; j++) registrarLog(hoja, estado.eventos[estado.eventos.length - eventos.length + j]);
    }
  } catch (e) {
    if (backup) props.setProperty(CACHE_CONTADORES_CLAVE, backup);
    else if (props.deleteProperty) props.deleteProperty(CACHE_CONTADORES_CLAVE);
    throw e;
  }
}

function resetContadoresCache() {
  var props = PropertiesService.getDocumentProperties();
  var backup = props.getProperty(CACHE_CONTADORES_CLAVE);
  var previo = null;
  try { previo = backup ? JSON.parse(backup) : null; } catch (eP) { previo = null; }
  var sesion = previo && typeof previo.sesion === "number" ? previo.sesion + 1 : 1;
  var estado = contadoresNuevos_(sesion);
  props.setProperty(CACHE_CONTADORES_CLAVE, JSON.stringify(estado));
  try {
    pintarContadores_(estado, []);
    if (typeof registrarLog === "function" && typeof SpreadsheetApp !== "undefined") {
      var libro = SpreadsheetApp.getActiveSpreadsheet();
      var hoja = libro ? (libro.getSheetByName(typeof SHEET_NAME !== "undefined" ? SHEET_NAME : "Hoja 1") || libro.getActiveSheet()) : null;
      if (hoja) registrarLog(hoja, "CACHE SESION " + sesion);
    }
  } catch (e) {
    if (backup) props.setProperty(CACHE_CONTADORES_CLAVE, backup);
    else if (props.deleteProperty) props.deleteProperty(CACHE_CONTADORES_CLAVE);
    throw e;
  }
  return sesion;
}

function instalarYProbarIssue29() {
  if (typeof readCache !== "function" || typeof describirDireccionCache !== "function" || typeof instalarCaches !== "function") {
    throw new Error("Cache: falta el issue 27 o 28. No se escribió nada.");
  }
  if (typeof readPhysical !== "function" || typeof writePhysical !== "function") {
    throw new Error("Cache: falta MemoriaFisica.gs. No se escribió nada.");
  }
  activarAnimacionCache(0);
  var ok = 0;
  var mal = 0;
  function registrar(bien, mensaje) {
    if (bien) { ok++; Logger.log("OK  " + mensaje); }
    else { mal++; Logger.log("FALLO  " + mensaje); }
  }
  var props = PropertiesService.getDocumentProperties();
  var crudoCache = props.getProperty("CACHE_ESTRUCTURA_v1");
  var crudoCont = props.getProperty(CACHE_CONTADORES_CLAVE);
  var ram = [];
  var i;
  for (i = 0; i < 256; i++) ram.push("");
  ram[0] = "NOP";
  ram[16] = "A5H";
  var rp = readPhysical;
  var wp = writePhysical;
  var sleeps = 0;
  var sleepPrev = (typeof Utilities !== "undefined" && Utilities.sleep) ? Utilities.sleep : null;
  if (sleepPrev) Utilities.sleep = function () { sleeps++; };
  readPhysical = function (a) { return ram[a]; };
  writePhysical = function (a, v) { ram[a] = v; return v; };
  var log = [];
  var logPrev = (typeof registrarLog === "function") ? registrarLog : null;
  registrarLog = function (hoja, mensaje) { log.push(mensaje); };
  Logger.log("Cache visual: contadores en memoria. La animación con espera está en 0.");
  try {
    if (typeof SpreadsheetApp !== "undefined") instalarCaches();
    else props.setProperty("CACHE_ESTRUCTURA_v1", props.getProperty("CACHE_ESTRUCTURA_v1") || "{\"version\":1,\"reloj\":0}");
    if (!props.getProperty("CACHE_ESTRUCTURA_v1") || props.getProperty("CACHE_ESTRUCTURA_v1").indexOf("l1i") < 0) {
      instalarCaches();
    }
    resetContadoresCache();
    log.length = 0;
    readCache(0, "instruccion");
    readCache(0, "instruccion");
    var c = leerContadoresCache();
    registrar(c.l1i.misses === 1 && c.l1i.hits === 1 && c.l1i.accesos === 2 && c.l2.misses === 1 && c.l2.hits === 0 && c.l2.accesos === 1, "L1I cuenta el acierto y L2 solo el fallo");
    registrar(c.l1i.tasa === 50 && sleeps === 0, "la tasa es 50 y la prueba no duerme");
    var antes = JSON.stringify(leerContadoresCache());
    var lanzo = false;
    try { readCache(999, "dato"); } catch (eMal) { lanzo = true; }
    registrar(lanzo && JSON.stringify(leerContadoresCache()) === antes, "una dirección inválida no cuenta");
    configurarRangoNoCacheable(16, 8);
    readCache(16, "dato");
    var trasIo = leerContadoresCache();
    registrar(trasIo.l1d.accesos === 0 && trasIo.l2.accesos === 1, "el rango no cacheable no entra a L1D ni a L2");
    configurarRangoNoCacheable(null);
    readCache(16, "dato");
    readCache(16, "dato");
    var d = leerContadoresCache();
    registrar(d.l1d.misses === 1 && d.l1d.hits === 1 && d.l2.accesos === 2, "L1D falla una vez y luego acierta");
    writeCache(16, "C1H", "dato");
    var antesReset = leerContadoresCache();
    var suma = antesReset.l1i.accesos + antesReset.l1d.accesos + antesReset.l2.accesos;
    var enLog = 0;
    var k;
    for (k = 0; k < log.length; k++) if (log[k].indexOf(" HIT") > 0 || log[k].indexOf(" MISS") > 0) enLog++;
    registrar(ram[16] === "C1H" && antesReset.l1d.hits === 2 && enLog === suma && antesReset.eventos.length === suma, "el ST acierta una vez y el LOG de la sesión coincide");
    var sesion = antesReset.sesion;
    resetContadoresCache();
    var cero = leerContadoresCache();
    registrar(cero.sesion === sesion + 1 && cero.l1i.accesos === 0 && cero.eventos.length === 0 && log[log.length - 1].indexOf("CACHE SESION") === 0, "el reset deja los contadores en cero y marca la sesión");
  } catch (e) {
    registrar(false, "excepción: " + (e && e.message ? e.message : e));
  } finally {
    readPhysical = rp;
    writePhysical = wp;
    if (logPrev) registrarLog = logPrev;
    else registrarLog = undefined;
    if (sleepPrev) Utilities.sleep = sleepPrev;
    if (crudoCache) props.setProperty("CACHE_ESTRUCTURA_v1", crudoCache);
    else if (props.deleteProperty) props.deleteProperty("CACHE_ESTRUCTURA_v1");
    if (crudoCont) props.setProperty(CACHE_CONTADORES_CLAVE, crudoCont);
    else if (props.deleteProperty) props.deleteProperty(CACHE_CONTADORES_CLAVE);
    activarAnimacionCache(0);
  }
  Logger.log("RESUMEN instalarYProbarIssue29: " + ok + " OK, " + mal + " fallos.");
  if (mal > 0) throw new Error("instalarYProbarIssue29: " + mal + " fallos.");
  Logger.log("Step y Run comparten leerCacheCPU. La espera de la animación sigue en 0.");
}
