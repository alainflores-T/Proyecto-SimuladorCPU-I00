// CacheLogica.gs
// Issue 28. La L2 es la directa de 4 líneas del issue 27:
// el índice elige la única línea. No hay FIFO ni LRU que aplicar.
// Escritura: write-through y write-allocate. Dirty no se usa.
// ST pasa por escribirCacheCPU. Este CPU no ejecuta OUT;
// si se añade, debe usar la misma función.
// Ninguna dirección es de E/S mientras RESERVA_ES sea null.
// configurarRangoNoCacheable(inicio, bytes) marca un rango ya validado.
// configurarRangoNoCacheable(null) lo quita. No inventa F0 ni F8.

var CACHE_IO_CLAVE = "CACHE_NOCACHEABLE_v1";

function cacheLista_() {
  try {
    return !!PropertiesService.getDocumentProperties().getProperty("CACHE_ESTRUCTURA_v1");
  } catch (e) { return false; }
}

function confirmarCache_(estado, eventos) {
  var backup = PropertiesService.getDocumentProperties().getProperty("CACHE_ESTRUCTURA_v1");
  var backupC = null;
  try { backupC = PropertiesService.getDocumentProperties().getProperty("CACHE_CONTADORES_v1"); } catch (eB) { backupC = null; }
  try {
    guardarVistaCache_(estado);
    if (typeof anotarEventosCache === "function") anotarEventosCache(eventos);
  } catch (eConf) {
    if (backup) PropertiesService.getDocumentProperties().setProperty("CACHE_ESTRUCTURA_v1", backup);
    if (backupC) PropertiesService.getDocumentProperties().setProperty("CACHE_CONTADORES_v1", backupC);
    else {
      var props = PropertiesService.getDocumentProperties();
      if (props.deleteProperty) props.deleteProperty("CACHE_CONTADORES_v1");
    }
    throw eConf;
  }
}

function guardarVistaCache_(estado) {
  PropertiesService.getDocumentProperties().setProperty("CACHE_ESTRUCTURA_v1", JSON.stringify(estado));
  if (typeof SpreadsheetApp === "undefined" || typeof instalarCaches !== "function") return;
  try { instalarCaches(); } catch (e) {}
}

function cargarEstadoCache_() {
  var raw = PropertiesService.getDocumentProperties().getProperty("CACHE_ESTRUCTURA_v1");
  if (!raw) return null;
  return JSON.parse(raw);
}

function rangoNoCacheable_() {
  var raw = null;
  try { raw = PropertiesService.getDocumentProperties().getProperty(CACHE_IO_CLAVE); } catch (e) { return null; }
  if (!raw) return null;
  var obj = JSON.parse(raw);
  if (!obj || typeof obj.inicio !== "number" || typeof obj.bytes !== "number") return null;
  return obj;
}

function configurarRangoNoCacheable(inicio, bytes) {
  if (inicio === null) {
    var props = PropertiesService.getDocumentProperties();
    if (props.deleteProperty) props.deleteProperty(CACHE_IO_CLAVE);
    return null;
  }
  if (typeof inicio !== "number" || typeof bytes !== "number" || Math.floor(inicio) !== inicio || Math.floor(bytes) !== bytes || inicio < 0 || bytes < 1 || inicio + bytes - 1 > 255) {
    throw new Error("Cache: el rango no cacheable debe ser inicio 0..255 y bytes hasta el final. No se cambió nada.");
  }
  if (typeof RESERVA_ES !== "undefined" && RESERVA_ES !== null) {
    throw new Error("Cache: RESERVA_ES ya no es null. No se aplica un segundo mapa.");
  }
  var rango = { inicio: inicio, bytes: bytes };
  PropertiesService.getDocumentProperties().setProperty(CACHE_IO_CLAVE, JSON.stringify(rango));
  return rango;
}

function esNoCacheable_(addr) {
  var rango = rangoNoCacheable_();
  if (!rango) return false;
  return addr >= rango.inicio && addr < rango.inicio + rango.bytes;
}

