// MMU.gs
// Tabla de 16 páginas y traducción virtual → física. Issue 24.
// Copia personal de @Gunter310. Hoja propia "TablaPaginas".
// No carga páginas, no usa el swap y no cambia el ciclo de la CPU:
// fetch, LD y ST siguen en direcciones físicas hasta que el issue 25
// conecte esta fachada. Si la página no está presente, se lanza PageFault
// y no se toca la RAM.
//
// Dirección 0..511, o HEX con H (01FH, 020H, 1FFH).
// El número 20 es la dirección 20. El texto "20" no es una dirección.
// VPN = dirección >> 5 (0..15). Desplazamiento = dirección & 31.
// Física = PFN * 32 + desplazamiento, con PFN 0..7 y resultado 0..255.

var MMU = (function () {
  var HOJA = "TablaPaginas";
  var NOTA = "TABLAPAGINAS-v1";
  var CLAVE = "TABLAPAGINAS_ESTADO_v1";
  var FILA0 = 3;
  var FILA_TRA = 22;

  function libro_() {
    if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) {
      throw new Error("MMU: SpreadsheetApp no está disponible.");
    }
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    if (!libro) throw new Error("MMU: no hay un libro activo.");
    return libro;
  }

  function entero_(n, min, max) {
    return typeof n === "number" && n === n && n !== Infinity && n !== -Infinity && Math.floor(n) === n && n >= min && n <= max;
  }

  function validarDireccion_(addr) {
    if (typeof addr === "number") {
      if (!entero_(addr, 0, 511)) throw new Error("MMU: dirección virtual fuera de 0..511.");
      return addr + 0;
    }
    if (typeof addr === "string") {
      var texto = addr.trim();
      if (!/^[0-9A-Fa-f]{1,3}H$/.test(texto)) {
        throw new Error("MMU: dirección de texto rechazada (" + addr + "). Use un entero 0..511 o HEX con H, como 01FH.");
      }
      var n = parseInt(texto.substring(0, texto.length - 1), 16);
      if (!entero_(n, 0, 511)) throw new Error("MMU: dirección HEX fuera de 0..511 (" + texto + ").");
      return n;
    }
    throw new Error("MMU: tipo de dirección no admitido.");
  }

  function validarVpn_(vpn) {
    if (!entero_(vpn, 0, 15)) throw new Error("MMU: VPN fuera de 0..15.");
    return vpn + 0;
  }

  function validarPfn_(pfn) {
    if (!entero_(pfn, 0, 7)) throw new Error("MMU: PFN fuera de 0..7.");
    return pfn + 0;
  }

  function hex3_(n) {
    var s = (n >>> 0).toString(16).toUpperCase();
    while (s.length < 3) s = "0" + s;
    return s + "H";
  }

  function hex2_(n) {
    var s = (n >>> 0).toString(16).toUpperCase();
    if (s.length < 2) s = "0" + s;
    return s + "H";
  }

  function bin9_(n) {
    var s = (n >>> 0).toString(2);
    while (s.length < 9) s = "0" + s;
    return s;
  }

  function vacia_() {
    var paginas = [];
    var i;
    for (i = 0; i < 16; i++) paginas.push({ p: false, pfn: null, dirty: false, ref: false });
    return { version: 1, paginas: paginas };
  }

  function clonar_(estado) {
    return JSON.parse(JSON.stringify(estado));
  }

  function estadoValido_(obj) {
    if (!obj || obj.version !== 1 || !obj.paginas || obj.paginas.length !== 16) return false;
    var i;
    var usados = {};
    for (i = 0; i < 16; i++) {
      var p = obj.paginas[i];
      if (!p || typeof p.p !== "boolean" || typeof p.dirty !== "boolean" || typeof p.ref !== "boolean") return false;
      if (p.p) {
        if (!entero_(p.pfn, 0, 7)) return false;
        if (usados[p.pfn]) return false;
        usados[p.pfn] = true;
      } else if (p.pfn !== null) return false;
    }
    return true;
  }

  function propiedades_() {
    if (typeof PropertiesService === "undefined" || !PropertiesService.getDocumentProperties) {
      throw new Error("MMU: PropertiesService no está disponible. No se escribió nada.");
    }
    return PropertiesService.getDocumentProperties();
  }

  function cargar_() {
    var raw = propiedades_().getProperty(CLAVE);
    if (!raw) return null;
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { obj = null; }
    if (!estadoValido_(obj)) throw new Error("MMU: el estado guardado no es válido. No se escribió nada.");
    return obj;
  }

  function guardar_(estado) {
    propiedades_().setProperty(CLAVE, JSON.stringify(estado));
  }

  function hojaSi_() {
    return libro_().getSheetByName(HOJA);
  }

  function esNuestra_(hoja) {
    if (!hoja) return false;
    try { return String(hoja.getRange(1, 1).getNote() || "") === NOTA; } catch (e) { return false; }
  }

  function zonaVacia_(hoja) {
    var valores = hoja.getRange(1, 1, 22, 6).getValues();
    var formulas = hoja.getRange(1, 1, 22, 6).getFormulas();
    var r, c;
    for (r = 0; r < valores.length; r++) {
      for (c = 0; c < valores[r].length; c++) {
        if (String(valores[r][c]) !== "" || String(formulas[r][c] || "") !== "") return false;
      }
    }
    return true;
  }

  function textoPfn_(pfn) {
    return pfn === null ? "—" : pfn;
  }

  function filaDe_(vpn) {
    return FILA0 + vpn;
  }

  function pintarTabla_(hoja, estado) {
    var i;
    for (i = 0; i < 16; i++) {
      var p = estado.paginas[i];
      var fila = filaDe_(i);
      hoja.getRange(fila, 1).setValue(i);
      hoja.getRange(fila, 2).setValue(p.p ? 1 : 0);
      var pfn = hoja.getRange(fila, 3);
      if (pfn.setNumberFormat) pfn.setNumberFormat("@");
      pfn.setValue(textoPfn_(p.pfn));
      hoja.getRange(fila, 4).setValue(p.dirty ? 1 : 0);
      hoja.getRange(fila, 5).setValue(p.ref ? 1 : 0);
      var uso = hoja.getRange(fila, 6);
      if (uso.setNumberFormat) uso.setNumberFormat("@");
      uso.setValue("—");
    }
  }

  function escribirCabecera_(hoja) {
    var titulo = hoja.getRange(1, 1);
    titulo.setValue("Tabla de páginas");
    if (titulo.setNote) titulo.setNote(NOTA);
    var cab = [["VPN", "P", "PFN", "Dirty", "Ref", "Último uso"]];
    hoja.getRange(2, 1, 1, 6).setValues(cab);
    hoja.getRange(20, 1).setValue("Traducción");
    hoja.getRange(21, 1, 1, 6).setValues([["Virtual", "Binario", "VPN", "Desplazamiento", "PFN", "Física"]]);
  }

  function instalar_() {
    var libro = libro_();
    var hoja = libro.getSheetByName(HOJA);
    var estado = null;
    try { estado = cargar_(); } catch (e) { throw e; }
    if (!hoja) {
      hoja = libro.insertSheet(HOJA);
      escribirCabecera_(hoja);
      if (!estado) estado = vacia_();
      pintarTabla_(hoja, estado);
      guardar_(estado);
      return hoja;
    }
    if (!esNuestra_(hoja)) {
      if (!zonaVacia_(hoja)) throw new Error("MMU: la hoja TablaPaginas existe y no es de este módulo. No se escribió nada.");
      escribirCabecera_(hoja);
      if (!estado) estado = vacia_();
      pintarTabla_(hoja, estado);
      guardar_(estado);
      return hoja;
    }
    if (!estado) {
      estado = vacia_();
      pintarTabla_(hoja, estado);
      guardar_(estado);
    }
    return hoja;
  }

  function exigir_() {
    var hoja = hojaSi_();
    if (!hoja || !esNuestra_(hoja)) throw new Error("MMU: ejecuta instalarYProbarIssue24 para crear la tabla.");
    var estado = cargar_();
    if (!estado) throw new Error("MMU: falta el estado de la tabla. Ejecuta instalarYProbarIssue24.");
    return { hoja: hoja, estado: estado };
  }

  function leerFila_(hoja, vpn) {
    var fila = filaDe_(vpn);
    return {
      p: Number(hoja.getRange(fila, 2).getValue()) === 1,
      pfnTexto: String(hoja.getRange(fila, 3).getValue()),
      dirty: Number(hoja.getRange(fila, 4).getValue()) === 1,
      ref: Number(hoja.getRange(fila, 5).getValue()) === 1
    };
  }

  function coincide_(hoja, estado) {
    var i;
    for (i = 0; i < 16; i++) {
      var visto = leerFila_(hoja, i);
      var guardado = estado.paginas[i];
      var pfn = guardado.pfn === null ? "—" : String(guardado.pfn);
      if (visto.p !== guardado.p || visto.pfnTexto !== pfn || visto.dirty !== guardado.dirty || visto.ref !== guardado.ref) {
        return false;
      }
    }
    return true;
  }

  function resaltar_(hoja, vpn) {
    var i;
    for (i = 0; i < 16; i++) hoja.getRange(filaDe_(i), 1, 1, 6).setBackground(null);
    hoja.getRange(filaDe_(vpn), 1, 1, 6).setBackground("#FFF59D");
  }

  function mostrarTraduccion_(hoja, n, vpn, offset, pfn, fisica, fallo) {
    hoja.getRange(FILA_TRA, 1, 1, 6).setValues([[
      hex3_(n),
      bin9_(n),
      vpn,
      offset,
      fallo ? "—" : pfn,
      fallo ? "fallo" : hex2_(fisica)
    ]]);
  }

  function sincronizar_(pfn, campo, valor) {
    if (typeof MarcosRAM === "undefined" || !MarcosRAM || !MarcosRAM.establecer || !MarcosRAM.leer) return;
    try {
      MarcosRAM.leer(pfn, campo);
    } catch (e) {
      return;
    }
    MarcosRAM.establecer(pfn, campo, valor);
  }

  function publicar_(ctx, vpn) {
    var p = ctx.estado.paginas[vpn];
    var fila = filaDe_(vpn);
    ctx.hoja.getRange(fila, 2).setValue(p.p ? 1 : 0);
    var celda = ctx.hoja.getRange(fila, 3);
    if (celda.setNumberFormat) celda.setNumberFormat("@");
    celda.setValue(textoPfn_(p.pfn));
    ctx.hoja.getRange(fila, 4).setValue(p.dirty ? 1 : 0);
    ctx.hoja.getRange(fila, 5).setValue(p.ref ? 1 : 0);
  }

  function buscar_(direccion) {
    var n = validarDireccion_(direccion);
    var vpn = n >> 5;
    var offset = n & 31;
    var ctx = exigir_();
    if (!coincide_(ctx.hoja, ctx.estado)) {
      throw new Error("MMU: la tabla y el estado guardado no coinciden. No se escribió nada.");
    }
    var pagina = ctx.estado.paginas[vpn];
    resaltar_(ctx.hoja, vpn);
    if (!pagina.p) {
      mostrarTraduccion_(ctx.hoja, n, vpn, offset, null, null, true);
      var fallo = new Error("PageFault: la página " + vpn + " no está presente.");
      fallo.name = "PageFault";
      fallo.pageFault = { vpn: vpn, direccion: n, desplazamiento: offset };
      throw fallo;
    }
    var fisica = pagina.pfn * 32 + offset;
    mostrarTraduccion_(ctx.hoja, n, vpn, offset, pagina.pfn, fisica, false);
    return { n: n, vpn: vpn, offset: offset, pfn: pagina.pfn, fisica: fisica, ctx: ctx };
  }

  function translate(direccion) {
    var r = buscar_(direccion);
    return { vpn: r.vpn, offset: r.offset, pfn: r.pfn, fisica: r.fisica, presente: true };
  }

  function fijarBits_(r, escritura) {
    var pagina = r.ctx.estado.paginas[r.vpn];
    pagina.ref = true;
    if (escritura) pagina.dirty = true;
    publicar_(r.ctx, r.vpn);
    guardar_(r.ctx.estado);
    if (escritura) sincronizar_(r.pfn, "dirty", true);
  }

  function leer_(direccion) {
    var r = buscar_(direccion);
    if (typeof readPhysical !== "function") throw new Error("MMU: falta readPhysical. No se actualizó Ref.");
    var dato = readPhysical(r.fisica);
    fijarBits_(r, false);
    return dato;
  }

  function escribir_(direccion, valor) {
    var r = buscar_(direccion);
    if (typeof writePhysical !== "function") throw new Error("MMU: falta writePhysical. No se actualizó Dirty.");
    writePhysical(r.fisica, valor);
    fijarBits_(r, true);
    return valor;
  }

  function mapear_(vpn, pfn) {
    var v = validarVpn_(vpn);
    var f = validarPfn_(pfn);
    var ctx = exigir_();
    if (!coincide_(ctx.hoja, ctx.estado)) throw new Error("MMU: la tabla y el estado guardado no coinciden. No se escribió nada.");
    var i;
    for (i = 0; i < 16; i++) {
      var otra = ctx.estado.paginas[i];
      if (i !== v && otra.p && otra.pfn === f) {
        throw new Error("MMU: el PFN " + f + " ya está usado por la VPN " + i + ". No se escribió nada.");
      }
    }
    var actual = ctx.estado.paginas[v];
    if (actual.p && actual.pfn !== f) {
      throw new Error("MMU: la VPN " + v + " ya está en el PFN " + actual.pfn + ". Libérela antes. No se escribió nada.");
    }
    if (actual.p && actual.pfn === f) return { vpn: v, pfn: f };
    actual.p = true;
    actual.pfn = f;
    publicar_(ctx, v);
    guardar_(ctx.estado);
    sincronizar_(f, "vpn", v);
    return { vpn: v, pfn: f };
  }

  function desmapear_(vpn) {
    var v = validarVpn_(vpn);
    var ctx = exigir_();
    if (!coincide_(ctx.hoja, ctx.estado)) throw new Error("MMU: la tabla y el estado guardado no coinciden. No se escribió nada.");
    var actual = ctx.estado.paginas[v];
    var pfn = actual.pfn;
    actual.p = false;
    actual.pfn = null;
    publicar_(ctx, v);
    guardar_(ctx.estado);
    if (pfn !== null) sincronizar_(pfn, "vpn", null);
    return { vpn: v, pfn: null, dirty: actual.dirty, ref: actual.ref };
  }

  function mismo_(a, b) {
    return a === b || (typeof a === "number" && typeof b === "number" && a !== a && b !== b);
  }

  function probar() {
    var libro = libro_();
    var hoja1 = (typeof SHEET_NAME !== "undefined") ? libro.getSheetByName(SHEET_NAME) : null;
    var ram = null;
    var mar = null;
    if (hoja1 && typeof RAM_START_ROW !== "undefined" && typeof RAM_START_COL !== "undefined") {
      var rango = hoja1.getRange(RAM_START_ROW, RAM_START_COL, 16, 16);
      ram = {
        valores: rango.getValues(),
        formulas: rango.getFormulas ? rango.getFormulas() : null,
        formatos: rango.getNumberFormats ? rango.getNumberFormats() : null,
        fondos: rango.getBackgrounds ? rango.getBackgrounds() : null
      };
      if (typeof REG_MAR !== "undefined") {
        var celdaMar = hoja1.getRange(REG_MAR);
        mar = { v: celdaMar.getValue(), f: celdaMar.getFormula ? celdaMar.getFormula() : "", fmt: celdaMar.getNumberFormat ? celdaMar.getNumberFormat() : "" };
      }
    }
    var anchos = [];
    var previa = hojaSi_();
    if (previa && !esNuestra_(previa) && !zonaVacia_(previa)) {
      throw new Error("MMU: la hoja TablaPaginas existe y no es de este módulo. No se escribió nada.");
    }
    instalar_();
    var hoja = exigir_().hoja;
    if (hoja.getColumnWidth) {
      var c;
      for (c = 1; c <= 6; c++) anchos.push(hoja.getColumnWidth(c));
    }
    var crudo = propiedades_().getProperty(CLAVE);
    var marcos = null;
    if (typeof MarcosRAM !== "undefined" && MarcosRAM && MarcosRAM.describir) {
      marcos = [];
      var m;
      for (m = 0; m < 8; m++) {
        try { marcos.push(MarcosRAM.describir(m)); } catch (eMarco) { marcos = null; break; }
      }
    }
    var ok = 0;
    var mal = 0;
    function registrar(bien, mensaje) {
      if (bien) { ok++; Logger.log("OK  " + mensaje); }
      else { mal++; Logger.log("FALLO  " + mensaje); }
    }
    Logger.log("MMU: hoja \"TablaPaginas\". El ciclo de la CPU no se desvía.");
    try {
      var ausente = false;
      try { translate("01FH"); } catch (eAus) {
        ausente = eAus.name === "PageFault" && eAus.pageFault && eAus.pageFault.vpn === 0 && eAus.pageFault.desplazamiento === 31;
      }
      registrar(ausente, "01FH ausente es VPN 0 desplazamiento 31 y lanza PageFault");
      mapear_(0, 1);
      instalar_();
      var t0 = translate(0);
      var t31 = translate("01FH");
      registrar(t0.vpn === 0 && t0.offset === 0 && t0.pfn === 1 && t0.fisica === 32, "0 con PFN 1 es la física 32");
      registrar(t31.vpn === 0 && t31.offset === 31 && t31.fisica === 63, "01FH con PFN 1 es la física 63");
      mapear_(1, 2);
      var t32 = translate("020H");
      registrar(t32.vpn === 1 && t32.offset === 0 && t32.pfn === 2 && t32.fisica === 64, "020H y el número 32 son la física 64");
      mapear_(15, 3);
      var t511 = translate("1FFH");
      registrar(t511.vpn === 15 && t511.offset === 31 && t511.pfn === 3 && t511.fisica === 127, "1FFH es la física 127");
      var rechazoDir = true;
      var malas = ["20", 512, -1, 1.5, "200H", "20h", ""];
      var i;
      for (i = 0; i < malas.length; i++) {
        var lanzo = false;
        try { translate(malas[i]); } catch (eDir) { lanzo = String(eDir.message).indexOf("MMU:") === 0; }
        if (!lanzo) rechazoDir = false;
      }
      registrar(rechazoDir && translate(20).direccion === undefined && translate(20).vpn === 0 && translate(20).offset === 20, "el número 20 es la dirección 20 y el texto \"20\" se rechaza");
      var dup = false;
      try { mapear_(2, 1); } catch (eDup) { dup = String(eDup.message).indexOf("ya está usado") !== -1; }
      registrar(dup && !exigir_().estado.paginas[2].p, "un PFN repetido se rechaza sin mapear");
      var antesRam = (typeof readPhysical === "function") ? readPhysical(10) : null;
      var fallo = false;
      var sinRam = true;
      try { leer_(64); } catch (ePf) { fallo = ePf.name === "PageFault" && ePf.pageFault && ePf.pageFault.vpn === 2; }
      if (typeof readPhysical === "function" && readPhysical(10) !== antesRam) sinRam = false;
      registrar(fallo && sinRam && exigir_().estado.paginas[2].ref === false, "página ausente lanza PageFault y no toca la RAM ni Ref");
      var dato = leer_(0);
      registrar(exigir_().estado.paginas[0].ref === true && exigir_().estado.paginas[0].dirty === false, "una lectura presente pone Ref y no Dirty");
      escribir_(0, dato);
      registrar(exigir_().estado.paginas[0].dirty === true && exigir_().estado.paginas[0].ref === true, "una escritura presente pone Dirty y Ref");
      var ref1 = exigir_().estado.paginas[0].ref;
      var dirty1 = exigir_().estado.paginas[0].dirty;
      leer_(0);
      registrar(exigir_().estado.paginas[0].ref === ref1 && exigir_().estado.paginas[0].dirty === dirty1, "repetir la lectura no limpia Dirty");
      var sucia = exigir_().estado.paginas[0].dirty;
      desmapear_(0);
      registrar(exigir_().estado.paginas[0].p === false && exigir_().estado.paginas[0].pfn === null && exigir_().estado.paginas[0].dirty === sucia, "liberar la página no inventa un Dirty limpio");
      var malo = false;
      try { mapear_(16, 0); } catch (eV) { malo = String(eV.message).indexOf("MMU:") === 0; }
      try { mapear_(3, 8); } catch (eP) { if (String(eP.message).indexOf("MMU:") !== 0) malo = false; }
      registrar(malo && !exigir_().estado.paginas[3].p, "VPN o PFN inválidos no escriben");
    } catch (e) {
      registrar(false, "excepción: " + e.message);
    } finally {
      if (crudo) propiedades_().setProperty(CLAVE, crudo);
      else if (propiedades_().deleteProperty) propiedades_().deleteProperty(CLAVE);
      var restaurado = cargar_();
      if (restaurado) pintarTabla_(hojaSi_(), restaurado);
      else instalar_();
      if (marcos && MarcosRAM.establecer) {
        var k;
        for (k = 0; k < marcos.length; k++) {
          try {
            MarcosRAM.establecer(k, "vpn", marcos[k].vpn);
            MarcosRAM.establecer(k, "dirty", marcos[k].dirty);
          } catch (eRest) {}
        }
      }
      if (ram && hoja1) {
        var rr, cc;
        for (rr = 0; rr < 16; rr++) {
          for (cc = 0; cc < 16; cc++) {
            var celda = hoja1.getRange(RAM_START_ROW + rr, RAM_START_COL + cc);
            if (celda.setNumberFormat && ram.formatos) celda.setNumberFormat(ram.formatos[rr][cc]);
            if (ram.formulas && ram.formulas[rr][cc]) celda.setFormula(ram.formulas[rr][cc]);
            else celda.setValue(ram.valores[rr][cc]);
            if (celda.setBackground && ram.fondos) celda.setBackground(ram.fondos[rr][cc]);
          }
        }
      }
    }
    registrar(true, "esta prueba restaura la tabla, los marcos y la RAM");
    Logger.log("RESUMEN instalarYProbarIssue24: " + ok + " OK, " + mal + " fallos.");
    if (mal > 0) throw new Error("instalarYProbarIssue24: " + mal + " fallos. Se intentó restaurar la tabla y la RAM.");
    Logger.log("Tabla lista. El ciclo físico de la CPU no fue desviado. PageFault queda para el issue 25.");
  }

  return {
    instalar: instalar_,
    translate: translate,
    leer: leer_,
    escribir: escribir_,
    mapear: mapear_,
    desmapear: desmapear_,
    probar: probar
  };
})();

function translate(direccion) { return MMU.translate(direccion); }
function leerMMU(direccion) { return MMU.leer(direccion); }
function escribirMMU(direccion, valor) { return MMU.escribir(direccion, valor); }
function mapearPagina(vpn, pfn) { return MMU.mapear(vpn, pfn); }
function desmapearPagina(vpn) { return MMU.desmapear(vpn); }
function instalarYProbarIssue24() { return MMU.probar(); }
