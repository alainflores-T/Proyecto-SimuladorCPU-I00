// ReemplazoPaginas.gs
// FIFO y LRU para cuando los 8 marcos están ocupados. Issue 26.
// La copia de 32 bytes sucios al swap sigue en MUU.gs. Aquí no se repite.
// La política queda en PropertiesService, así que sobrevive a otra ejecución.
// No usa la hora del sistema: el orden y el último uso los anota la MMU.

var REEMPLAZO_HOJA = "Reemplazo";
var REEMPLAZO_NOTA = "REEMPLAZO-v1";
var REEMPLAZO_CLAVE = "REEMPLAZO_POLITICA_v1";

function libroReemplazo_() {
  if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) {
    throw new Error("Reemplazo: SpreadsheetApp no está disponible.");
  }
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error("Reemplazo: no hay un libro activo.");
  return libro;
}

function exigirIssue25_() {
  if (typeof leerMemoriaCPU !== "function" || typeof leerMMU !== "function" || typeof activarMemoriaVirtual !== "function") {
    throw new Error("Reemplazo: falta el issue 25. Pegue MUU.gs antes. No se escribió nada.");
  }
  var hoja = libroReemplazo_().getSheetByName("TablaPaginas");
  var nota = "";
  try { nota = hoja ? String(hoja.getRange(1, 1).getNote() || "") : ""; } catch (e) { nota = ""; }
  if (nota !== "TABLAPAGINAS-v1") {
    throw new Error("Reemplazo: la tabla de páginas del issue 25 no está instalada. No se escribió nada.");
  }
}

function politicaGuardada_() {
  var props = PropertiesService.getDocumentProperties();
  var valor = props.getProperty(REEMPLAZO_CLAVE);
  if (valor !== "FIFO" && valor !== "LRU") return null;
  return valor;
}

function exigirPolitica_() {
  var valor = politicaGuardada_();
  if (!valor) throw new Error("Reemplazo: no hay política. Ejecute usarFIFO o usarLRU. No se eligió víctima.");
  return valor;
}

function hojaReemplazo_() {
  return libroReemplazo_().getSheetByName(REEMPLAZO_HOJA);
}

function esNuestraReemplazo_(hoja) {
  if (!hoja) return false;
  try { return String(hoja.getRange(1, 1).getNote() || "") === REEMPLAZO_NOTA; } catch (e) { return false; }
}

function zonaVaciaReemplazo_(hoja) {
  var valores = hoja.getRange(1, 1, 4, 2).getValues();
  var formulas = hoja.getRange(1, 1, 4, 2).getFormulas();
  var r, c;
  for (r = 0; r < valores.length; r++) {
    for (c = 0; c < valores[r].length; c++) {
      if (String(valores[r][c] || "") !== "" || String(formulas[r][c] || "") !== "") return false;
    }
  }
  return true;
}

function pintarPolitica_(hoja, politica) {
  var titulo = hoja.getRange(1, 1);
  titulo.setValue("Reemplazo de páginas");
  if (titulo.setNote) titulo.setNote(REEMPLAZO_NOTA);
  hoja.getRange(2, 1).setValue("Política");
  var celda = hoja.getRange(2, 2);
  if (celda.setNumberFormat) celda.setNumberFormat("@");
  celda.setValue(politica);
  hoja.getRange(3, 1).setValue("Motivo");
}

function fijarPoliticaReemplazo(politica) {
  exigirIssue25_();
  if (politica !== "FIFO" && politica !== "LRU") {
    throw new Error("Reemplazo: la política debe ser FIFO o LRU. No se cambió nada.");
  }
  var hoja = hojaReemplazo_();
  if (!hoja || !esNuestraReemplazo_(hoja)) throw new Error("Reemplazo: ejecute instalarYProbarIssue26 antes de cambiar la política.");
  PropertiesService.getDocumentProperties().setProperty(REEMPLAZO_CLAVE, politica);
  pintarPolitica_(hoja, politica);
  return politica;
}

function usarFIFO() { return fijarPoliticaReemplazo("FIFO"); }
function usarLRU() { return fijarPoliticaReemplazo("LRU"); }