function fisicaDeCpu_(sheet, escritura) {
  var mar = sheet.getRange(REG_MAR).getValue();
  if (typeof memoriaVirtualActiva === "function" && memoriaVirtualActiva()) {
    if (typeof marcarAccesoMMU !== "function") throw new Error("Cache: falta marcarAccesoMMU. No se leyó la RAM dos veces.");
    var acceso = marcarAccesoMMU(mar, !!escritura);
    return acceso.fisica;
  }
  if (typeof mar === "number" && mar === mar && Math.floor(mar) === mar && mar >= 0 && mar <= 255) return mar;
  if (typeof mar === "string" && /^[0-9A-Fa-f]{1,2}H$/.test(mar.trim())) return parseInt(mar.trim().slice(0, -1), 16);
  throw new Error("Cache: MAR físico inválido (" + mar + ").");
}

function ponerMdr_(sheet, dato) {
  var celda = sheet.getRange(REG_MDR);
  if (celda.setNumberFormat && typeof dato === "string") celda.setNumberFormat("@");
  celda.setValue(dato);
}

function lineaL1_(estado, tipo) {
  if (tipo === "instruccion") return estado.l1i;
  if (tipo === "dato") return estado.l1d;
  throw new Error("Cache: el tipo debe ser instruccion o dato.");
}

function leerOcho_(base) {
  var bytes = [];
  var i;
  for (i = 0; i < 8; i++) bytes.push(readPhysical(base + i));
  return bytes;
}

function usarLinea_(estado, ln) {
  estado.reloj += 1;
  ln.uso = estado.reloj;
}

function llenarDesdeRam_(estado, desc) {
  var l2 = estado.l2[desc.l2.indice];
  var base = desc.direccion & ~7;
  l2.valid = true;
  l2.tag = desc.l2.tag;
  l2.bytes = leerOcho_(base);
  l2.base = base;
  l2.dirty = null;
  usarLinea_(estado, l2);
  return l2;
}

function copiarAL1_(estado, tipo, desc, l2) {
  var l1 = lineaL1_(estado, tipo);
  l1.valid = true;
  l1.tag = desc.l1.tag;
  l1.bytes = l2.bytes.slice();
  l1.base = l2.base;
  l1.dirty = null;
  usarLinea_(estado, l1);
  return l1.bytes[desc.offset];
}

function readCache(physAddr, tipo) {
  if (typeof physAddr !== "number" || physAddr < 0 || physAddr > 255 || Math.floor(physAddr) !== physAddr) {
    throw new Error("Cache: readCache espera una dirección física 0..255.");
  }
  if (!cacheLista_() || esNoCacheable_(physAddr)) return readPhysical(physAddr);
  var estado = cargarEstadoCache_();
  var desc = describirDireccionCache(physAddr);
  var l1 = lineaL1_(estado, tipo);
  var nombre = tipo === "instruccion" ? "L1I" : "L1D";
  if (l1.valid && l1.tag === desc.l1.tag && l1.base === (physAddr & ~7)) {
    usarLinea_(estado, l1);
    confirmarCache_(estado, [{ nivel: nombre, hit: true }]);
    return l1.bytes[desc.offset];
  }
  var eventos = [{ nivel: nombre, hit: false }];
  var l2 = estado.l2[desc.l2.indice];
  var reemplazoL2 = l2.valid && l2.tag !== desc.l2.tag;
  if (!(l2.valid && l2.tag === desc.l2.tag && l2.base === (physAddr & ~7))) {
    l2 = llenarDesdeRam_(estado, desc);
    eventos.push({ nivel: "L2", hit: false, reemplazo: reemplazoL2, indice: desc.l2.indice });
  } else {
    usarLinea_(estado, l2);
    eventos.push({ nivel: "L2", hit: true, indice: desc.l2.indice });
  }
  var reemplazoL1 = l1.valid && l1.tag !== desc.l1.tag;
  var dato = copiarAL1_(estado, tipo, desc, l2);
  eventos[0].reemplazo = reemplazoL1;
  confirmarCache_(estado, eventos);
  return dato;
}

