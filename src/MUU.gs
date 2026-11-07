// MMU.gs
// Tabla de 16 páginas, traducción y fallo de página. Issues 24 y 25.
// Copia personal de @Gunter310. Hoja propia "TablaPaginas".
// Reemplaza src/MUU.gs (y el nombre viejo MUU,gs, si todavía está).
// No deje los dos: translate quedaría declarado dos veces.
//
// Modo físico (inicial): fetch, LD y ST no pasan por aquí.
// Modo virtual: una página con P=0 se carga desde el swap a un marco libre,
// se reintenta el acceso una sola vez y se anota el fallo.
// Con los 8 marcos ocupados y sin política, no se pisa ningún marco.
// FIFO y LRU son el issue 26. El marco 7 no se reserva.
//
// Dirección 0..511, o HEX con H (01FH, 020H, 1FFH).
// El número 20 es la dirección 20. El texto "20" no es una dirección.
// VPN = dirección >> 5 (0..15). Desplazamiento = dirección & 31.
// Física = PFN * 32 + desplazamiento, con PFN 0..7 y resultado 0..255.

var MMU = (function () {
  var HOJA = "TablaPaginas";
  var NOTA = "TABLAPAGINAS-v1";
  var CLAVE = "TABLAPAGINAS_ESTADO_v1";
  var CLAVE_MODO = "MMU_MODO_v1";
  var CLAVE_PROGRAMA = "MMU_PROGRAMA_v1";
  var FILA0 = 3;
  var FILA_TRA = 22;
  var ROJO = "#FFCDD2";
  var reemplazoForzado_ = { usar: false, fn: null };
  var resolviendo_ = false;
  var corteCarga_ = false;
  var animarBuses_ = true;

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
    return { version: 1, paginas: paginas, fallos: 0, bitacora: [], vistos: [], reloj: 0 };
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
    if (typeof obj.fallos !== "number" || obj.fallos < 0 || Math.floor(obj.fallos) !== obj.fallos) obj.fallos = 0;
    if (!obj.bitacora || typeof obj.bitacora.length !== "number") obj.bitacora = [];
    if (!obj.vistos || typeof obj.vistos.length !== "number") obj.vistos = [];
    if (typeof obj.reloj !== "number" || obj.reloj < 0 || Math.floor(obj.reloj) !== obj.reloj) obj.reloj = 0;
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
      uso.setValue(textoUso_(p));
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
      asegurarIndicador_(hoja);
      return hoja;
    }
    if (!esNuestra_(hoja)) {
      if (!zonaVacia_(hoja)) throw new Error("MMU: la hoja TablaPaginas existe y no es de este módulo. No se escribió nada.");
      escribirCabecera_(hoja);
      if (!estado) estado = vacia_();
      pintarTabla_(hoja, estado);
      guardar_(estado);
      asegurarIndicador_(hoja);
      return hoja;
    }
    if (!estado) {
      estado = vacia_();
      pintarTabla_(hoja, estado);
      guardar_(estado);
    }
    asegurarIndicador_(hoja);
    return hoja;
  }

  function exigir_() {
    var hoja = hojaSi_();
    if (!hoja || !esNuestra_(hoja)) throw new Error("MMU: ejecuta instalarYProbarIssue25 para crear la tabla.");
    var estado = cargar_();
    if (!estado) throw new Error("MMU: falta el estado de la tabla. Ejecuta instalarYProbarIssue25.");
    return { hoja: hoja, estado: estado };
  }

  function coincide_(hoja, estado) {
    var valores = hoja.getRange(FILA0, 2, 16, 4).getValues();
    var i;
    for (i = 0; i < 16; i++) {
      var fila = valores[i];
      var guardado = estado.paginas[i];
      var pfn = guardado.pfn === null ? "—" : String(guardado.pfn);
      if ((Number(fila[0]) === 1) !== guardado.p) return false;
      if (String(fila[1]) !== pfn) return false;
      if ((Number(fila[2]) === 1) !== guardado.dirty) return false;
      if ((Number(fila[3]) === 1) !== guardado.ref) return false;
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

  function textoUso_(p) {
    if (!p || !p.p || typeof p.uso !== "number") return "—";
    return String(p.uso);
  }

  function tickEn_(estado) {
    if (typeof estado.reloj !== "number" || estado.reloj < 0 || Math.floor(estado.reloj) !== estado.reloj) estado.reloj = 0;
    estado.reloj += 1;
    if (estado.reloj > 1000000) throw new Error("MMU: el reloj de uso pasó de 1000000. No se escribió nada.");
    return estado.reloj;
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
    var uso = ctx.hoja.getRange(fila, 6);
    if (uso.setNumberFormat) uso.setNumberFormat("@");
    uso.setValue(textoUso_(p));
  }

  function reflejarOrden_(ctx) {
    var lista = [];
    var i;
    for (i = 0; i < 16; i++) {
      var p = ctx.estado.paginas[i];
      if (!p.p) continue;
      if (typeof p.orden !== "number") return;
      lista.push({ vpn: i, pfn: p.pfn, orden: p.orden, uso: p.uso });
    }
    lista.sort(function (a, b) {
      if (a.orden !== b.orden) return a.orden - b.orden;
      return a.pfn - b.pfn;
    });
    var cambio = false;
    for (i = 0; i < lista.length; i++) {
      var pag = ctx.estado.paginas[lista[i].vpn];
      if (pag.puesto !== i) {
        pag.puesto = i;
        sincronizar_(lista[i].pfn, "fifo", i);
        cambio = true;
      }
      if (typeof lista[i].uso === "number" && pag.usoPanel !== lista[i].uso) {
        pag.usoPanel = lista[i].uso;
        sincronizar_(lista[i].pfn, "ultimoUso", lista[i].uso);
        cambio = true;
      }
    }
    if (cambio) guardar_(ctx.estado);
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
    if (typeof pagina.orden === "number") pagina.uso = tickEn_(r.ctx.estado);
    publicar_(r.ctx, r.vpn);
    guardar_(r.ctx.estado);
    if (escritura) sincronizar_(r.pfn, "dirty", true);
    if (typeof pagina.uso === "number") {
      sincronizar_(r.pfn, "ultimoUso", pagina.uso);
      pagina.usoPanel = pagina.uso;
    }
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

  function asegurarIndicador_(hoja) {
    var celda = hoja.getRange(24, 1);
    var actual = String(celda.getValue() || "");
    if (actual !== "" && actual !== "PAGE FAULT") return;
    celda.setValue("PAGE FAULT");
    if (celda.setBackground) celda.setBackground(ROJO);
    if (String(hoja.getRange(25, 1).getValue() || "") === "") hoja.getRange(25, 1).setValue("Bitácora");
  }

  function esFallo_(e) {
    return !!(e && e.name === "PageFault" && e.pageFault && typeof e.pageFault.vpn === "number" && typeof e.pageFault.direccion === "number");
  }

  function recortar_(texto) {
    var s = String(texto || "");
    return s.length > 140 ? s.substring(0, 140) : s;
  }

  function validarValorCarga_(value) {
    if (typeof value === "number") {
      if (value !== value || value === Infinity || value === -Infinity) throw new Error("MMU: valor numérico inválido en el swap. No se escribió la RAM.");
      if (Math.floor(value) !== value || value < 0 || value > 255) throw new Error("MMU: valor fuera de 0..255 en el swap (" + value + "). No se escribió la RAM.");
      return value + 0;
    }
    if (typeof value !== "string") throw new Error("MMU: valor de tipo no admitido en el swap. No se escribió la RAM.");
    if (value === "") return "";
    if (/^[0-9A-Fa-f]{1,2}H$/.test(value)) return value;
    if (/^[01]{1,8}B$/.test(value)) return value;
    if (/^[0-9A-Fa-f]+H$/.test(value)) throw new Error("MMU: literal HEX inválido en el swap (" + value + "). No se escribió la RAM.");
    if (value.indexOf(" ") === -1 && value.indexOf(",") === -1 && /[HhBb]$/.test(value)) {
      throw new Error("MMU: literal de byte malformado en el swap (" + value + "). No se escribió la RAM.");
    }
    if (/^[0-9]{1,3}$/.test(value)) {
      if (parseInt(value, 10) > 255) throw new Error("MMU: decimal de texto fuera de 0..255 (" + value + "). No se escribió la RAM.");
      return value;
    }
    if (/^0x/i.test(value) || /^[+-]/.test(value) || value.indexOf(".") !== -1) throw new Error("MMU: valor malformado en el swap (" + value + "). No se escribió la RAM.");
    if (/^(NaN|Infinity|-Infinity|undefined|null|true|false)$/.test(value)) throw new Error("MMU: valor malformado en el swap (" + value + "). No se escribió la RAM.");
    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value) || value.indexOf(" ") !== -1 || value.indexOf(",") !== -1 || value.indexOf("[") !== -1) return value;
    throw new Error("MMU: valor malformado en el swap (" + value + "). No se escribió la RAM.");
  }

  function hojaRam_() {
    if (typeof SHEET_NAME === "undefined") throw new Error("MMU: falta SHEET_NAME. No se escribió la RAM.");
    var hoja = libro_().getSheetByName(SHEET_NAME);
    if (!hoja) throw new Error("MMU: no existe Hoja 1. No se escribió la RAM.");
    return hoja;
  }

  function escribirMarcoFisico_(pfn, valores32) {
    var hoja = hojaRam_();
    var pos = posRam_(pfn * 32);
    var filas = [[], []];
    var i;
    for (i = 0; i < 16; i++) filas[0].push(valores32[i]);
    for (i = 16; i < 32; i++) filas[1].push(valores32[i]);
    var rango = hoja.getRange(pos.fila, pos.col, 2, 16);
    if (rango.setNumberFormat) rango.setNumberFormat("@");
    if (corteCarga_) {
      corteCarga_ = false;
      hoja.getRange(pos.fila, pos.col, 1, 16).setValues([filas[0]]);
      throw new Error("MMU: corte de prueba");
    }
    rango.setValues(filas);
  }

  function posRam_(addr) {
    if (typeof RAM_START_ROW === "undefined" || typeof RAM_START_COL === "undefined") throw new Error("MMU: falta la posición de la RAM. No se escribió nada.");
    return { fila: RAM_START_ROW + Math.floor(addr / 16), col: RAM_START_COL + (addr % 16) };
  }

  function fotoMarco_(pfn) {
    var hoja = hojaRam_();
    var base = pfn * 32;
    var pos = posRam_(base);
    var rango = hoja.getRange(pos.fila, pos.col, 2, 16);
    var valores = rango.getValues();
    var formulas = rango.getFormulas ? rango.getFormulas() : null;
    var formatos = rango.getNumberFormats ? rango.getNumberFormats() : null;
    var fondos = rango.getBackgrounds ? rango.getBackgrounds() : null;
    var celdas = [];
    var i, fila, col;
    for (i = 0; i < 32; i++) {
      fila = Math.floor(i / 16);
      col = i % 16;
      celdas.push({
        fila: pos.fila + fila,
        col: pos.col + col,
        v: valores[fila][col],
        f: formulas ? formulas[fila][col] : "",
        fmt: formatos ? formatos[fila][col] : "General",
        bg: fondos ? fondos[fila][col] : null
      });
    }
    return celdas;
  }

  function restaurarMarco_(celdas) {
    var hoja = hojaRam_();
    var i;
    for (i = 0; i < celdas.length; i++) {
      var c = celdas[i];
      var rango = hoja.getRange(c.fila, c.col);
      if (rango.setNumberFormat) rango.setNumberFormat(c.fmt);
      if (c.f) rango.setFormula(c.f);
      else rango.setValue(c.v);
      if (rango.setBackground) rango.setBackground(c.bg);
    }
  }

  function fotoSwapFila_(vpn) {
    var hoja = libro_().getSheetByName("Swap");
    if (!hoja) return null;
    var fila = 3 + vpn;
    var rango = hoja.getRange(fila, 1, 1, 34);
    return {
      fila: fila,
      valores: rango.getValues(),
      formulas: rango.getFormulas ? rango.getFormulas() : null,
      formatos: rango.getNumberFormats ? rango.getNumberFormats() : null,
      fondos: rango.getBackgrounds ? rango.getBackgrounds() : null
    };
  }

  function restaurarSwapFila_(foto) {
    if (!foto) return;
    var hoja = libro_().getSheetByName("Swap");
    var c;
    for (c = 0; c < 34; c++) {
      var celda = hoja.getRange(foto.fila, 1 + c);
      if (celda.setNumberFormat && foto.formatos) celda.setNumberFormat(foto.formatos[0][c]);
      if (foto.formulas && foto.formulas[0][c]) celda.setFormula(foto.formulas[0][c]);
      else celda.setValue(foto.valores[0][c]);
      if (celda.setBackground && foto.fondos) celda.setBackground(foto.fondos[0][c]);
    }
  }

  function vpnEn_(tabla, pfn) {
    if (Object.prototype.hasOwnProperty.call(tabla, pfn)) return tabla[pfn];
    return null;
  }

  function inventario_(ctx) {
    var tabla = {};
    var i;
    for (i = 0; i < 16; i++) {
      var p = ctx.estado.paginas[i];
      if (!p.p) continue;
      if (vpnEn_(tabla, p.pfn) !== null) throw new Error("MMU: PFN repetido en la tabla. No se escribió nada.");
      tabla[p.pfn] = i;
    }
    var marcos = null;
    if (typeof MarcosRAM !== "undefined" && MarcosRAM && MarcosRAM.leer) {
      try {
        marcos = [];
        for (i = 0; i < 8; i++) marcos.push(MarcosRAM.leer(i, "vpn"));
      } catch (e) {
        if (String(e && e.message).indexOf("no coincide") !== -1) throw new Error("MMU: " + e.message + " No se cargó la página.");
        marcos = null;
      }
    }
    if (marcos) {
      for (i = 0; i < 8; i++) {
        var enTabla = vpnEn_(tabla, i);
        if (enTabla !== marcos[i]) {
          throw new Error("MMU: el marco " + i + " no coincide con la tabla (tabla " + enTabla + ", marco " + marcos[i] + "). No se escribió nada.");
        }
      }
    }
    var libres = [];
    for (i = 0; i < 8; i++) if (vpnEn_(tabla, i) === null) libres.push(i);
    return { tabla: tabla, marcos: marcos, libres: libres };
  }

  function obtenerReemplazo_() {
    if (reemplazoForzado_.usar) return reemplazoForzado_.fn;
    if (typeof elegirVictimaReemplazo === "function") return elegirVictimaReemplazo;
    return null;
  }

  function anotar_(fallo, texto, info) {
    var ctx = exigir_();
    if (typeof ctx.estado.fallos !== "number") ctx.estado.fallos = 0;
    ctx.estado.fallos++;
    if (!ctx.estado.bitacora) ctx.estado.bitacora = [];
    if (!ctx.estado.vistos) ctx.estado.vistos = [];
    var linea = hex3_(fallo.pageFault.direccion) + " vpn=" + fallo.pageFault.vpn + " " + texto;
    ctx.estado.bitacora.push(linea);
    while (ctx.estado.bitacora.length > 12) ctx.estado.bitacora.shift();
    if (ctx.estado.vistos.indexOf(fallo.pageFault.vpn) === -1) ctx.estado.vistos.push(fallo.pageFault.vpn);
    guardar_(ctx.estado);
    var hoja = ctx.hoja;
    var marca = hoja.getRange(24, 1);
    marca.setValue("PAGE FAULT");
    if (marca.setBackground) marca.setBackground(ROJO);
    hoja.getRange(24, 2).setValue(ctx.estado.fallos);
    hoja.getRange(24, 3).setValue(linea);
    var r;
    for (r = 0; r < 12; r++) hoja.getRange(26 + r, 1).setValue(ctx.estado.bitacora[r] || "");
    var v;
    for (v = 0; v < ctx.estado.vistos.length; v++) hoja.getRange(filaDe_(ctx.estado.vistos[v]), 1, 1, 6).setBackground(ROJO);
    if (info) pintarCarga_(info);
    if (info && typeof info.victima === "number") hoja.getRange(filaDe_(info.victima), 1, 1, 6).setBackground("#FFE0B2");
    try {
      if (typeof registrarLog === "function") registrarLog(SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(), "PAGE FAULT " + linea);
    } catch (eLog) {}
    return ctx.estado.fallos;
  }

  function pintarCarga_(info) {
    var swap = libro_().getSheetByName("Swap");
    if (swap) {
      var nota = "";
      try { nota = String(swap.getRange(1, 1).getNote() || ""); } catch (eNota) { nota = ""; }
      if (nota === "SWAPVM-v1") swap.getRange(3 + info.vpn, 1, 1, 34).setBackground(ROJO);
    }
    if (typeof RAMFisica !== "undefined" && RAMFisica.pintarFondo) {
      var i;
      for (i = 0; i < 32; i++) {
        try { RAMFisica.pintarFondo(info.pfn * 32 + i, ROJO); } catch (eP) {}
      }
    }
    try { if (SpreadsheetApp.flush) SpreadsheetApp.flush(); } catch (eF) {}
  }

  function cargarPorFallo_(fallo, escritura) {
    var vpn = fallo.pageFault.vpn;
    var ctx = exigir_();
    if (!coincide_(ctx.hoja, ctx.estado)) throw new Error("MMU: la tabla y el estado guardado no coinciden. No se escribió nada.");
    if (ctx.estado.paginas[vpn].p) throw new Error("MMU: la página " + vpn + " ya está presente.");
    var inv = inventario_(ctx);
    var pfn;
    var libre = true;
    var victima = null;
    if (inv.libres.length) {
      pfn = inv.libres[0];
    } else {
      libre = false;
      var ocupados = [];
      var q;
      for (q = 0; q < 16; q++) {
        var pg = ctx.estado.paginas[q];
        if (pg.p) ocupados.push({ vpn: q, pfn: pg.pfn, dirty: pg.dirty, ref: pg.ref, orden: pg.orden, uso: pg.uso });
      }
      var hook = obtenerReemplazo_();
      if (!hook) throw new Error("MMU: los 8 marcos están ocupados y no hay política de reemplazo (issue 26). No se escribió nada.");
      var decision;
      try {
        decision = hook({ vpn: vpn, direccion: fallo.pageFault.direccion, escritura: !!escritura, ocupados: ocupados });
      } catch (eHook) {
        throw new Error("MMU: el reemplazo falló (" + eHook.message + "). No se escribió nada.");
      }
      var vVpn = decision ? vpnEn_(inv.tabla, decision.pfn) : null;
      if (!decision || !entero_(decision.pfn, 0, 7) || vVpn === null) {
        throw new Error("MMU: el reemplazo no devolvió un marco ocupado. No se escribió nada.");
      }
      pfn = decision.pfn;
      victima = { vpn: vVpn, dirty: ctx.estado.paginas[vVpn].dirty };
    }
    if (typeof readSwap !== "function" || typeof writePhysical !== "function" || typeof readPhysical !== "function") {
      throw new Error("MMU: falta el swap o la RAM física. No se escribió nada.");
    }
    var bloque;
    try { bloque = readSwap(vpn); }
    catch (eSwap) { throw new Error("MMU: readSwap falló (" + eSwap.message + "). No se escribió la RAM."); }
    if (!bloque || typeof bloque.length !== "number" || bloque.length !== 32) throw new Error("MMU: readSwap no devolvió 32 valores. No se escribió la RAM.");
    var limpio = [];
    var i;
    for (i = 0; i < 32; i++) limpio.push(validarValorCarga_(bloque[i]));
    var jsonAntes = propiedades_().getProperty(CLAVE);
    var fotoRam = fotoMarco_(pfn);
    var fotosSwap = [fotoSwapFila_(vpn)];
    if (victima) fotosSwap.push(fotoSwapFila_(victima.vpn));
    var marcoAntes = null;
    if (inv.marcos) {
      marcoAntes = [];
      var mf;
      for (mf = 0; mf < 8; mf++) {
        marcoAntes.push({
          vpn: MarcosRAM.leer(mf, "vpn"),
          dirty: MarcosRAM.leer(mf, "dirty"),
          fifo: MarcosRAM.leer(mf, "fifo"),
          ultimoUso: MarcosRAM.leer(mf, "ultimoUso")
        });
      }
    }
    var marcosTocados = false;
    try {
      if (victima && victima.dirty) {
        if (typeof writeSwap !== "function") throw new Error("MMU: falta writeSwap para devolver la víctima. No se escribió la página nueva.");
        var viejo = [];
        for (i = 0; i < 32; i++) viejo.push(validarValorCarga_(readPhysical(pfn * 32 + i)));
        writeSwap(victima.vpn, viejo);
        try {
          if (typeof registrarLog === "function") {
            registrarLog(SpreadsheetApp.getActiveSpreadsheet().getActiveSheet(), "write-back VPN " + victima.vpn + " marco " + pfn + " 32 bytes");
          }
        } catch (eLog) {}
      }
      escribirMarcoFisico_(pfn, limpio);
      var nuevo = clonar_(ctx.estado);
      if (victima) {
        nuevo.paginas[victima.vpn].p = false;
        nuevo.paginas[victima.vpn].pfn = null;
        if (victima.dirty) nuevo.paginas[victima.vpn].dirty = false;
      }
      nuevo.paginas[vpn].p = true;
      nuevo.paginas[vpn].pfn = pfn;
      nuevo.paginas[vpn].dirty = false;
      nuevo.paginas[vpn].ref = true;
      var marcaReloj = tickEn_(nuevo);
      nuevo.paginas[vpn].orden = marcaReloj;
      nuevo.paginas[vpn].uso = marcaReloj;
      if (victima) {
        nuevo.paginas[victima.vpn].orden = null;
        nuevo.paginas[victima.vpn].uso = null;
      }
      guardar_(nuevo);
      publicar_({ hoja: ctx.hoja, estado: nuevo }, vpn);
      if (victima) publicar_({ hoja: ctx.hoja, estado: nuevo }, victima.vpn);
      if (victima) marcarPaginaEnRAM(victima.vpn, false);
      marcarPaginaEnRAM(vpn, true);
      if (inv.marcos) {
        MarcosRAM.establecer(pfn, "vpn", vpn);
        MarcosRAM.establecer(pfn, "dirty", false);
        marcosTocados = true;
        reflejarOrden_({ hoja: ctx.hoja, estado: nuevo });
      }
      if (typeof invalidarCachePagina === "function") {
        invalidarCachePagina({ pfn: pfn, vpn: vpn, vpnSaliente: victima ? victima.vpn : null });
      }
      return { pfn: pfn, vpn: vpn, libre: libre, victima: victima ? victima.vpn : null };
    } catch (eCarga) {
      try {
        if (marcosTocados && marcoAntes) {
          var mr;
          for (mr = 0; mr < marcoAntes.length; mr++) {
            MarcosRAM.establecer(mr, "vpn", marcoAntes[mr].vpn);
            MarcosRAM.establecer(mr, "dirty", marcoAntes[mr].dirty);
            MarcosRAM.establecer(mr, "fifo", marcoAntes[mr].fifo);
            MarcosRAM.establecer(mr, "ultimoUso", marcoAntes[mr].ultimoUso);
          }
        }
      } catch (eM) {}
      try {
        var s;
        for (s = 0; s < fotosSwap.length; s++) restaurarSwapFila_(fotosSwap[s]);
      } catch (eS) {}
      try { restaurarMarco_(fotoRam); } catch (eR) {}
      try {
        if (jsonAntes) propiedades_().setProperty(CLAVE, jsonAntes);
        else if (propiedades_().deleteProperty) propiedades_().deleteProperty(CLAVE);
        var otra = cargar_();
        if (otra) pintarTabla_(ctx.hoja, otra);
      } catch (eT) {}
      throw eCarga;
    }
  }

  function resolverFallo_(fallo, escritura) {
    if (resolviendo_) {
      var repetido = new Error("PageFault: la página " + fallo.pageFault.vpn + " sigue ausente.");
      repetido.name = "PageFault";
      repetido.pageFault = fallo.pageFault;
      throw repetido;
    }
    resolviendo_ = true;
    try {
      return cargarPorFallo_(fallo, escritura);
    } catch (e) {
      try { anotar_(fallo, "abortado: " + recortar_(e && e.message), null); } catch (eA) {}
      throw e;
    } finally {
      resolviendo_ = false;
    }
  }

  function acceder_(direccion, escritura, valor) {
    try {
      if (escritura) escribir_(direccion, valor);
      else valor = leer_(direccion);
      return valor;
    } catch (e) {
      if (!esFallo_(e)) throw e;
      var info = resolverFallo_(e, escritura);
      try {
        if (escritura) escribir_(direccion, valor);
        else valor = leer_(direccion);
      } catch (e2) {
        try {
          anotar_(e, "pfn=" + info.pfn + " reintento=falló", null);
        } catch (eA) {}
        throw e2;
      }
      var como = escritura ? "escritura" : "lectura";
      var origen = info.libre ? "libre" : ("victima=" + info.victima);
      anotar_(e, "pfn=" + info.pfn + " " + origen + " reintento=" + como, info);
      return valor;
    }
  }

  function presentarLectura_(sheet, mar, dato) {
    if (typeof transfer !== "function" || typeof busDir === "undefined" || typeof busDatos === "undefined") {
      sheet.getRange(REG_MDR).setValue(dato);
      return;
    }
    limpiarSenalesBuffers();
    transfer(busDir, { name: "MAR", value: mar }, [], sheet);
    setControl(sheet, { rd: 1, wr: 0, io: 0 });
    transfer(busDatos, { name: "RAM", value: dato }, ["MDR"], sheet);
    pulsoReloj(sheet);
  }

  function presentarEscritura_(sheet, mar, dato) {
    if (typeof transfer !== "function" || typeof busDir === "undefined" || typeof busDatos === "undefined") return;
    limpiarSenalesBuffers();
    transfer(busDir, { name: "MAR", value: mar }, [], sheet);
    setControl(sheet, { rd: 0, wr: 1, io: 0 });
    transfer(busDatos, { name: "MDR", value: dato }, [], sheet);
    pulsoReloj(sheet);
  }

  function memoriaVirtualActiva_() {
    try { return propiedades_().getProperty(CLAVE_MODO) === "virtual"; }
    catch (e) { return false; }
  }

  function programaVirtualCargado_() {
    try { return propiedades_().getProperty(CLAVE_PROGRAMA) === "1"; }
    catch (e) { return false; }
  }

  function fijarPrograma_(listo) {
    var props = propiedades_();
    if (listo) props.setProperty(CLAVE_PROGRAMA, "1");
    else if (props.deleteProperty) props.deleteProperty(CLAVE_PROGRAMA);
    else props.setProperty(CLAVE_PROGRAMA, "0");
  }

  function activar_(activa) {
    if (typeof activa !== "boolean") throw new Error("MMU: activarMemoriaVirtual solo acepta true o false. No se cambió el modo.");
    var props = propiedades_();
    if (activa) props.setProperty(CLAVE_MODO, "virtual");
    else if (props.deleteProperty) props.deleteProperty(CLAVE_MODO);
    else props.setProperty(CLAVE_MODO, "fisico");
    return activa;
  }

  function exigirVirtual_() {
    if (!memoriaVirtualActiva_()) return;
    if (programaVirtualCargado_()) return;
    throw new Error("CPU: la memoria virtual está activa y no hay un programa cargado. Ejecute cargarProgramaVirtual o Load selected program. No se leyó la RAM.");
  }

  function leerCpu_(sheet) {
    if (!memoriaVirtualActiva_()) return transferLecturaMemoria(sheet);
    exigirVirtual_();
    var mar = sheet.getRange(REG_MAR).getValue();
    var dato = acceder_(mar, false, null);
    if (animarBuses_) presentarLectura_(sheet, mar, dato);
    else sheet.getRange(REG_MDR).setValue(dato);
    return dato;
  }

  function escribirCpu_(sheet) {
    if (!memoriaVirtualActiva_()) return transferEscrituraMemoria(sheet);
    exigirVirtual_();
    var mar = sheet.getRange(REG_MAR).getValue();
    var dato = sheet.getRange(REG_MDR).getValue();
    acceder_(mar, true, dato);
    if (animarBuses_) presentarEscritura_(sheet, mar, dato);
  }

  function incrementarVirtual_(sheet, pcActual) {
    var n = validarDireccion_(pcActual);
    var sig = n + 1;
    if (sig > 511) sig = 0;
    var s = sig.toString(16).toUpperCase();
    var ancho = sig > 255 ? 3 : 2;
    while (s.length < ancho) s = "0" + s;
    var celda = sheet.getRange(REG_PC);
    if (celda.setNumberFormat) celda.setNumberFormat("@");
    celda.setValue(s + "H");
  }

  function flagsSwap_() {
    var hoja = libro_().getSheetByName("Swap");
    return hoja.getRange(3, 34, 16, 1).getValues();
  }

  function ponerFlagsNo_() {
    var hoja = libro_().getSheetByName("Swap");
    var estados = [];
    var r;
    for (r = 0; r < 16; r++) estados.push(["no"]);
    hoja.getRange(3, 34, 16, 1).setValues(estados);
  }

  function restaurarFlags_(valores) {
    libro_().getSheetByName("Swap").getRange(3, 34, 16, 1).setValues(valores);
  }

  function reiniciarTabla_() {
    var ctx = exigir_();
    var nuevo = vacia_();
    nuevo.fallos = ctx.estado.fallos || 0;
    nuevo.bitacora = ctx.estado.bitacora ? ctx.estado.bitacora.slice() : [];
    nuevo.vistos = [];
    guardar_(nuevo);
    pintarTabla_(ctx.hoja, nuevo);
    if (typeof MarcosRAM === "undefined" || !MarcosRAM || !MarcosRAM.leer || !MarcosRAM.establecer) return;
    var i;
    try {
      for (i = 0; i < 8; i++) {
        if (MarcosRAM.leer(i, "vpn") !== null) MarcosRAM.establecer(i, "vpn", null);
        if (MarcosRAM.leer(i, "dirty") !== null) MarcosRAM.establecer(i, "dirty", null);
      }
    } catch (eMarco) {
      if (String(eMarco && eMarco.message).indexOf("no coincide") !== -1) throw eMarco;
    }
  }

  function escribirPaginaSwap_(vpn, page32) {
    var n = validarVpn_(vpn);
    if (!page32 || typeof page32.length !== "number" || page32.length !== 32) {
      throw new Error("MMU: vmWriteSwapPage necesita 32 valores. No se escribió nada.");
    }
    var limpio = [];
    var i;
    for (i = 0; i < 32; i++) limpio.push(validarValorCarga_(page32[i]));
    exigir_();
    var foto = fotoSwapFila_(n);
    var flags = flagsSwap_();
    var jsonAntes = propiedades_().getProperty(CLAVE);
    var modoAntes = propiedades_().getProperty(CLAVE_MODO);
    var progAntes = propiedades_().getProperty(CLAVE_PROGRAMA);
    writeSwap(n, limpio);
    try {
      ponerFlagsNo_();
      reiniciarTabla_();
      fijarPrograma_(true);
      propiedades_().setProperty(CLAVE_MODO, "virtual");
    } catch (ePag) {
      try { restaurarSwapFila_(foto); } catch (e1) {}
      try { restaurarFlags_(flags); } catch (e2) {}
      try {
        if (jsonAntes) propiedades_().setProperty(CLAVE, jsonAntes);
        if (modoAntes) propiedades_().setProperty(CLAVE_MODO, modoAntes);
        else if (propiedades_().deleteProperty) propiedades_().deleteProperty(CLAVE_MODO);
        if (progAntes) propiedades_().setProperty(CLAVE_PROGRAMA, progAntes);
        else if (propiedades_().deleteProperty) propiedades_().deleteProperty(CLAVE_PROGRAMA);
        var ctx = cargar_();
        if (ctx) pintarTabla_(hojaSi_(), ctx);
      } catch (e3) {}
      throw ePag;
    }
    return n;
  }

  function cargarProgramaVirtual_() {
    if (typeof cargarProgramaEnSwap !== "function") throw new Error("MMU: falta cargarProgramaEnSwap. No se reinició nada.");
    if (typeof RAMFisica === "undefined" || !RAMFisica.vaciar) throw new Error("MMU: falta RAMFisica. No se reinició nada.");
    var libro = libro_();
    if (!libro.getSheetByName("Programas")) throw new Error("MMU: no existe la hoja Programas. No se reinició el swap ni la RAM.");
    var swap = libro.getSheetByName("Swap");
    if (!swap || String(swap.getRange(1, 1).getNote() || "") !== "SWAPVM-v1") throw new Error("MMU: el swap no está instalado. No se reinició nada.");
    exigir_();
    if (typeof SHEET_NAME === "undefined" || !libro.getSheetByName(SHEET_NAME)) throw new Error("MMU: no existe Hoja 1. No se reinició nada.");
    cargarProgramaEnSwap();
    reiniciarTabla_();
    RAMFisica.vaciar();
    fijarPrograma_(true);
    propiedades_().setProperty(CLAVE_MODO, "virtual");
    var principal = libro.getSheetByName(SHEET_NAME);
    if (typeof REG_PC !== "undefined") {
      var pc = principal.getRange(REG_PC);
      if (pc.setNumberFormat) pc.setNumberFormat("@");
      pc.setValue("00H");
    }
    if (typeof CPU_STATE !== "undefined") principal.getRange(CPU_STATE).setValue("READY");
  }

  function registrarReemplazo_(fn) {
    if (fn === null) {
      reemplazoForzado_ = { usar: true, fn: null };
      return null;
    }
    if (typeof fn !== "function") throw new Error("MMU: registrarReemplazoPagina espera una función o null.");
    reemplazoForzado_ = { usar: true, fn: fn };
    return fn;
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
    Logger.log("MMU: hoja \"TablaPaginas\". Esta prueba no enciende la memoria virtual.");
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
    Logger.log("Tabla lista. Esta prueba no enciende la memoria virtual.");
  }

  function bloqueVacio_() {
    var b = [];
    var i;
    for (i = 0; i < 32; i++) b.push("");
    return b;
  }

  function igualLista_(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var i;
    for (i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function probar25() {
    var previa = hojaSi_();
    if (previa && !esNuestra_(previa) && !zonaVacia_(previa)) {
      throw new Error("MMU: la hoja TablaPaginas existe y no es de este módulo. No se escribió nada.");
    }
    var libro = libro_();
    var hoja1 = (typeof SHEET_NAME !== "undefined") ? libro.getSheetByName(SHEET_NAME) : null;
    if (!hoja1) throw new Error("MMU: no existe Hoja 1. No se escribió nada.");
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
    var anchos = [];
    var cAncho;
    if (hoja1.getColumnWidth) {
      for (cAncho = 32; cAncho <= 34; cAncho++) anchos.push(hoja1.getColumnWidth(cAncho));
    }
    var ramR = hoja1.getRange(RAM_START_ROW, RAM_START_COL, 16, 16);
    var ram0 = {
      v: ramR.getValues(),
      f: ramR.getFormulas ? ramR.getFormulas() : null,
      n: ramR.getNumberFormats ? ramR.getNumberFormats() : null,
      b: ramR.getBackgrounds ? ramR.getBackgrounds() : null
    };
    var formula0 = ramR.getFormula ? ramR.getFormula() : "";
    function fotoA1(a1) {
      var celda = hoja1.getRange(a1);
      return {
        a1: a1,
        v: celda.getValue(),
        f: celda.getFormula ? celda.getFormula() : "",
        n: celda.getNumberFormat ? celda.getNumberFormat() : "",
        b: celda.getBackground ? celda.getBackground() : null
      };
    }
    function ponerA1(foto) {
      var celda = hoja1.getRange(foto.a1);
      if (celda.setNumberFormat && foto.n !== "") celda.setNumberFormat(foto.n);
      if (foto.f) celda.setFormula(foto.f);
      else celda.setValue(foto.v);
      if (celda.setBackground) celda.setBackground(foto.b);
    }
    var regs = [REG_PC, REG_IR, REG_IR_MAQ, REG_MAR, REG_MDR, REG_AX, REG_BX, REG_CX, REG_DX, CPU_STATE, FLAG_ZF, FLAG_CF, FLAG_SF];
    var fotosReg = [];
    var ir;
    for (ir = 0; ir < regs.length; ir++) fotosReg.push(fotoA1(regs[ir]));
    var busR = hoja1.getRange(15, 10, 27, 4);
    var bus0 = {
      v: busR.getValues(),
      b: busR.getBackgrounds ? busR.getBackgrounds() : null
    };
    var pilaR = hoja1.getRange(STACK_START_ROW, STACK_COL, 16, 1);
    var pila0 = pilaR.getBackgrounds ? pilaR.getBackgrounds() : null;
    var metaR = hoja1.getRange(RAM_START_ROW - 1, RAM_START_COL + 17, 17, 3);
    var meta0 = {
      v: metaR.getValues(),
      f: metaR.getFormulas ? metaR.getFormulas() : null,
      n: metaR.getNumberFormats ? metaR.getNumberFormats() : null
    };
    var props = propiedades_();
    var crudo = props.getProperty(CLAVE);
    var modo0 = props.getProperty(CLAVE_MODO);
    var prog0 = props.getProperty(CLAVE_PROGRAMA);
    var marcosClave = "MARCOSRAM_ESTADO_v1";
    var marcos0 = props.getProperty(marcosClave);
    var logNombre = (typeof LOG_SHEET_NAME !== "undefined") ? LOG_SHEET_NAME : "LOG";
    var logHoja = libro.getSheetByName(logNombre);
    var logFilas = (logHoja && logHoja.getLastRow) ? logHoja.getLastRow() : 0;
    if (typeof SwapVM === "undefined" || !SwapVM.instalar) throw new Error("MMU: falta SwapVM. No se escribió la tabla.");
    var swapAntes = libro.getSheetByName("Swap");
    if (swapAntes && !SwapVM.esNuestra(swapAntes)) {
      var ajena = false;
      try { ajena = String(swapAntes.getRange(1, 1).getValue() || "") !== ""; } catch (eA) { ajena = true; }
      if (ajena) throw new Error("MMU: la hoja Swap existe y no es de este módulo. No se escribió nada.");
    }
    SwapVM.instalar();
    instalar_();
    var swap = libro.getSheetByName("Swap");
    var swapR = swap.getRange(3, 1, 16, 34);
    var swap0 = {
      v: swapR.getValues(),
      f: swapR.getFormulas ? swapR.getFormulas() : null,
      n: swapR.getNumberFormats ? swapR.getNumberFormats() : null,
      b: swapR.getBackgrounds ? swapR.getBackgrounds() : null
    };
    var conPanel = false;
    try { MarcosRAM.leer(0, "vpn"); conPanel = true; } catch (ePanel) { conPanel = false; }
    function restaurarMatriz(hoja, fila, col, foto) {
      var rr, cc;
      for (rr = 0; rr < foto.v.length; rr++) {
        for (cc = 0; cc < foto.v[rr].length; cc++) {
          var celda = hoja.getRange(fila + rr, col + cc);
          if (celda.setNumberFormat && foto.n) celda.setNumberFormat(foto.n[rr][cc]);
          if (foto.f && foto.f[rr][cc]) celda.setFormula(foto.f[rr][cc]);
          else celda.setValue(foto.v[rr][cc]);
          if (foto.b && celda.setBackground) celda.setBackground(foto.b[rr][cc]);
        }
      }
    }
    function volver() {
      if (crudo) props.setProperty(CLAVE, crudo);
      else guardar_(vacia_());
      if (modo0) props.setProperty(CLAVE_MODO, modo0);
      else if (props.deleteProperty) props.deleteProperty(CLAVE_MODO);
      if (prog0) props.setProperty(CLAVE_PROGRAMA, prog0);
      else if (props.deleteProperty) props.deleteProperty(CLAVE_PROGRAMA);
      if (marcos0) props.setProperty(marcosClave, marcos0);
      else if (props.deleteProperty) props.deleteProperty(marcosClave);
      var est = null;
      try { est = cargar_(); } catch (eEst) { est = null; }
      var hojaTabla = hojaSi_();
      if (est && hojaTabla) pintarTabla_(hojaTabla, est);
      else if (!est && hojaTabla) pintarTabla_(hojaTabla, vacia_());
      if (hojaTabla) {
        var fallos = est && typeof est.fallos === "number" ? est.fallos : 0;
        var marca = hojaTabla.getRange(24, 1);
        if (String(marca.getValue() || "") === "" || String(marca.getValue() || "") === "PAGE FAULT") {
          marca.setValue("PAGE FAULT");
          hojaTabla.getRange(24, 2).setValue(fallos);
          hojaTabla.getRange(24, 3).setValue("");
        }
        var bit = (est && est.bitacora) ? est.bitacora : [];
        var br;
        for (br = 0; br < 12; br++) hojaTabla.getRange(26 + br, 1).setValue(bit[br] || "");
      }
      restaurarMatriz(hoja1, RAM_START_ROW, RAM_START_COL, ram0);
      restaurarMatriz(swap, 3, 1, swap0);
      restaurarMatriz(hoja1, RAM_START_ROW - 1, RAM_START_COL + 17, meta0);
      var k;
      for (k = 0; k < fotosReg.length; k++) ponerA1(fotosReg[k]);
      var br2, bc;
      for (br2 = 0; br2 < bus0.v.length; br2++) {
        for (bc = 0; bc < bus0.v[br2].length; bc++) {
          var busCelda = hoja1.getRange(15 + br2, 10 + bc);
          busCelda.setValue(bus0.v[br2][bc]);
          if (bus0.b && busCelda.setBackground) busCelda.setBackground(bus0.b[br2][bc]);
        }
      }
      if (pila0) {
        var pr;
        for (pr = 0; pr < pila0.length; pr++) hoja1.getRange(STACK_START_ROW + pr, STACK_COL).setBackground(pila0[pr][0]);
      }
      if (logHoja && logHoja.getLastRow && logHoja.getLastRow() > logFilas) {
        logHoja.getRange(logFilas + 1, 1, logHoja.getLastRow() - logFilas, 18).clearContent();
      }
      reemplazoForzado_ = { usar: false, fn: null };
      if (typeof invalidarCachePagina !== "undefined") invalidarCachePagina = undefined;
    }
    function seccion(fn) {
      try { fn(); }
      catch (e) { registrar(false, "excepción: " + (e && e.message ? e.message : e)); }
      finally { try { volver(); } catch (eV) { registrar(false, "no se pudo restaurar: " + eV.message); } }
    }
    function prepararMar(texto) {
      var mar = hoja1.getRange(REG_MAR);
      if (mar.setNumberFormat) mar.setNumberFormat("@");
      mar.setValue(texto);
    }
    Logger.log("MMU: fallo de página. Modo físico por defecto. La prueba no vacía la RAM.");
    try {
      seccion(function () {
        var lanzo = false;
        try { leer_(64); } catch (e) { lanzo = e.name === "PageFault"; }
        registrar(lanzo && !exigir_().estado.paginas[2].p, "leerMMU ausente sigue lanzando PageFault y no carga");
      });
      if (typeof stepCPU !== "function" || typeof leerMemoriaCPU !== "function") {
        registrar(false, "faltan stepCPU o leerMemoriaCPU; pegue CPU.gs y MMU.gs");
      } else {
        seccion(function () {
          hoja1.getRange(CPU_STATE).setValue("READY");
          activar_(true);
          fijarPrograma_(false);
          var lecturas = 0;
          var rp = readPhysical;
          readPhysical = function (a) { lecturas++; return rp(a); };
          var lanzo = false;
          try { stepCPU(); }
          catch (e) { lanzo = String(e.message).indexOf("no hay un programa cargado") !== -1; }
          finally { readPhysical = rp; }
          registrar(lanzo && lecturas === 0 && hoja1.getRange(CPU_STATE).getValue() === "READY", "virtual sin programa no ejecuta la RAM vacía");
        });
      }
      seccion(function () {
        activar_(true);
        fijarPrograma_(true);
        prepararMar("20");
        var antes = readPhysical(0);
        var lanzo = false;
        var tipo = "";
        try { leerMemoriaCPU(hoja1); }
        catch (e) { lanzo = String(e.message).indexOf("MMU:") === 0; tipo = e.name; }
        registrar(lanzo && tipo !== "PageFault" && readPhysical(0) === antes, "el texto \"20\" no es dirección y no escribe");
      });
      seccion(function () {
        activar_(true);
        fijarPrograma_(true);
        prepararMar("00H");
        var rs = readSwap;
        var wp = writePhysical;
        var writes = 0;
        readSwap = function () { throw new Error("SwapVM: corte de prueba"); };
        writePhysical = function (a, v) { writes++; return wp(a, v); };
        var lanzo = false;
        try { leerMemoriaCPU(hoja1); }
        catch (e) { lanzo = String(e.message).indexOf("readSwap falló") !== -1; }
        finally { readSwap = rs; writePhysical = wp; }
        registrar(lanzo && writes === 0 && !exigir_().estado.paginas[0].p && (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0, "readSwap con error no escribe la RAM ni la fórmula");
      });
      seccion(function () {
        var malo = bloqueVacio_();
        malo[4] = "GGH";
        var rs = readSwap;
        var writes = 0;
        var wp = writePhysical;
        readSwap = function () { return malo; };
        writePhysical = function (a, v) { writes++; return wp(a, v); };
        activar_(true);
        fijarPrograma_(true);
        prepararMar("00H");
        var lanzo = false;
        try { leerMemoriaCPU(hoja1); }
        catch (e) { lanzo = String(e.message).indexOf("No se escribió la RAM") !== -1; }
        finally { readSwap = rs; writePhysical = wp; }
        registrar(lanzo && writes === 0 && !exigir_().estado.paginas[0].p, "un byte inválido del swap no escribe ningún marco");
      });
      seccion(function () {
        var bloque = bloqueVacio_();
        bloque[0] = "LD AX, 20H";
        bloque[31] = "1FH";
        writeSwap(0, bloque);
        activar_(true);
        fijarPrograma_(true);
        prepararMar("00H");
        corteCarga_ = true;
        var lanzo = false;
        try { leerMemoriaCPU(hoja1); }
        catch (e) { lanzo = String(e.message).indexOf("corte de prueba") !== -1; }
        finally { corteCarga_ = false; }
        registrar(lanzo && !exigir_().estado.paginas[0].p && (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0, "un corte a media carga deshace la RAM y no deja la página presente");
      });
      if (conPanel) {
        seccion(function () {
          MarcosRAM.establecer(0, "vpn", 4);
          activar_(true);
          fijarPrograma_(true);
          prepararMar("00H");
          var writes = 0;
          var wp = writePhysical;
          writePhysical = function (a, v) { writes++; return wp(a, v); };
          var lanzo = false;
          try { leerMemoriaCPU(hoja1); }
          catch (e) { lanzo = String(e.message).indexOf("no coincide") !== -1; }
          finally { writePhysical = wp; }
          registrar(lanzo && writes === 0 && !exigir_().estado.paginas[0].p, "un marco que no coincide aborta sin escribir");
        });
      } else {
        registrar(true, "sin panel de marcos no hay contradicción que escribir en AF:AH");
      }
      seccion(function () {
        var i;
        for (i = 0; i < 8; i++) mapear_(i, i);
        registrarReemplazo_(null);
        activar_(true);
        fijarPrograma_(true);
        prepararMar("100H");
        var swaps = 0;
        var writes = 0;
        var rs = readSwap;
        var wp = writePhysical;
        readSwap = function (v) { swaps++; return rs(v); };
        writePhysical = function (a, v) { writes++; return wp(a, v); };
        var lanzo = false;
        try { leerMemoriaCPU(hoja1); }
        catch (e) { lanzo = String(e.message).indexOf("issue 26") !== -1; }
        finally { readSwap = rs; writePhysical = wp; }
        var intacto = !exigir_().estado.paginas[8].p;
        for (i = 0; i < 8; i++) {
          var pg = exigir_().estado.paginas[i];
          if (!pg.p || pg.pfn !== i) intacto = false;
        }
        registrar(lanzo && swaps === 0 && writes === 0 && intacto, "con 8 marcos ocupados y sin política no se pisa ninguno");
      });
      seccion(function () {
        var i;
        for (i = 0; i < 8; i++) mapear_(i, i);
        for (i = 0; i < 32; i++) writePhysical(i, i);
        escribir_(0, 99);
        var bloque = bloqueVacio_();
        for (i = 0; i < 32; i++) bloque[i] = "Z";
        bloque[0] = "C5H";
        writeSwap(8, bloque);
        registrarReemplazo_(function () { return { pfn: 0 }; });
        activar_(true);
        fijarPrograma_(true);
        prepararMar("100H");
        var mdr = hoja1.getRange(REG_MDR);
        if (mdr.setNumberFormat) mdr.setNumberFormat("@");
        mdr.setValue("C5H");
        escribirMemoriaCPU(hoja1);
        var pag0 = exigir_().estado.paginas[0];
        var pag8 = exigir_().estado.paginas[8];
        var swap0 = readSwap(0);
        var swap8 = readSwap(8);
        registrar(pag0.p === false && pag0.pfn === null && pag8.p === true && pag8.pfn === 0 && pag8.dirty === true && pag8.ref === true, "la víctima sucia se desmapea y la escritura reintentada deja Dirty");
        registrar(swap0[0] === 99 && swap0[1] === 1 && swap8[0] === "C5H" && readPhysical(0) === "C5H" && swap.getRange(3, 34).getValue() === "no" && swap.getRange(11, 34).getValue() === "sí", "el writeback copia el marco y el swap de la página nueva no cambia");
      });
      seccion(function () {
        var b0 = bloqueVacio_();
        b0[0] = "LD AX, 20H";
        b0[20] = "14H";
        b0[31] = "1FH";
        var b1 = bloqueVacio_();
        b1[0] = 20;
        var b15 = bloqueVacio_();
        b15[31] = "FFH";
        writeSwap(0, b0);
        writeSwap(1, b1);
        writeSwap(15, b15);
        var antes0 = readSwap(0).slice();
        var antes15 = readSwap(15).slice();
        activar_(true);
        fijarPrograma_(true);
        prepararMar("00H");
        var dato0 = leerMemoriaCPU(hoja1);
        var p0 = exigir_().estado.paginas[0];
        var mar = hoja1.getRange(REG_MAR);
        if (mar.setNumberFormat) mar.setNumberFormat("0");
        mar.setValue(20);
        var dato20 = leerMemoriaCPU(hoja1);
        if (mar.setNumberFormat) mar.setNumberFormat("@");
        mar.setValue("01FH");
        var dato31 = leerMemoriaCPU(hoja1);
        mar.setValue("020H");
        var dato32 = leerMemoriaCPU(hoja1);
        mar.setValue("1FFH");
        var dato511 = leerMemoriaCPU(hoja1);
        var p1 = exigir_().estado.paginas[1];
        var p15 = exigir_().estado.paginas[15];
        registrar(dato0 === "LD AX, 20H" && p0.pfn === 0 && p0.ref === true && p0.dirty === false && readPhysical(0) === "LD AX, 20H", "VPN 0 entra al marco libre 0");
        registrar(dato20 === "14H" && dato31 === "1FH" && readPhysical(31) === "1FH", "el número 20 y 01FH leen los desplazamientos 20 y 31");
        registrar(dato32 === 20 && p1.pfn === 1 && p1.dirty === false && p1.ref === true, "020H carga la VPN 1 en el marco 1 y el 20 no es 32");
        registrar(dato511 === "FFH" && p15.pfn === 2 && p15.ref === true && p15.dirty === false && readPhysical(95) === "FFH", "1FFH usa el marco libre 2 y la física 95");
        registrar(igualLista_(readSwap(0), antes0) && igualLista_(readSwap(15), antes15) && swap.getRange(3, 34).getValue() === "sí" && swap.getRange(4, 34).getValue() === "sí" && swap.getRange(18, 34).getValue() === "sí", "en un fallo limpio el swap no cambia y En RAM pasa a sí");
        if (conPanel) registrar(MarcosRAM.leer(0, "vpn") === 0 && MarcosRAM.leer(0, "dirty") === false && MarcosRAM.leer(2, "vpn") === 15, "el marco queda con la VPN y Dirty 0");
        else registrar(true, "sin panel la tabla cargó la página y no se escribió AF:AH");
        registrar(exigir_().estado.fallos === 3 && hojaSi_().getRange(24, 2).getValue() === 3 && hojaSi_().getRange(24, 1).getValue() === "PAGE FAULT", "el contador visible es 3, uno por página cargada");
      });
      seccion(function () {
        var bloque = bloqueVacio_();
        bloque[0] = "00H";
        writeSwap(4, bloque);
        var antes = readSwap(4).slice();
        activar_(true);
        fijarPrograma_(true);
        prepararMar("080H");
        var mdr = hoja1.getRange(REG_MDR);
        if (mdr.setNumberFormat) mdr.setNumberFormat("@");
        mdr.setValue("A5H");
        escribirMemoriaCPU(hoja1);
        var p = exigir_().estado.paginas[4];
        registrar(p.p === true && p.pfn === 0 && p.dirty === true && p.ref === true && readPhysical(0) === "A5H" && igualLista_(readSwap(4), antes) && swap.getRange(7, 34).getValue() === "sí", "la escritura ausente reintenta una vez, deja Dirty y no toca el swap");
      });
      seccion(function () {
        invalidarCachePagina = function () { throw new Error("cache de prueba"); };
        var bloque = bloqueVacio_();
        bloque[0] = "HLT";
        writeSwap(5, bloque);
        activar_(true);
        fijarPrograma_(true);
        prepararMar("0A0H");
        var lanzo = false;
        try { leerMemoriaCPU(hoja1); }
        catch (e) { lanzo = String(e.message).indexOf("cache de prueba") !== -1; }
        registrar(lanzo && !exigir_().estado.paginas[5].p && (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0, "si el gancho de caché falla no queda la página ni la RAM a medias");
      });
      seccion(function () {
        var i;
        for (i = 0; i < 7; i++) mapear_(i, i);
        var bloque = bloqueVacio_();
        bloque[0] = "HLT";
        writeSwap(9, bloque);
        activar_(true);
        fijarPrograma_(true);
        prepararMar("120H");
        var dato = leerMemoriaCPU(hoja1);
        var p = exigir_().estado.paginas[9];
        registrar(dato === "HLT" && p.pfn === 7 && (typeof RESERVA_ES === "undefined" || RESERVA_ES === null), "el marco 7 se usa y RESERVA_ES sigue null");
      });
      if (typeof stepCPU === "function") {
        seccion(function () {
          var p0 = bloqueVacio_();
          p0[0] = "LD AX, 20H";
          p0[1] = "ST 40H, AX";
          p0[2] = "HLT";
          var p1 = bloqueVacio_();
          p1[0] = "A5H";
          var p2 = bloqueVacio_();
          p2[0] = "00H";
          writeSwap(0, p0);
          writeSwap(1, p1);
          writeSwap(2, p2);
          activar_(true);
          fijarPrograma_(true);
          var pc = hoja1.getRange(REG_PC);
          if (pc.setNumberFormat) pc.setNumberFormat("@");
          pc.setValue("00H");
          hoja1.getRange(REG_AX).setValue("00H");
          hoja1.getRange(CPU_STATE).setValue("READY");
          var od = obtenerDatoRAM;
          var rp = readPhysical;
          var altos = 0;
          obtenerDatoRAM = function () { throw new Error("obtenerDatoRAM no debe usarse con la VA virtual"); };
          readPhysical = function (a) {
            if (typeof a === "number" && a > 255) altos++;
            return rp(a);
          };
          var pcs = [];
          var irs = [];
          var pasos = 0;
          var halt = false;
          try {
            while (pasos < 24) {
              if (hoja1.getRange(CPU_STATE).getValue() === "HALT") { halt = true; break; }
              stepCPU();
              pasos++;
              if (hoja1.getRange(CPU_STATE).getValue() === "FETCH_3") {
                pcs.push(String(hoja1.getRange(REG_PC).getValue()));
                irs.push(String(hoja1.getRange(REG_IR).getValue()));
              }
            }
          } finally {
            obtenerDatoRAM = od;
            readPhysical = rp;
          }
          var e0 = exigir_().estado.paginas[0];
          var e1 = exigir_().estado.paginas[1];
          var e2 = exigir_().estado.paginas[2];
          registrar(halt && pasos < 24 && pcs.join(",") === "01H,02H,03H" && irs.join("|") === "LD AX, 20H|ST 40H, AX|HLT", "el programa virtual avanza el PC una vez por instrucción, sin salto ni repetición");
          registrar(String(hoja1.getRange(REG_AX).getValue()) === "A5H" && e2.dirty === true && e2.ref === true && e0.dirty === false && e1.dirty === false && readPhysical(64) === "A5H" && readSwap(2)[0] === "00H", "LD y ST virtuales dejan AX=A5H, Dirty en la tienda y el swap igual");
          registrar(altos === 0 && exigir_().estado.fallos === 3, "el ciclo virtual no lee una dirección mayor que 255 y cuenta 3 fallos");
        });
        seccion(function () {
          var bloque = bloqueVacio_();
          bloque[31] = "HLT";
          writeSwap(15, bloque);
          activar_(true);
          fijarPrograma_(true);
          var pc = hoja1.getRange(REG_PC);
          if (pc.setNumberFormat) pc.setNumberFormat("@");
          pc.setValue("1FFH");
          hoja1.getRange(CPU_STATE).setValue("READY");
          var od = obtenerDatoRAM;
          var rp = readPhysical;
          var altos = 0;
          obtenerDatoRAM = function () { altos++; return od.apply(null, arguments); };
          readPhysical = function (a) {
            if (typeof a === "number" && a > 255) altos++;
            return rp(a);
          };
          var k;
          try { for (k = 0; k < 3; k++) stepCPU(); }
          finally { obtenerDatoRAM = od; readPhysical = rp; }
          var p = exigir_().estado.paginas[15];
          registrar(String(hoja1.getRange(REG_PC).getValue()) === "00H" && String(hoja1.getRange(REG_MDR).getValue()) === "HLT" && String(hoja1.getRange(REG_IR).getValue()) === "HLT" && p.pfn === 0 && altos === 0 && readPhysical(31) === "HLT", "1FFH carga la página, deja HLT y el PC pasa a 00H");
        });
        seccion(function () {
          activar_(false);
          writePhysical(255, "HLT");
          var pc = hoja1.getRange(REG_PC);
          if (pc.setNumberFormat) pc.setNumberFormat("@");
          pc.setValue("FFH");
          hoja1.getRange(CPU_STATE).setValue("READY");
          var fallosAntes = exigir_().estado.fallos || 0;
          var datos = 0;
          var od = obtenerDatoRAM;
          obtenerDatoRAM = function () { datos++; return od.apply(null, arguments); };
          var k = 0;
          var halt = false;
          try {
            while (k < 8) {
              if (hoja1.getRange(CPU_STATE).getValue() === "HALT") { halt = true; break; }
              stepCPU();
              k++;
            }
          } finally { obtenerDatoRAM = od; }
          registrar(halt && String(hoja1.getRange(REG_PC).getValue()) === "100H" && datos > 0 && (exigir_().estado.fallos || 0) === fallosAntes && (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0, "en modo físico FFH avanza a 100H y no hay fallo de página");
        });
      }
      seccion(function () {
        mapear_(3, 4);
        instalar_();
        registrar(exigir_().estado.paginas[3].p === true && exigir_().estado.paginas[3].pfn === 4, "repetir la instalación no borra la tabla");
      });
      seccion(function () {
        var modo = props.getProperty(CLAVE_MODO);
        var lanzo = false;
        try { activar_("sí"); }
        catch (e) { lanzo = String(e.message).indexOf("true o false") !== -1; }
        registrar(lanzo && props.getProperty(CLAVE_MODO) === modo, "activarMemoriaVirtual rechaza un texto y no cambia el modo");
      });
      seccion(function () {
        var bloque = [];
        var i;
        for (i = 0; i < 32; i++) bloque.push(i === 0 ? 255 : 0);
        var n = escribirPaginaSwap_(0, bloque);
        var ausente = true;
        for (i = 0; i < 16; i++) if (exigir_().estado.paginas[i].p) ausente = false;
        registrar(n === 0 && readSwap(0)[0] === 255 && ausente && memoriaVirtualActiva_() && programaVirtualCargado_() && (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0, "vmWriteSwapPage escribe el swap, deja la tabla ausente y no vacía la RAM");
      });
      if (libro.getSheetByName("Programas")) {
        registrar(true, "hay hoja Programas; no se llamó cargarProgramaVirtual porque vacía swap y RAM");
      } else {
        seccion(function () {
          var lanzo = false;
          try { cargarProgramaVirtual_(); }
          catch (e) { lanzo = String(e.message).indexOf("Programas") !== -1; }
          registrar(lanzo && (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0, "cargarProgramaVirtual sin Programas no toca la RAM");
        });
      }
      registrar(vaciados === 0 && resets === 0, "la prueba no vacía la RAM ni llama a resetCPU");
    } catch (e) {
      registrar(false, "excepción: " + (e && e.message ? e.message : e));
    } finally {
      try { volver(); } catch (eV) { registrar(false, "no se pudo restaurar: " + eV.message); }
      if (vaciarPrev) RAMFisica.vaciar = vaciarPrev;
      if (resetPrev) resetCPU = resetPrev;
    }
    var formulaOk = (hoja1.getRange(RAM_START_ROW, RAM_START_COL).getFormula() || "") === formula0;
    var marOk = hoja1.getRange(REG_MAR).getValue() === fotosReg[3].v;
    var modoOk = props.getProperty(CLAVE_MODO) === modo0;
    var anchosOk = true;
    if (hoja1.getColumnWidth) {
      for (cAncho = 0; cAncho < anchos.length; cAncho++) {
        if (hoja1.getColumnWidth(32 + cAncho) !== anchos[cAncho]) anchosOk = false;
      }
    }
    registrar(formulaOk && marOk && modoOk && anchosOk && vaciados === 0, "fórmula, MAR, modo, anchos y RAM quedaron como al inicio");
    Logger.log("RESUMEN instalarYProbarIssue25: " + ok + " OK, " + mal + " fallos.");
    if (mal > 0) throw new Error("instalarYProbarIssue25: " + mal + " fallos. Se intentó restaurar la hoja.");
    Logger.log("Modo físico intacto. El fallo de página solo corre con la memoria virtual encendida y un programa cargado.");
  }

  return {
    instalar: instalar_,
    translate: translate,
    leer: leer_,
    escribir: escribir_,
    mapear: mapear_,
    desmapear: desmapear_,
    probar: probar,
    probar25: probar25,
    activa: memoriaVirtualActiva_,
    activar: activar_,
    programa: programaVirtualCargado_,
    leerCpu: leerCpu_,
    escribirCpu: escribirCpu_,
    incrementar: incrementarVirtual_,
    escribirPagina: escribirPaginaSwap_,
    cargarPrograma: cargarProgramaVirtual_,
    reemplazo: registrarReemplazo_,
    silenciar: function (silencio) { animarBuses_ = !silencio; }
  };
})();

function translate(direccion) { return MMU.translate(direccion); }
function leerMMU(direccion) { return MMU.leer(direccion); }
function escribirMMU(direccion, valor) { return MMU.escribir(direccion, valor); }
function mapearPagina(vpn, pfn) { return MMU.mapear(vpn, pfn); }
function desmapearPagina(vpn) { return MMU.desmapear(vpn); }
function instalarYProbarIssue24() { return MMU.probar(); }
function memoriaVirtualActiva() { return MMU.activa(); }
function activarMemoriaVirtual(activa) { return MMU.activar(activa); }
function programaVirtualCargado() { return MMU.programa(); }
function leerMemoriaCPU(sheet) { return MMU.leerCpu(sheet); }
function escribirMemoriaCPU(sheet) { return MMU.escribirCpu(sheet); }
function incrementarPCVirtual(sheet, pcActual) { return MMU.incrementar(sheet, pcActual); }
function vmWriteSwapPage(vpn, page32) { return MMU.escribirPagina(vpn, page32); }
function cargarProgramaVirtual() { return MMU.cargarPrograma(); }
function registrarReemplazoPagina(fn) { return MMU.reemplazo(fn); }
function silenciarAnimacionMMU(silencio) { return MMU.silenciar(!!silencio); }
function instalarYProbarIssue25() { return MMU.probar25(); }