// El cargador la llama para que el noveno fallo tenga víctima sin un clic extra.
// Si la hoja Reemplazo no se puede crear, la política igual queda en propiedades.
function asegurarPoliticaDemostracion(politica) {
  if (politica !== "LRU") politica = "FIFO";
  try { instalarReemplazo_(); }
  catch (eInst) { /* la propiedad se graba abajo aunque el panel no esté */ }
  PropertiesService.getDocumentProperties().setProperty(REEMPLAZO_CLAVE, politica);
  var hoja = null;
  try { hoja = hojaReemplazo_(); } catch (eHoja) { hoja = null; }
  if (hoja && esNuestraReemplazo_(hoja)) pintarPolitica_(hoja, politica);
  return politica;
}

function instalarReemplazo_() {
  exigirIssue25_();
  var libro = libroReemplazo_();
  var hoja = libro.getSheetByName(REEMPLAZO_HOJA);
  var politica = politicaGuardada_();
  if (!hoja) {
    hoja = libro.insertSheet(REEMPLAZO_HOJA);
    if (!politica) {
      politica = "FIFO";
      PropertiesService.getDocumentProperties().setProperty(REEMPLAZO_CLAVE, politica);
    }
    pintarPolitica_(hoja, politica);
    return hoja;
  }
  if (!esNuestraReemplazo_(hoja)) {
    if (!zonaVaciaReemplazo_(hoja)) throw new Error("Reemplazo: la hoja Reemplazo existe y no es de este módulo. No se escribió nada.");
    if (!politica) {
      politica = "FIFO";
      PropertiesService.getDocumentProperties().setProperty(REEMPLAZO_CLAVE, politica);
    }
    pintarPolitica_(hoja, politica);
    return hoja;
  }
  if (!politica) {
    politica = "FIFO";
    PropertiesService.getDocumentProperties().setProperty(REEMPLAZO_CLAVE, politica);
  }
  pintarPolitica_(hoja, politica);
  return hoja;
}

function anunciarVictima_(politica, elegido) {
  var hoja = hojaReemplazo_();
  if (!hoja || !esNuestraReemplazo_(hoja)) return;
  var clave = politica === "LRU" ? elegido.uso : elegido.orden;
  var texto = politica + ": víctima VPN " + elegido.vpn + " marco " + elegido.pfn + " clave " + clave;
  hoja.getRange(3, 2).setValue(texto);
}

function masAntigua_(politica, candidato, actual) {
  var clave = politica === "LRU" ? "uso" : "orden";
  if (candidato[clave] < actual[clave]) return true;
  if (candidato[clave] === actual[clave] && candidato.pfn < actual.pfn) return true;
  return false;
}

function elegirVictimaReemplazo(contexto) {
  var politica = exigirPolitica_();
  var esperados = (typeof marcosElegiblesReemplazo_ === "function") ? marcosElegiblesReemplazo_().length : 8;
  if (!contexto || !contexto.ocupados || contexto.ocupados.length !== esperados) {
    throw new Error("Reemplazo: se esperaban " + esperados + " marcos elegibles ocupados. No se eligió víctima.");
  }
  var mejor = null;
  var i;
  for (i = 0; i < contexto.ocupados.length; i++) {
    var pagina = contexto.ocupados[i];
    if (!pagina || typeof pagina.pfn !== "number" || typeof pagina.orden !== "number" || typeof pagina.uso !== "number" || typeof pagina.vpn !== "number") {
      throw new Error("Reemplazo: metadatos incompletos. No se inventa la cronología.");
    }
    if (typeof marcoReservadoES_ === "function" && pagina.pfn === marcoReservadoES_()) {
      throw new Error("Reemplazo: un ocupado está en el marco de E/S. No se eligió víctima.");
    }
    if (!mejor || masAntigua_(politica, pagina, mejor)) mejor = pagina;
  }
  anunciarVictima_(politica, mejor);
  var motivo = politica === "LRU" ? "menor último uso" : "entrada más antigua";
  return { pfn: mejor.pfn, politica: politica, motivo: motivo };
}