function writeCache(physAddr, valor, tipo) {
  if (typeof physAddr !== "number" || physAddr < 0 || physAddr > 255 || Math.floor(physAddr) !== physAddr) {
    throw new Error("Cache: writeCache espera una dirección física 0..255.");
  }
  if (!cacheLista_() || esNoCacheable_(physAddr)) {
    writePhysical(physAddr, valor);
    return valor;
  }
  var estado = cargarEstadoCache_();
  var desc = describirDireccionCache(physAddr);
  var nombre = tipo === "instruccion" ? "L1I" : "L1D";
  var l1 = lineaL1_(estado, tipo);
  var l2 = estado.l2[desc.l2.indice];
  var aciertoL1 = l1.valid && l1.tag === desc.l1.tag && l1.base === (physAddr & ~7);
  var aciertoL2 = l2.valid && l2.tag === desc.l2.tag && l2.base === (physAddr & ~7);
  var reemplazoL2 = l2.valid && !aciertoL2;
  if (!aciertoL2) l2 = llenarDesdeRam_(estado, desc);
  l2.bytes[desc.offset] = valor;
  l2.dirty = null;
  usarLinea_(estado, l2);
  var reemplazoL1 = l1.valid && !aciertoL1;
  if (!aciertoL1) copiarAL1_(estado, tipo, desc, l2);
  l1 = lineaL1_(estado, tipo);
  l1.bytes[desc.offset] = valor;
  l1.dirty = null;
  usarLinea_(estado, l1);
  writePhysical(physAddr, valor);
  var eventos = [{ nivel: nombre, hit: aciertoL1, reemplazo: reemplazoL1 }];
  if (!aciertoL1) eventos.push({ nivel: "L2", hit: aciertoL2, reemplazo: reemplazoL2, indice: desc.l2.indice });
  confirmarCache_(estado, eventos);
  return valor;
}

function invalidarCachePagina(info) {
  if (!info || typeof info.pfn !== "number") return;
  if (!cacheLista_()) return;
  var estado = cargarEstadoCache_();
  var inicio = info.pfn * 32;
  var fin = inicio + 32;
  function limpiar(ln) {
    if (typeof ln.base === "number" && ln.base >= inicio && ln.base < fin) {
      ln.valid = false;
      ln.tag = null;
      ln.bytes = ["", "", "", "", "", "", "", ""];
      ln.uso = null;
      ln.base = null;
      ln.dirty = null;
    }
  }
  limpiar(estado.l1i);
  limpiar(estado.l1d);
  var i;
  for (i = 0; i < 4; i++) limpiar(estado.l2[i]);
  guardarVistaCache_(estado);
}

function leerCacheCPU(sheet, tipo) {
  var fisica = fisicaDeCpu_(sheet, false);
  var dato = readCache(fisica, tipo === "instruccion" ? "instruccion" : "dato");
  ponerMdr_(sheet, dato);
  return dato;
}

function escribirCacheCPU(sheet) {
  var fisica = fisicaDeCpu_(sheet, true);
  var dato = sheet.getRange(REG_MDR).getValue();
  writeCache(fisica, dato, "dato");
}

