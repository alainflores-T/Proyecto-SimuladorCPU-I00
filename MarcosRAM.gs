// MarcosRAM.gs
// Copia personal de @Gunter310. Marcos físicos y estado explícito por marco.
// No es la MMU: no traduce, no hace page fault y no calcula FIFO.
// No reserva teclado ni LCD: los issues 33 y 34 aún no fijan direcciones,
// y PORT_CODES 00/01 son puertos, no celdas de esta RAM.
// No cambia anchos de columna ni valores, fórmulas o formatos de O8:AD23.
// El borde de los marcos solo se pone la primera vez que las etiquetas están vacías.
//
// Estado tipado en PropertiesService del documento (no en el ancho de las columnas).
// VPN null = sin asignar. Dirty/FIFO/último uso null = pendiente, no un cero inventado.
// VPN válido: 0..15 (issues 23 y 24: 16 páginas de 32 B, VPN = dirección >> 5).
// PFN: 0..7. Si el panel y el estado no coinciden, no se pisa ninguno.

var MarcosRAM = (function () {
  var NOTA = "MARCOSRAM-v1";
  var CLAVE = "MARCOSRAM_ESTADO_v1";
  var VPN_LIBRE = "sin asignar";
  var PENDIENTE = "pendiente";
  var CAMPOS = ["vpn", "dirty", "fifo", "ultimoUso"];
  var FORMATOS_VACIOS = { "General": true, "@": true, "": true, "0.###############": true };

  function exigirConfig_() {
    if (typeof SHEET_NAME === "undefined" || typeof RAM_START_ROW === "undefined" || typeof RAM_START_COL === "undefined") {
      throw new Error("MarcosRAM: faltan SHEET_NAME, RAM_START_ROW o RAM_START_COL (Config.gs). No se escribió nada.");
    }
    if (SHEET_NAME !== "Hoja 1" || RAM_START_ROW !== 8 || RAM_START_COL !== 15) {
      throw new Error("MarcosRAM abortado sin cambios: la RAM configurada no es Hoja 1, fila 8, columna 15.");
    }
  }

  function hoja_() {
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    if (!libro) throw new Error("MarcosRAM: no hay un libro activo. No se escribió nada.");
    var hoja = libro.getSheetByName(SHEET_NAME);
    if (!hoja) throw new Error("MarcosRAM: no existe la hoja \"" + SHEET_NAME + "\". No se escribió nada.");
    return hoja;
  }

  function columnaA1_(numero) {
    var n = numero;
    var letras = "";
    while (n > 0) {
      var resto = (n - 1) % 26;
      letras = String.fromCharCode(65 + resto) + letras;
      n = Math.floor((n - 1) / 26);
    }
    return letras;
  }

  function hex2_(n) {
    var s = n.toString(16).toUpperCase();
    if (s.length < 2) s = "0" + s;
    return s + "H";
  }

  function marco_(i) {
    var fila = RAM_START_ROW + (i * 2);
    var dir0 = i * 32;
    var dir1 = dir0 + 31;
    return {
      indice: i,
      fila: fila,
      dir0: dir0,
      dir1: dir1,
      rango: columnaA1_(RAM_START_COL) + fila + ":" + columnaA1_(RAM_START_COL + 15) + (fila + 1),
      textoDir: hex2_(dir0) + "-" + hex2_(dir1)
    };
  }

  function colorMarco_(i) {
    var colores = ["#1565C0", "#2E7D32", "#6A1B9A", "#E65100", "#00838F", "#AD1457", "#4527A0", "#37474F"];
    return colores[i];
  }

  // AF = columna 32. AE (31) se deja intacta.
  function columnaMeta_() {
    return RAM_START_COL + 16 + 1;
  }

  function celda_(col, fila) {
    return columnaA1_(col) + fila;
  }

  function planCeldas_() {
    var col = columnaMeta_();
    var lista = [];
    lista.push({ a1: celda_(col, RAM_START_ROW - 1), texto: "Marcos físicos", nota: NOTA, prefijo: "" });
    lista.push({ a1: celda_(col + 1, RAM_START_ROW - 1), texto: "VPN / FIFO", nota: "", prefijo: "" });
    lista.push({ a1: celda_(col + 2, RAM_START_ROW - 1), texto: "Dirty / uso", nota: "", prefijo: "" });
    var i;
    for (i = 0; i < 8; i++) {
      var m = marco_(i);
      lista.push({ a1: celda_(col, m.fila), texto: "Marco " + i, nota: "", prefijo: "" });
      lista.push({ a1: celda_(col + 1, m.fila), texto: "VPN: " + VPN_LIBRE, nota: "", prefijo: "VPN: ", campo: "vpn", marco: i });
      lista.push({ a1: celda_(col + 2, m.fila), texto: "Dirty: " + PENDIENTE, nota: "", prefijo: "Dirty: ", campo: "dirty", marco: i });
      lista.push({ a1: celda_(col, m.fila + 1), texto: m.textoDir, nota: "", prefijo: "" });
      lista.push({ a1: celda_(col + 1, m.fila + 1), texto: "FIFO: " + PENDIENTE, nota: "", prefijo: "FIFO: ", campo: "fifo", marco: i });
      lista.push({ a1: celda_(col + 2, m.fila + 1), texto: "Último uso: " + PENDIENTE, nota: "", prefijo: "Último uso: ", campo: "ultimoUso", marco: i });
    }
    return lista;
  }

  function textoDe_(valor) {
    if (valor === null || typeof valor === "undefined") return "";
    return String(valor);
  }

  function formatoVacio_(fmt) {
    return FORMATOS_VACIOS[fmt] === true;
  }

  function esDeEstePanel_(item, valor, nota) {
    if (valor === item.texto && (nota === "" || nota === item.nota || item.nota === "")) return true;
    if (item.prefijo && valor.indexOf(item.prefijo) === 0 && valor.length > item.prefijo.length) return true;
    return false;
  }

  function leerCeldaMeta_(hoja, item) {
    var rango = hoja.getRange(item.a1);
    return {
      valor: textoDe_(rango.getValue()),
      formula: rango.getFormula ? textoDe_(rango.getFormula()) : "",
      nota: rango.getNote ? textoDe_(rango.getNote()) : "",
      formato: rango.getNumberFormat ? textoDe_(rango.getNumberFormat()) : "General",
      validacion: rango.getDataValidation ? rango.getDataValidation() : null
    };
  }

  function zonaA1_() {
    var col = columnaMeta_();
    return celda_(col, RAM_START_ROW - 1) + ":" + celda_(col + 2, RAM_START_ROW + 15);
  }

  function combinaciones_(hoja, a1) {
    var rango = hoja.getRange(a1);
    if (!rango.getMergedRanges) return [];
    return rango.getMergedRanges();
  }

  function graficosEn_(hoja, col0, fila0, col1, fila1) {
    if (!hoja.getCharts) return [];
    var lista = hoja.getCharts();
    var dentro = [];
    var i;
    for (i = 0; i < lista.length; i++) {
      var info = lista[i].getContainerInfo ? lista[i].getContainerInfo() : null;
      if (!info || !info.getAnchorColumn) continue;
      var col = info.getAnchorColumn();
      var fila = info.getAnchorRow();
      if (col >= col0 && col <= col1 && fila >= fila0 && fila <= fila1) dentro.push(columnaA1_(col) + fila);
    }
    return dentro;
  }

  function enteroEn_(n, min, max) {
    return typeof n === "number" && n === n && n !== Infinity && n !== -Infinity && Math.floor(n) === n && n >= min && n <= max;
  }

  function entradaValida_(campo, valor) {
    if (valor === null) return true;
    if (campo === "vpn") return enteroEn_(valor, 0, 15);
    if (campo === "dirty") return typeof valor === "boolean";
    if (campo === "fifo") return enteroEn_(valor, 0, 7);
    if (campo === "ultimoUso") return enteroEn_(valor, 0, 1000000);
    return false;
  }

  function marcoEstadoVacio_() {
    return { vpn: null, dirty: null, fifo: null, ultimoUso: null };
  }

  function estadoVacio_() {
    var frames = [];
    var i;
    for (i = 0; i < 8; i++) frames.push(marcoEstadoVacio_());
    return { version: 1, frames: frames };
  }

  function clonarEstado_(estado) {
    return JSON.parse(JSON.stringify(estado));
  }

  function textoCampo_(campo, valor) {
    if (campo === "vpn") return valor === null ? "VPN: " + VPN_LIBRE : "VPN: " + valor;
    if (campo === "dirty") {
      if (valor === null) return "Dirty: " + PENDIENTE;
      return valor ? "Dirty: 1" : "Dirty: 0";
    }
    if (campo === "fifo") return valor === null ? "FIFO: " + PENDIENTE : "FIFO: " + valor;
    return valor === null ? "Último uso: " + PENDIENTE : "Último uso: " + valor;
  }

  function parseTextoCampo_(campo, texto) {
    var m;
    var n;
    if (campo === "vpn") {
      if (texto === "VPN: " + VPN_LIBRE) return { ok: true, valor: null };
      m = /^VPN: (0|[1-9]\d*)$/.exec(texto);
      if (!m) return { ok: false };
      n = parseInt(m[1], 10);
      if (!entradaValida_("vpn", n)) return { ok: false };
      return { ok: true, valor: n };
    }
    if (campo === "dirty") {
      if (texto === "Dirty: " + PENDIENTE) return { ok: true, valor: null };
      if (texto === "Dirty: 1") return { ok: true, valor: true };
      if (texto === "Dirty: 0") return { ok: true, valor: false };
      return { ok: false };
    }
    if (campo === "fifo") {
      if (texto === "FIFO: " + PENDIENTE) return { ok: true, valor: null };
      m = /^FIFO: (0|[1-9]\d*)$/.exec(texto);
      if (!m) return { ok: false };
      n = parseInt(m[1], 10);
      if (!entradaValida_("fifo", n)) return { ok: false };
      return { ok: true, valor: n };
    }
    if (texto === "Último uso: " + PENDIENTE) return { ok: true, valor: null };
    m = /^Último uso: (0|[1-9]\d*)$/.exec(texto);
    if (!m) return { ok: false };
    n = parseInt(m[1], 10);
    if (!entradaValida_("ultimoUso", n)) return { ok: false };
    return { ok: true, valor: n };
  }

  function estadoValido_(obj) {
    if (!obj || obj.version !== 1 || !obj.frames || obj.frames.length !== 8) return false;
    var i;
    var c;
    for (i = 0; i < 8; i++) {
      if (!obj.frames[i]) return false;
      for (c = 0; c < CAMPOS.length; c++) {
        if (!entradaValida_(CAMPOS[c], obj.frames[i][CAMPOS[c]])) return false;
      }
    }
    return true;
  }

  function propiedades_() {
    if (typeof PropertiesService === "undefined" || !PropertiesService.getDocumentProperties) {
      throw new Error("MarcosRAM: PropertiesService no está disponible. No se escribió nada.");
    }
    return PropertiesService.getDocumentProperties();
  }

  function cargarEstado_() {
    var raw = propiedades_().getProperty(CLAVE);
    if (!raw) return null;
    var obj;
    try { obj = JSON.parse(raw); } catch (e) { obj = null; }
    if (!estadoValido_(obj)) {
      throw new Error("MarcosRAM: el estado guardado no es válido. No se escribió nada.");
    }
    return obj;
  }

  function guardarEstado_(estado) {
    propiedades_().setProperty(CLAVE, JSON.stringify(estado));
  }

  function igualEstado_(a, b) {
    var i;
    var c;
    for (i = 0; i < 8; i++) {
      for (c = 0; c < CAMPOS.length; c++) {
        if (a.frames[i][CAMPOS[c]] !== b.frames[i][CAMPOS[c]]) return false;
      }
    }
    return true;
  }

  // Solo lecturas. No escribe.
  function preflight_(hoja) {
    var plan = planCeldas_();
    var conflictos = [];
    var acciones = [];
    var i;
    for (i = 0; i < plan.length; i++) {
      var item = plan[i];
      var leido = leerCeldaMeta_(hoja, item);
      var vacia = leido.valor === "" && leido.formula === "" && leido.nota === "" && !leido.validacion;
      if (leido.formula !== "") {
        conflictos.push(item.a1 + " tiene fórmula");
        continue;
      }
      if (leido.validacion) {
        conflictos.push(item.a1 + " tiene validación");
        continue;
      }
      if (item.nota) {
        if (leido.nota !== "" && leido.nota !== item.nota) {
          conflictos.push(item.a1 + " tiene otra nota");
          continue;
        }
      } else if (leido.nota !== "") {
        conflictos.push(item.a1 + " tiene una nota");
        continue;
      }
      if (vacia) {
        if (!formatoVacio_(leido.formato)) {
          conflictos.push(item.a1 + " está vacía pero con formato " + leido.formato);
          continue;
        }
        acciones.push({ item: item, escribir: true, vacia: true, valor: null, valorVista: "" });
        continue;
      }
      if (!item.campo) {
        if (leido.valor === item.texto) {
          acciones.push({ item: item, escribir: false, vacia: false, valorVista: leido.valor });
          continue;
        }
        conflictos.push(item.a1 + " contiene " + leido.valor);
        continue;
      }
      var parsed = parseTextoCampo_(item.campo, leido.valor);
      if (!parsed.ok) {
        conflictos.push(item.a1 + " contiene " + leido.valor);
        continue;
      }
      acciones.push({ item: item, escribir: false, vacia: false, valor: parsed.valor, valorVista: leido.valor });
    }
    var guardado = null;
    try { guardado = cargarEstado_(); } catch (eEstado) {
      conflictos.push(eEstado.message);
    }
    var destino = estadoVacio_();
    var pintarBordes = false;
    var iEstado;
    if (!guardado) {
      for (iEstado = 0; iEstado < acciones.length; iEstado++) {
        var accNuevo = acciones[iEstado];
        if (!accNuevo.item.campo || accNuevo.vacia) continue;
        destino.frames[accNuevo.item.marco][accNuevo.item.campo] = accNuevo.valor;
      }
    } else {
      destino = clonarEstado_(guardado);
      for (iEstado = 0; iEstado < acciones.length; iEstado++) {
        var accCmp = acciones[iEstado];
        if (!accCmp.item.campo || accCmp.vacia) continue;
        if (accCmp.valor !== destino.frames[accCmp.item.marco][accCmp.item.campo]) {
          conflictos.push(accCmp.item.a1 + " muestra " + accCmp.valorVista + " y el estado guardado no coincide");
        }
      }
    }
    for (iEstado = 0; iEstado < acciones.length; iEstado++) {
      var accTxt = acciones[iEstado];
      if (!accTxt.item.campo) {
        if (accTxt.vacia) pintarBordes = true;
        continue;
      }
      var deseado = textoCampo_(accTxt.item.campo, destino.frames[accTxt.item.marco][accTxt.item.campo]);
      if (accTxt.valorVista !== deseado) {
        accTxt.escribir = true;
        accTxt.item = {
          a1: accTxt.item.a1,
          texto: deseado,
          nota: "",
          prefijo: accTxt.item.prefijo,
          campo: accTxt.item.campo,
          marco: accTxt.item.marco
        };
      }
    }
    var mergesMeta = combinaciones_(hoja, zonaA1_());
    var mergesRam = combinaciones_(hoja, columnaA1_(RAM_START_COL) + RAM_START_ROW + ":" + columnaA1_(RAM_START_COL + 15) + (RAM_START_ROW + 15));
    if (mergesMeta.length) conflictos.push("celdas combinadas en " + zonaA1_());
    if (mergesRam.length) conflictos.push("celdas combinadas dentro de la RAM");
    var chartsMeta = graficosEn_(hoja, columnaMeta_(), RAM_START_ROW - 1, columnaMeta_() + 2, RAM_START_ROW + 15);
    var chartsRam = graficosEn_(hoja, RAM_START_COL, RAM_START_ROW, RAM_START_COL + 15, RAM_START_ROW + 15);
    if (chartsMeta.length) conflictos.push("gráfico anclado en " + chartsMeta.join(", "));
    if (chartsRam.length) conflictos.push("gráfico anclado en la RAM (" + chartsRam.join(", ") + ")");
    return { plan: plan, acciones: acciones, conflictos: conflictos, destino: destino, guardar: !guardado, pintarBordes: pintarBordes };
  }

  function aplicar_(hoja, revision) {
    var i;
    for (i = 0; i < revision.acciones.length; i++) {
      var acc = revision.acciones[i];
      if (!acc.escribir) continue;
      var rango = hoja.getRange(acc.item.a1);
      if (rango.setNumberFormat) rango.setNumberFormat("@");
      rango.setValue(acc.item.texto);
      if (acc.item.nota && rango.setNote) rango.setNote(acc.item.nota);
    }
    if (!revision.pintarBordes) return;
    for (i = 0; i < 8; i++) {
      var m = marco_(i);
      var borde = hoja.getRange(m.rango);
      borde.setBorder(true, true, true, true, null, true, colorMarco_(i), SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    }
  }

  function preparar() {
    exigirConfig_();
    var hoja = hoja_();
    Logger.log("MarcosRAM: preflight " + zonaA1_() + " en \"" + SHEET_NAME + "\". La columna AE no se modifica.");
    var revision = preflight_(hoja);
    if (revision.conflictos.length) {
      var n = Math.min(revision.conflictos.length, 8);
      var k;
      for (k = 0; k < n; k++) Logger.log("FALLO  " + revision.conflictos[k]);
      Logger.log("MarcosRAM abortada sin cambios.");
      throw new Error("prepararMarcosRAM abortada sin cambios (" + revision.conflictos.length + " conflictos).");
    }
    aplicar_(hoja, revision);
    if (revision.guardar) guardarEstado_(revision.destino);
    Logger.log("OK  metadatos libres o ya de este panel");
    Logger.log("OK  sin celdas combinadas ni gráfico anclado en la zona ni en la RAM");
    var i;
    for (i = 0; i < 8; i++) {
      var m = marco_(i);
      Logger.log("OK  marco " + i + " borde " + m.rango + " (" + m.textoDir + ")");
    }
    Logger.log("RESUMEN prepararMarcosRAM: 10 OK, 0 fallos.");
    Logger.log("La RAM no se vacía ni se reformatea. No se cambian los anchos de AF, AG ni AH.");
  }

  function valorCampo_(hoja, marco, campo) {
    var m = marco_(marco);
    var col = columnaMeta_();
    var mapa = {
      vpn: { a1: celda_(col + 1, m.fila), prefijo: "VPN: " },
      dirty: { a1: celda_(col + 2, m.fila), prefijo: "Dirty: " },
      fifo: { a1: celda_(col + 1, m.fila + 1), prefijo: "FIFO: " },
      ultimoUso: { a1: celda_(col + 2, m.fila + 1), prefijo: "Último uso: " }
    };
    var item = mapa[campo];
    if (!item) throw new Error("MarcosRAM: campo desconocido. Use vpn, dirty, fifo o ultimoUso.");
    var valor = textoDe_(hoja.getRange(item.a1).getValue());
    var estado = valor.indexOf(item.prefijo) === 0 ? valor.substring(item.prefijo.length) : valor;
    return { item: item, estado: estado, completo: valor };
  }

  function exigirMarco_(marco) {
    if (typeof marco !== "number" || marco !== marco || Math.floor(marco) !== marco || marco < 0 || marco > 7) {
      throw new Error("MarcosRAM: el marco debe ser un entero 0..7. No se escribió nada.");
    }
  }

  function establecer(marco, campo, valor) {
    exigirConfig_();
    exigirMarco_(marco);
    if (CAMPOS.indexOf(campo) === -1) {
      throw new Error("MarcosRAM: campo desconocido. Use vpn, dirty, fifo o ultimoUso. No se escribió nada.");
    }
    if (!entradaValida_(campo, valor)) {
      throw new Error("MarcosRAM: valor no válido para " + campo + ". No se escribió nada.");
    }
    var estado = cargarEstado_();
    if (!estado) throw new Error("MarcosRAM: ejecuta prepararMarcosRAM antes de establecer. No se escribió nada.");
    var hoja = hoja_();
    var etiqueta = textoDe_(hoja.getRange(celda_(columnaMeta_(), marco_(marco).fila)).getValue());
    if (etiqueta !== "Marco " + marco) {
      throw new Error("MarcosRAM: ejecuta prepararMarcosRAM antes de establecer. No se escribió nada.");
    }
    var cCampo;
    for (cCampo = 0; cCampo < CAMPOS.length; cCampo++) {
      var otro = valorCampo_(hoja, marco, CAMPOS[cCampo]);
      var parseadoOtro = parseTextoCampo_(CAMPOS[cCampo], otro.completo);
      if (!parseadoOtro.ok || parseadoOtro.valor !== estado.frames[marco][CAMPOS[cCampo]]) {
        throw new Error("MarcosRAM: " + otro.item.a1 + " no coincide con el estado guardado. No se escribió nada.");
      }
      if (hoja.getRange(otro.item.a1).getFormula && textoDe_(hoja.getRange(otro.item.a1).getFormula()) !== "") {
        throw new Error("MarcosRAM: " + otro.item.a1 + " tiene fórmula. No se escribió nada.");
      }
    }
    var actual = valorCampo_(hoja, marco, campo);
    var nuevo = textoCampo_(campo, valor);
    var rango = hoja.getRange(actual.item.a1);
    var previo = rango.getValue();
    var formatoPrevio = rango.getNumberFormat ? rango.getNumberFormat() : "@";
    if (rango.setNumberFormat) rango.setNumberFormat("@");
    rango.setValue(nuevo);
    try {
      var copia = clonarEstado_(estado);
      copia.frames[marco][campo] = valor;
      guardarEstado_(copia);
    } catch (eGuardar) {
      rango.setValue(previo);
      if (rango.setNumberFormat) rango.setNumberFormat(formatoPrevio);
      throw eGuardar;
    }
    return valor;
  }

  function leer(marco, campo) {
    exigirConfig_();
    exigirMarco_(marco);
    if (CAMPOS.indexOf(campo) === -1) throw new Error("MarcosRAM: campo desconocido. Use vpn, dirty, fifo o ultimoUso.");
    var estado = cargarEstado_();
    if (!estado) throw new Error("MarcosRAM: ejecuta prepararMarcosRAM antes de leer.");
    var actual = valorCampo_(hoja_(), marco, campo);
    var parseado = parseTextoCampo_(campo, actual.completo);
    if (!parseado.ok || parseado.valor !== estado.frames[marco][campo]) {
      throw new Error("MarcosRAM: " + actual.item.a1 + " no coincide con el estado guardado.");
    }
    return estado.frames[marco][campo];
  }

  function describir(marco) {
    exigirConfig_();
    exigirMarco_(marco);
    var m = marco_(marco);
    return {
      marco: marco,
      rango: m.rango,
      dir0: m.dir0,
      dir1: m.dir1,
      vpn: leer(marco, "vpn"),
      dirty: leer(marco, "dirty"),
      fifo: leer(marco, "fifo"),
      ultimoUso: leer(marco, "ultimoUso")
    };
  }

  function probarMetadatos() {
    exigirConfig_();
    var hoja = hoja_();
    if (textoDe_(hoja.getRange(celda_(columnaMeta_(), RAM_START_ROW)).getValue()) !== "Marco 0") {
      throw new Error("probarMetadatosMarco: ejecuta prepararMarcosRAM antes. No se escribió nada.");
    }
    var props = propiedades_();
    var crudo = props.getProperty(CLAVE);
    var plan = planCeldas_();
    var backup = [];
    var i;
    for (i = 0; i < plan.length; i++) {
      var rangoBak = hoja.getRange(plan[i].a1);
      backup.push({
        a1: plan[i].a1,
        valor: rangoBak.getValue(),
        formato: rangoBak.getNumberFormat ? rangoBak.getNumberFormat() : "General",
        nota: rangoBak.getNote ? rangoBak.getNote() : ""
      });
    }
    var anchos = [];
    var colAncho;
    for (colAncho = columnaMeta_(); colAncho <= columnaMeta_() + 2; colAncho++) {
      anchos.push(hoja.getColumnWidth ? hoja.getColumnWidth(colAncho) : null);
    }
    var ram = hoja.getRange(RAM_START_ROW, RAM_START_COL, 16, 16);
    var ramValor = ram.getValues();
    var ramFormula = ram.getFormulas ? ram.getFormulas() : null;
    var ramFormato = ram.getNumberFormats ? ram.getNumberFormats() : null;
    var ramFondo = ram.getBackgrounds ? ram.getBackgrounds() : null;
    var ok = 0;
    var mal = 0;
    function registrar(bien, mensaje) {
      if (bien) { ok++; Logger.log("OK  " + mensaje); }
      else { mal++; Logger.log("FALLO  " + mensaje); }
    }
    function foto() {
      return props.getProperty(CLAVE) + "|" + hoja.getRange("AG16").getValue() + "|" + hoja.getRange("AH16").getValue() + "|" + hoja.getRange("AG17").getValue() + "|" + hoja.getRange("AH17").getValue();
    }
    Logger.log("MetadatosMarco: prueba reversible en el marco 4. No cambia anchos ni la RAM.");
    try {
      establecer(4, "vpn", 0);
      establecer(4, "vpn", 15);
      registrar(leer(4, "vpn") === 15 && hoja.getRange("AG16").getValue() === "VPN: 15", "VPN 0 y 15 quedan como número de página");
      establecer(4, "vpn", null);
      registrar(leer(4, "vpn") === null && hoja.getRange("AG16").getValue() === "VPN: sin asignar", "VPN null vuelve a sin asignar");
      establecer(4, "dirty", true);
      establecer(4, "dirty", false);
      registrar(leer(4, "dirty") === false && hoja.getRange("AH16").getValue() === "Dirty: 0", "Dirty acepta true y false, no un texto");
      establecer(4, "dirty", null);
      registrar(leer(4, "dirty") === null && hoja.getRange("AH16").getValue() === "Dirty: pendiente", "Dirty null vuelve a pendiente");
      establecer(4, "fifo", 0);
      establecer(4, "fifo", 7);
      registrar(leer(4, "fifo") === 7 && hoja.getRange("AG17").getValue() === "FIFO: 7", "FIFO 0..7 se guarda explícito, sin reloj");
      establecer(4, "ultimoUso", 40);
      registrar(leer(4, "ultimoUso") === 40 && hoja.getRange("AH17").getValue() === "Último uso: 40", "el último uso 40 queda tal cual, sin leer la hora");
      var antesRechazo = foto();
      var rechazos = [
        function () { establecer(8, "vpn", 1); },
        function () { establecer(-1, "vpn", 1); },
        function () { establecer(1.5, "vpn", 1); },
        function () { establecer(4, "vpn", 16); },
        function () { establecer(4, "vpn", -1); },
        function () { establecer(4, "vpn", 1.5); },
        function () { establecer(4, "vpn", "15"); },
        function () { establecer(4, "dirty", 1); },
        function () { establecer(4, "dirty", 0); },
        function () { establecer(4, "dirty", "true"); },
        function () { establecer(4, "fifo", 8); },
        function () { establecer(4, "fifo", -1); },
        function () { establecer(4, "ultimoUso", -1); },
        function () { establecer(4, "ultimoUso", 1.5); },
        function () { establecer(4, "presente", true); }
      ];
      var rechazosOk = true;
      var r;
      for (r = 0; r < rechazos.length; r++) {
        var lanzo = false;
        try { rechazos[r](); } catch (eRechazo) { lanzo = String(eRechazo && eRechazo.message).indexOf("MarcosRAM:") === 0; }
        if (!lanzo || foto() !== antesRechazo) rechazosOk = false;
      }
      registrar(rechazosOk, "argumentos rechazados no escriben panel ni estado");
      hoja.getRange("AG16").setValue("VPN: 4");
      var crudoTamper = props.getProperty(CLAVE);
      var tamper = false;
      try { establecer(4, "dirty", true); } catch (eTamper) { tamper = String(eTamper && eTamper.message).indexOf("no coincide") !== -1; }
      registrar(tamper && props.getProperty(CLAVE) === crudoTamper && hoja.getRange("AH16").getValue() === "Dirty: pendiente", "un panel alterado no pisa el estado");
      hoja.getRange("AG16").setValue("VPN: sin asignar");
      establecer(4, "vpn", 15);
      preparar();
      var anchosIguales = true;
      if (hoja.getColumnWidth) {
        for (colAncho = 0; colAncho < anchos.length; colAncho++) {
          if (hoja.getColumnWidth(columnaMeta_() + colAncho) !== anchos[colAncho]) anchosIguales = false;
        }
      }
      registrar(leer(4, "vpn") === 15 && anchosIguales, "repetir preparar conserva el VPN 15 y los anchos");
    } catch (ePrueba) {
      registrar(false, "excepción: " + ePrueba.message);
    } finally {
      var j;
      for (j = 0; j < backup.length; j++) {
        var celdaBak = hoja.getRange(backup[j].a1);
        if (celdaBak.setNumberFormat) celdaBak.setNumberFormat(backup[j].formato);
        celdaBak.setValue(backup[j].valor);
        if (celdaBak.setNote) celdaBak.setNote(backup[j].nota);
      }
      if (crudo) props.setProperty(CLAVE, crudo);
      else if (props.deleteProperty) props.deleteProperty(CLAVE);
    }
    var ramIgual = true;
    var ram2 = hoja.getRange(RAM_START_ROW, RAM_START_COL, 16, 16);
    var v2 = ram2.getValues();
    var f2 = ram2.getFormulas ? ram2.getFormulas() : null;
    var n2 = ram2.getNumberFormats ? ram2.getNumberFormats() : null;
    var b2 = ram2.getBackgrounds ? ram2.getBackgrounds() : null;
    var rr;
    var cc;
    for (rr = 0; rr < 16 && ramIgual; rr++) {
      for (cc = 0; cc < 16; cc++) {
        if (v2[rr][cc] !== ramValor[rr][cc]) ramIgual = false;
        if (ramFormula && f2 && f2[rr][cc] !== ramFormula[rr][cc]) ramIgual = false;
        if (ramFormato && n2 && n2[rr][cc] !== ramFormato[rr][cc]) ramIgual = false;
        if (ramFondo && b2 && b2[rr][cc] !== ramFondo[rr][cc]) ramIgual = false;
      }
    }
    var anchoFinal = true;
    if (hoja.getColumnWidth) {
      for (colAncho = 0; colAncho < anchos.length; colAncho++) {
        if (hoja.getColumnWidth(columnaMeta_() + colAncho) !== anchos[colAncho]) anchoFinal = false;
      }
    }
    registrar(ramIgual && anchoFinal, "la RAM y los anchos AF:AH quedaron como al inicio");
    Logger.log("RESUMEN probarMetadatosMarco: " + ok + " OK, " + mal + " fallos.");
    if (mal > 0) throw new Error("probarMetadatosMarco: " + mal + " fallos. Se intentó restaurar el panel y el estado.");
  }

  function iniciales_() {
    return {
      vpn: VPN_LIBRE,
      dirty: PENDIENTE,
      fifo: PENDIENTE,
      ultimoUso: PENDIENTE
    };
  }

  function probar() {
    exigirConfig_();
    var hoja = hoja_();
    var ok = 0;
    var mal = 0;
    function registrar(bien, mensaje) {
      if (bien) { ok++; Logger.log("OK  " + mensaje); }
      else { mal++; Logger.log("FALLO  " + mensaje); }
    }
    Logger.log("MarcosRAM: solo lectura en \"" + SHEET_NAME + "\".");

    var cubre = [];
    var i;
    var solape = false;
    for (i = 0; i < 256; i++) cubre[i] = 0;
    for (i = 0; i < 8; i++) {
      var m = marco_(i);
      var d;
      if (m.dir1 - m.dir0 !== 31) solape = true;
      for (d = m.dir0; d <= m.dir1; d++) cubre[d]++;
    }
    var completo = !solape;
    for (i = 0; i < 256; i++) if (cubre[i] !== 1) completo = false;
    registrar(completo, "0..255 cubiertos por 8 marcos de 32 bytes, sin solapes");
    for (i = 0; i < 8; i++) {
      var mm = marco_(i);
      registrar(mm.dir0 === i * 32 && mm.dir1 === i * 32 + 31, "marco " + i + " " + mm.rango + " = " + mm.textoDir);
    }

    var plan = planCeldas_();
    var etiquetas = true;
    var iniciales = true;
    var presentes = true;
    for (i = 0; i < plan.length; i++) {
      var leido = leerCeldaMeta_(hoja, plan[i]);
      if (leido.formula !== "") presentes = false;
      if (plan[i].prefijo) {
        if (leido.valor.indexOf(plan[i].prefijo) !== 0) {
          presentes = false;
          iniciales = false;
        } else if (leido.valor !== plan[i].texto) iniciales = false;
      } else if (leido.valor !== plan[i].texto) {
        etiquetas = false;
        presentes = false;
      }
    }
    registrar(etiquetas && presentes, "etiquetas Marco 0..7 y rangos 00H-1FH … E0H-FFH en AF:AH");
    if (iniciales && presentes) {
      registrar(true, "VPN sin asignar; Dirty, FIFO y último uso pendientes");
    } else if (presentes) {
      registrar(true, "metadatos ya escritos a propósito, no deducidos de la RAM");
    } else {
      registrar(false, "falta el panel; ejecuta prepararMarcosRAM. Esta verificación no escribe");
    }
    registrar(true, "esta verificación no escribe celdas");
    Logger.log("RESUMEN probarMarcosRAM: " + ok + " OK, " + mal + " fallos.");
    if (mal > 0) throw new Error("probarMarcosRAM: " + mal + " fallos. No se escribió nada.");
  }

  return {
    preparar: preparar,
    probar: probar,
    probarMetadatos: probarMetadatos,
    establecer: establecer,
    leer: leer,
    describir: describir,
    iniciales: iniciales_,
    marco: marco_
  };
})();

function prepararMarcosRAM() {
  return MarcosRAM.preparar();
}

function probarMarcosRAM() {
  return MarcosRAM.probar();
}

function probarMetadatosMarco() {
  return MarcosRAM.probarMetadatos();
}