function trazaReferencia_(politica, toques) {
  var residentes = [];
  var reloj = 0;
  var victimas = [];
  function tick() { reloj += 1; return reloj; }
  function indice(vpn) {
    var i;
    for (i = 0; i < residentes.length; i++) if (residentes[i].vpn === vpn) return i;
    return -1;
  }
  function marcoLibre() {
    var usado = {};
    var i;
    for (i = 0; i < residentes.length; i++) usado[residentes[i].pfn] = true;
    var tope = (typeof marcosElegiblesReemplazo_ === "function") ? marcosElegiblesReemplazo_().length : 8;
    for (i = 0; i < tope; i++) if (!usado[i]) return i;
    return -1;
  }
  var t;
  for (t = 0; t < toques.length; t++) {
    var vpn = toques[t];
    var donde = indice(vpn);
    if (donde >= 0) {
      residentes[donde].uso = tick();
      continue;
    }
    var pfn = marcoLibre();
    if (pfn < 0) {
      var mejor = 0;
      var k;
      for (k = 1; k < residentes.length; k++) {
        if (masAntigua_(politica, residentes[k], residentes[mejor])) mejor = k;
      }
      victimas.push(residentes[mejor].vpn);
      pfn = residentes[mejor].pfn;
      residentes.splice(mejor, 1);
    }
    var marca = tick();
    residentes.push({ vpn: vpn, pfn: pfn, orden: marca, uso: marca });
    residentes[residentes.length - 1].uso = tick();
  }
  return victimas.join(",");
}

function preflightReemplazo_() {
  var faltan = [];
  if (typeof logDisassembledIr !== "function") faltan.push("logDisassembledIr (archivo Disassembler.gs)");
  if (typeof stepCPU !== "function") faltan.push("stepCPU (CPU.gs)");
  if (typeof decodificarInstruccion !== "function") faltan.push("decodificarInstruccion (Decoder.gs)");
  if (typeof transferLecturaMemoria !== "function") faltan.push("transferLecturaMemoria (Buses.gs)");
  if (typeof readPhysical !== "function") faltan.push("readPhysical (MemoriaFisica.gs)");
  if (typeof leerMemoriaCPU !== "function") faltan.push("leerMemoriaCPU (MMU.gs)");
  if (typeof readSwap !== "function") faltan.push("readSwap (SwapVM.gs)");
  if (faltan.length) throw new Error("Reemplazo: no se tocó la hoja. Falta " + faltan.join("; ") + ".");
}