function instalarYProbarIssue28() {
  if (typeof describirDireccionCache !== "function" || typeof instalarCaches !== "function") {
    throw new Error("Cache: falta CacheEstructura.gs del issue 27. No se escribió nada.");
  }
  if (typeof readPhysical !== "function" || typeof writePhysical !== "function") {
    throw new Error("Cache: falta MemoriaFisica.gs. No se escribió nada.");
  }
  if (typeof marcarAccesoMMU !== "function") {
    throw new Error("Cache: falta marcarAccesoMMU. Reemplace MMU.gs. No se escribió nada.");
  }
  var org = describirOrganizacionCache();
  if (org.l2Organizacion !== "directa-4") throw new Error("Cache: la L2 no es la directa de 4 líneas.");
  var ok = 0;
  var mal = 0;
  function registrar(bien, mensaje) {
    if (bien) { ok++; Logger.log("OK  " + mensaje); }
    else { mal++; Logger.log("FALLO  " + mensaje); }
  }
  Logger.log("Cache lógica: directa, write-through. Sin animación y sin programas 1 y 3.");
  var ram = [];
  var i;
  for (i = 0; i < 256; i++) ram.push("");
  ram[0] = "LD AX, 20H";
  ram[1] = "HLT";
  ram[8] = "A5H";
  var lecturas = 0;
  var rp = readPhysical;
  var wp = writePhysical;
  readPhysical = function (a) { lecturas++; return ram[a]; };
  writePhysical = function (a, v) { ram[a] = v; return v; };
  var props = PropertiesService.getDocumentProperties();
  var crudo = props.getProperty("CACHE_ESTRUCTURA_v1");
  var io = props.getProperty(CACHE_IO_CLAVE);
  try {
    if (typeof SpreadsheetApp !== "undefined") instalarCaches();
    else props.setProperty("CACHE_ESTRUCTURA_v1", JSON.stringify({ version: 1, reloj: 0, l1i: { valid: false, tag: null, bytes: ["", "", "", "", "", "", "", ""], uso: null, dirty: null }, l1d: { valid: false, tag: null, bytes: ["", "", "", "", "", "", "", ""], uso: null, dirty: null }, l2: [{ valid: false, tag: null, bytes: ["", "", "", "", "", "", "", ""], uso: null, dirty: null }, { valid: false, tag: null, bytes: ["", "", "", "", "", "", "", ""], uso: null, dirty: null }, { valid: false, tag: null, bytes: ["", "", "", "", "", "", "", ""], uso: null, dirty: null }, { valid: false, tag: null, bytes: ["", "", "", "", "", "", "", ""], uso: null, dirty: null }] }));
    lecturas = 0;
    var primera = readCache(0, "instruccion");
    var segunda = readCache(1, "instruccion");
    registrar(primera === "LD AX, 20H" && segunda === "HLT" && lecturas === 8, "el fallo de L1I trae 8 bytes una vez y el segundo byte es acierto");
    lecturas = 0;
    var dato = readCache(8, "dato");
    registrar(dato === "A5H" && lecturas === 8 && readCache(8, "dato") === "A5H" && lecturas === 8, "L1D no relee la RAM en el acierto");
    var estado = JSON.parse(props.getProperty("CACHE_ESTRUCTURA_v1"));
    registrar(estado.l2[1].valid === true && estado.l2[1].tag === 0 && estado.l1i.tag === 0 && estado.l1d.tag === 1, "L2 índice 1 guarda la línea del 8 y L1I conserva la del 0");
    writeCache(8, "B6H", "dato");
    registrar(ram[8] === "B6H" && readCache(8, "dato") === "B6H" && JSON.parse(props.getProperty("CACHE_ESTRUCTURA_v1")).l1d.dirty === null, "write-through deja la RAM igual que la línea y Dirty sigue vacío");
    var base = ram[0];
    invalidarCachePagina({ pfn: 0, vpn: 0, vpnSaliente: null });
    lecturas = 0;
    registrar(readCache(0, "instruccion") === base && lecturas === 8, "invalidar el marco 0 obliga a recargar la línea");
    var malo = false;
    var antesIo = props.getProperty(CACHE_IO_CLAVE);
    try { configurarRangoNoCacheable(1.5, 4); } catch (eIo) { malo = String(eIo.message).indexOf("Cache:") === 0; }
    registrar(malo && props.getProperty(CACHE_IO_CLAVE) === antesIo, "un rango no cacheable inválido no se guarda");
    configurarRangoNoCacheable(8, 8);
    lecturas = 0;
    registrar(readCache(8, "dato") === "B6H" && lecturas === 1, "el rango configurado no llena línea: una sola lectura");
    configurarRangoNoCacheable(null);
    registrar(typeof RESERVA_ES === "undefined" || RESERVA_ES === null, "RESERVA_ES sigue null");
  } catch (e) {
    registrar(false, "excepción: " + (e && e.message ? e.message : e));
  } finally {
    readPhysical = rp;
    writePhysical = wp;
    if (crudo) props.setProperty("CACHE_ESTRUCTURA_v1", crudo);
    else if (props.deleteProperty) props.deleteProperty("CACHE_ESTRUCTURA_v1");
    if (io) props.setProperty(CACHE_IO_CLAVE, io);
    else if (props.deleteProperty) props.deleteProperty(CACHE_IO_CLAVE);
  }
  Logger.log("RESUMEN instalarYProbarIssue28: " + ok + " OK, " + mal + " fallos.");
  if (mal > 0) throw new Error("instalarYProbarIssue28: " + mal + " fallos.");
  Logger.log("La traza de los programas 1 y 3 no se corrió: el catálogo no está en esta copia.");
}