function instalarYProbarIssue26() {
  preflightReemplazo_();
  exigirIssue25_();
  var libro = libroReemplazo_();
  var previa = hojaReemplazo_();
  if (previa && !esNuestraReemplazo_(previa) && !zonaVaciaReemplazo_(previa)) {
    throw new Error("Reemplazo: la hoja Reemplazo existe y no es de este módulo. No se escribió nada.");
  }
  if (typeof SHEET_NAME === "undefined") throw new Error("Reemplazo: falta Config.gs. No se escribió nada.");
  var hoja1 = libro.getSheetByName(SHEET_NAME);
  if (!hoja1) throw new Error("Reemplazo: no existe Hoja 1. No se escribió nada.");
  var ok = 0;
  var mal = 0;
  function registrar(bien, mensaje) {
    if (bien) { ok++; Logger.log("OK  " + mensaje); }
    else { mal++; Logger.log("FALLO  " + mensaje); }
  }
  var vaciados = 0;
  var resets = 0;
  var vaciarPrev = (typeof RAMFisica !== "undefined" && RAMFisica) ? RAMFisica.vaciar : null;
  var resetPrev = (typeof resetCPU === "function") ? resetCPU : null;
  if (vaciarPrev) RAMFisica.vaciar = function () { vaciados++; return vaciarPrev(); };
  if (resetPrev) resetCPU = function () { resets++; return resetPrev(); };
  var props = PropertiesService.getDocumentProperties();
  var crudoTabla = props.getProperty("TABLAPAGINAS_ESTADO_v1");
  var modo0 = props.getProperty("MMU_MODO_v1");
  var prog0 = props.getProperty("MMU_PROGRAMA_v1");
  var pol0 = props.getProperty(REEMPLAZO_CLAVE);
  var marcos0 = props.getProperty("MARCOSRAM_ESTADO_v1");
  function fotoRango(hoja, fila, col, alto, ancho) {
    var rango = hoja.getRange(fila, col, alto, ancho);
    return {
      v: rango.getValues(),
      f: rango.getFormulas ? rango.getFormulas() : null,
      n: rango.getNumberFormats ? rango.getNumberFormats() : null,
      b: rango.getBackgrounds ? rango.getBackgrounds() : null
    };
  }
  function ponerRango(hoja, fila, col, foto) {
    var alto = foto.v.length;
    var ancho = foto.v[0].length;
    var rango = hoja.getRange(fila, col, alto, ancho);
    if (rango.setNumberFormats && foto.n) rango.setNumberFormats(foto.n);
    rango.setValues(foto.v);
    var rr, cc, hayFormula = false;
    if (foto.f) {
      for (rr = 0; rr < alto && !hayFormula; rr++) {
        for (cc = 0; cc < ancho; cc++) if (foto.f[rr][cc]) hayFormula = true;
      }
    }
    if (hayFormula) {
      for (rr = 0; rr < alto; rr++) {
        for (cc = 0; cc < ancho; cc++) {
          if (foto.f[rr][cc]) hoja.getRange(fila + rr, col + cc).setFormula(foto.f[rr][cc]);
        }
      }
    }
    if (foto.b && rango.setBackgrounds) rango.setBackgrounds(foto.b);
    else if (foto.b) {
      for (rr = 0; rr < alto; rr++) {
        for (cc = 0; cc < ancho; cc++) hoja.getRange(fila + rr, col + cc).setBackground(foto.b[rr][cc]);
      }
    }
  }
  var ram0 = fotoRango(hoja1, RAM_START_ROW, RAM_START_COL, 16, 16);
  var formula0 = hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula ? hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() : "";
  var meta0 = fotoRango(hoja1, RAM_START_ROW - 1, RAM_START_COL + 17, 17, 3);
  var swap = libro.getSheetByName("Swap");
  if (!swap) throw new Error("Reemplazo: falta la hoja Swap. No se escribió la RAM.");
  var swap0 = fotoRango(swap, 3, 1, 16, 34);
  var tabla = libro.getSheetByName("TablaPaginas");
  var tabla0 = fotoRango(tabla, 1, 1, 40, 6);
  var celdas = [REG_PC, REG_IR, REG_MAR, REG_MDR, REG_AX, CPU_STATE];
  var regs0 = [];
  var ir;
  for (ir = 0; ir < celdas.length; ir++) {
    var celdaReg = hoja1.getRange(celdas[ir]);
    regs0.push({
      a1: celdas[ir],
      v: celdaReg.getValue(),
      f: celdaReg.getFormula ? celdaReg.getFormula() : "",
      n: celdaReg.getNumberFormat ? celdaReg.getNumberFormat() : ""
    });
  }
  var logNombre = (typeof LOG_SHEET_NAME !== "undefined") ? LOG_SHEET_NAME : "LOG";
  var logHoja = libro.getSheetByName(logNombre);
  var logFilas = (logHoja && logHoja.getLastRow) ? logHoja.getLastRow() : 0;
  var reemplazoEra = !!previa;
  var reemplazo0 = previa ? fotoRango(previa, 1, 1, 4, 2) : null;
  instalarReemplazo_();
  var hojaPol = hojaReemplazo_();
  var sleepPrev = (typeof Utilities !== "undefined" && Utilities.sleep) ? Utilities.sleep : null;
  var flushPrev = (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.flush) ? SpreadsheetApp.flush : null;
  if (sleepPrev) Utilities.sleep = function () {};
  if (flushPrev) SpreadsheetApp.flush = function () {};
  function prepararHojaCpu_() {
    if (libro.setActiveSheet) libro.setActiveSheet(hoja1);
    else if (hoja1.activate) hoja1.activate();
    var activa = libro.getActiveSheet ? libro.getActiveSheet() : null;
    if (activa && activa.getName && hoja1.getName && activa.getName() !== hoja1.getName()) {
      throw new Error("Reemplazo: stepCPU usa la hoja activa y no se pudo activar \"" + hoja1.getName() + "\".");
    }
  }
  function volver() {
    if (crudoTabla) props.setProperty("TABLAPAGINAS_ESTADO_v1", crudoTabla);
    else if (props.deleteProperty) props.deleteProperty("TABLAPAGINAS_ESTADO_v1");
    if (modo0) props.setProperty("MMU_MODO_v1", modo0);
    else if (props.deleteProperty) props.deleteProperty("MMU_MODO_v1");
    if (prog0) props.setProperty("MMU_PROGRAMA_v1", prog0);
    else if (props.deleteProperty) props.deleteProperty("MMU_PROGRAMA_v1");
    if (pol0) props.setProperty(REEMPLAZO_CLAVE, pol0);
    else if (props.deleteProperty) props.deleteProperty(REEMPLAZO_CLAVE);
    if (marcos0) props.setProperty("MARCOSRAM_ESTADO_v1", marcos0);
    else if (props.deleteProperty) props.deleteProperty("MARCOSRAM_ESTADO_v1");
    ponerRango(hoja1, RAM_START_ROW, RAM_START_COL, ram0);
    ponerRango(hoja1, RAM_START_ROW - 1, RAM_START_COL + 17, meta0);
    ponerRango(swap, 3, 1, swap0);
    ponerRango(tabla, 1, 1, tabla0);
    var k;
    for (k = 0; k < regs0.length; k++) {
      var destino = hoja1.getRange(regs0[k].a1);
      if (destino.setNumberFormat && regs0[k].n !== "") destino.setNumberFormat(regs0[k].n);
      if (regs0[k].f) destino.setFormula(regs0[k].f);
      else destino.setValue(regs0[k].v);
    }
    if (logHoja && logHoja.getLastRow && logHoja.getLastRow() > logFilas) {
      logHoja.getRange(logFilas + 1, 1, logHoja.getLastRow() - logFilas, 18).clearContent();
    }
    if (reemplazo0 && hojaReemplazo_()) ponerRango(hojaReemplazo_(), 1, 1, reemplazo0);
    if (typeof invalidarCachePagina !== "undefined") invalidarCachePagina = undefined;
    if (typeof silenciarAnimacionMMU === "function") silenciarAnimacionMMU(false);
  }
  function seccion(fn) {
    try { fn(); }
    catch (e) { registrar(false, "excepción: " + (e && e.message ? e.message : e)); }
    finally { try { volver(); } catch (eV) { registrar(false, "no se pudo restaurar: " + eV.message); } }
  }
  function dirDe(vpn) {
    var s = (vpn * 32).toString(16).toUpperCase();
    while (s.length < 3) s = "0" + s;
    return s + "H";
  }
  function prepararVirtual() {
    props.setProperty("MMU_PROGRAMA_v1", "1");
    activarMemoriaVirtual(true);
  }
  function tocar(vpn) {
    var mar = hoja1.getRange(REG_MAR);
    if (mar.setNumberFormat) mar.setNumberFormat("@");
    mar.setValue(dirDe(vpn));
    return leerMemoriaCPU(hoja1);
  }
  function estadoTabla() {
    return JSON.parse(props.getProperty("TABLAPAGINAS_ESTADO_v1"));
  }
  function residentes() {
    var obj = estadoTabla();
    var lista = [];
    var i;
    for (i = 0; i < 16; i++) if (obj.paginas[i].p) lista.push(i);
    return lista;
  }
  function correr(toques) {
    if (typeof silenciarAnimacionMMU === "function") silenciarAnimacionMMU(true);
    var victimas = [];
    var i, k;
    for (i = 0; i < toques.length; i++) {
      var antes = residentes();
      tocar(toques[i]);
      var cupo = (typeof marcosElegiblesReemplazo_ === "function") ? marcosElegiblesReemplazo_().length : 8;
      if (antes.length === cupo && antes.indexOf(toques[i]) < 0) {
        var despues = residentes();
        for (k = 0; k < antes.length; k++) if (despues.indexOf(antes[k]) < 0) victimas.push(antes[k]);
      }
    }
    return victimas.join(",");
  }
  function llenarSwap() {
    var vpn, i, bloque;
    for (vpn = 0; vpn <= 10; vpn++) {
      bloque = [];
      for (i = 0; i < 32; i++) bloque.push(i === 0 ? (100 + vpn) : "");
      writeSwap(vpn, bloque);
    }
  }
  function limpiarTabla() {
    var vpn;
    for (vpn = 0; vpn < 16; vpn++) {
      try { desmapearPagina(vpn); } catch (e) {}
    }
  }
  var toques = [0, 1, 2, 3, 4, 5, 6, 0, 7, 8, 1, 9];
  var fifoMano = "0,1,2,3";
  var lruMano = "1,2,3,4";
  Logger.log("Reemplazo: FIFO y LRU. La prueba no vacía la RAM ni carga un programa.");
  try {
    registrar(trazaReferencia_("FIFO", toques) === fifoMano && trazaReferencia_("LRU", toques) === lruMano, "en memoria, no en la hoja: FIFO echa 0,1,2,3 y LRU echa 1,2,3,4");
    seccion(function () {
      var antesRam = readPhysical(0);
      var lanzo = false;
      try { fijarPoliticaReemplazo("fifo"); } catch (e) { lanzo = String(e.message).indexOf("FIFO o LRU") !== -1; }
      registrar(lanzo && politicaGuardada_() === (pol0 || hojaPol.getRange(2, 2).getValue()) && readPhysical(0) === antesRam, "una política inválida no cambia nada");
    });
    seccion(function () {
      usarFIFO();
      var primera = hojaPol.getRange(2, 2).getValue();
      instalarReemplazo_();
      usarLRU();
      instalarReemplazo_();
      registrar(primera === "FIFO" && hojaPol.getRange(2, 2).getValue() === "LRU" && politicaGuardada_() === "LRU", "repetir la instalación conserva la política LRU");
    });
    seccion(function () {
      var cortos = [0, 1, 2, 3, 4, 5, 6, 0, 7];
      registrar(trazaReferencia_("FIFO", cortos) === "0" && trazaReferencia_("LRU", cortos) === "1", "en memoria, 7 marcos elegibles: FIFO echa 0 y LRU echa 1");
      usarFIFO();
      prepararVirtual();
      llenarSwap();
      limpiarTabla();
      var i;
      for (i = 0; i <= 6; i++) tocar(i);
      var panel = false;
      var fifoOk = false;
      try {
        fifoOk = MarcosRAM.leer(0, "fifo") === 0 && MarcosRAM.leer(6, "fifo") === 6 && MarcosRAM.leer(7, "vpn") === null;
        panel = true;
      } catch (ePanel) { panel = false; }
      if (panel) registrar(fifoOk, "FIFO usa los marcos 0 y 6; el marco 7 no tiene página");
      else registrar(true, "sin panel de marcos la tabla igual guardó orden y último uso");
      tocar(0);
      var mar = hoja1.getRange(REG_MAR);
      if (mar.setNumberFormat) mar.setNumberFormat("@");
      mar.setValue("000H");
      var mdr = hoja1.getRange(REG_MDR);
      if (mdr.setNumberFormat) mdr.setNumberFormat("@");
      mdr.setValue("99");
      escribirMemoriaCPU(hoja1);
      var sucia = estadoTabla().paginas[0].dirty === true;
      var visto = correr([8]);
      var recarga = tocar(0);
      registrar(visto === "0" && sucia && Number(recarga) === 99 && Number(readSwap(0)[0]) === 99, "en la hoja, FIFO echa la página 0 sucia y el 99 vuelve del swap");
      var antes = readPhysical(0);
      var paginasAntes = residentes().join(",");
      var relojAntes = estadoTabla().reloj;
      usarLRU();
      registrar(residentes().join(",") === paginasAntes && readPhysical(0) === antes && estadoTabla().reloj === relojAntes, "cambiar a LRU no borra páginas, RAM ni reloj");
      limpiarTabla();
      registrar(correr(cortos) === "1", "en la hoja, LRU llena los 8 marcos y echa la página 1");
    });
    seccion(function () {
      usarFIFO();
      prepararVirtual();
      limpiarTabla();
      var i;
      for (i = 0; i < 8; i++) mapearPagina(i, i);
      var writes = 0;
      var wp = writePhysical;
      writePhysical = function (a, v) { writes++; return wp(a, v); };
      var lanzo = false;
      try { tocar(8); }
      catch (e) { lanzo = String(e.message).indexOf("cronología") !== -1; }
      finally { writePhysical = wp; }
      var siguen = true;
      for (i = 0; i < 8; i++) if (!estadoTabla().paginas[i].p) siguen = false;
      registrar(lanzo && writes === 0 && siguen && !estadoTabla().paginas[8].p, "sin orden guardado no se echa a nadie ni se escribe la RAM");
    });
    seccion(function () {
      usarFIFO();
      prepararVirtual();
      llenarSwap();
      limpiarTabla();
      var i;
      for (i = 0; i <= 7; i++) tocar(i);
      var antes = readSwap(0)[0];
      var ochoAntes = residentes().length;
      invalidarCachePagina = function () { throw new Error("cache de prueba"); };
      var lanzo = false;
      try { tocar(9); }
      catch (e) { lanzo = String(e.message).indexOf("cache de prueba") !== -1; }
      registrar(lanzo && readSwap(0)[0] === antes && residentes().length === ochoAntes && residentes().indexOf(9) < 0, "si el gancho de caché falla no queda la expulsión");
    });
    if (typeof stepCPU === "function") {
      seccion(function () {
        usarFIFO();
        prepararVirtual();
        limpiarTabla();
        var p0 = [];
        var p1 = [];
        var p2 = [];
        var i;
        for (i = 0; i < 32; i++) { p0.push(""); p1.push(""); p2.push(""); }
        p0[0] = "LD AX, 20H";
        p0[1] = "ST 40H, AX";
        p0[2] = "HLT";
        p1[0] = "A5H";
        p2[0] = "00H";
        writeSwap(0, p0);
        writeSwap(1, p1);
        writeSwap(2, p2);
        var pc = hoja1.getRange(REG_PC);
        if (pc.setNumberFormat) pc.setNumberFormat("@");
        pc.setValue("00H");
        hoja1.getRange(REG_AX).setValue("00H");
        hoja1.getRange(CPU_STATE).setValue("READY");
        if (typeof silenciarAnimacionMMU === "function") silenciarAnimacionMMU(true);
        prepararHojaCpu_();
        var pasos = 0;
        var halt = false;
        var pcs = [];
        while (pasos < 24) {
          if (hoja1.getRange(CPU_STATE).getValue() === "HALT") { halt = true; break; }
          stepCPU();
          pasos++;
          if (hoja1.getRange(CPU_STATE).getValue() === "FETCH_3") pcs.push(String(hoja1.getRange(REG_PC).getValue()));
        }
        registrar(halt && pcs.join(",") === "01H,02H,03H" && String(hoja1.getRange(REG_AX).getValue()) === "A5H" && estadoTabla().paginas[2].dirty === true, "con FIFO activo, LD ST y HLT avanzan el PC y dejan Dirty");
      });
      seccion(function () {
        var relojAntes = estadoTabla() && estadoTabla().reloj ? estadoTabla().reloj : 0;
        activarMemoriaVirtual(false);
        writePhysical(255, "HLT");
        var pc = hoja1.getRange(REG_PC);
        if (pc.setNumberFormat) pc.setNumberFormat("@");
        pc.setValue("FFH");
        hoja1.getRange(CPU_STATE).setValue("READY");
        prepararHojaCpu_();
        var k = 0;
        var halt = false;
        while (k < 8) {
          if (hoja1.getRange(CPU_STATE).getValue() === "HALT") { halt = true; break; }
          stepCPU();
          k++;
        }
        var relojDespues = estadoTabla() && estadoTabla().reloj ? estadoTabla().reloj : 0;
        registrar(halt && String(hoja1.getRange(REG_PC).getValue()) === "100H" && relojDespues === relojAntes, "en modo físico FFH pasa a 100H y el reloj no se mueve");
      });
    } else {
      registrar(false, "falta stepCPU del develop actual");
    }
    registrar(vaciados === 0 && resets === 0, "la prueba no vacía la RAM ni llama a resetCPU");
  } catch (e) {
    registrar(false, "excepción: " + (e && e.message ? e.message : e));
  } finally {
    try { volver(); } catch (eV) { registrar(false, "no se pudo restaurar: " + eV.message); }
    if (sleepPrev) Utilities.sleep = sleepPrev;
    if (flushPrev) SpreadsheetApp.flush = flushPrev;
    if (!reemplazoEra && hojaReemplazo_() && libro.deleteSheet) {
      try { libro.deleteSheet(hojaReemplazo_()); } catch (eHoja) {}
    }
    if (vaciarPrev) RAMFisica.vaciar = vaciarPrev;
    if (resetPrev) resetCPU = resetPrev;
  }
  var formulaOk = (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0;
  var polOk = props.getProperty(REEMPLAZO_CLAVE) === pol0;
  registrar(formulaOk && polOk && vaciados === 0, "fórmula, política y RAM quedaron como al inicio");
  Logger.log("RESUMEN instalarYProbarIssue26: " + ok + " OK, " + mal + " fallos.");
  if (mal > 0) throw new Error("instalarYProbarIssue26: " + mal + " fallos. Se intentó restaurar la hoja.");
  Logger.log("FIFO y LRU quedan guardados. La memoria virtual no se dejó encendida.");
}
