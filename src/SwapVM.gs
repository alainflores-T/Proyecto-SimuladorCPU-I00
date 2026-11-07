// SwapVM.gs
// Memoria virtual de 512 bytes: 16 páginas de 32 bytes. Issue 23.
// Copia personal de @Gunter310. Hoja propia "Swap", nunca la hoja activa.
// No carga páginas en la RAM, no traduce direcciones y no toca los marcos del issue 22.
//
// Dirección virtual 0..511, 9 bits: VPN = dirección >> 5 (0..15),
// desplazamiento = dirección & 31 (0..31).
// Número 32 es la dirección 32. El texto "20" no es dirección.
// "20H" es 32. "1FFH" es 511. "200H" no cabe.
//
// Un valor puede ser un entero 0..255, un texto HEX "20H", BIN "00010100B",
// un decimal en texto "20" o una instrucción "LD AX, 20H". No se enmascara.

var SwapVM = (function () {
  var HOJA = "Swap";
  var NOTA = "SWAPVM-v1";
  var FILA0 = 3;
  var COL0 = 2;
  var COL_ESTADO = 34;

  function libro_() {
    if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) {
      throw new Error("SwapVM: SpreadsheetApp no está disponible.");
    }
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    if (!libro) throw new Error("SwapVM: no hay un libro activo.");
    return libro;
  }

  function entero_(n, min, max) {
    return typeof n === "number" && n === n && n !== Infinity && n !== -Infinity && Math.floor(n) === n && n >= min && n <= max;
  }

  function validarVpn_(vpn) {
    if (!entero_(vpn, 0, 15)) throw new Error("SwapVM: la página debe ser un entero 0..15.");
    return vpn + 0;
  }

  function validarDireccion_(addr) {
    if (typeof addr === "number") {
      if (!entero_(addr, 0, 511)) throw new Error("SwapVM: dirección virtual fuera de 0..511.");
      return addr + 0;
    }
    if (typeof addr === "string") {
      var texto = addr.trim();
      if (!/^[0-9A-Fa-f]{1,3}H$/.test(texto)) {
        throw new Error("SwapVM: dirección de texto rechazada (" + addr + "). Use un entero 0..511 o HEX con H, como 20H o 1FFH.");
      }
      var n = parseInt(texto.substring(0, texto.length - 1), 16);
      if (!entero_(n, 0, 511)) throw new Error("SwapVM: dirección HEX fuera de 0..511 (" + texto + ").");
      return n;
    }
    throw new Error("SwapVM: tipo de dirección no admitido.");
  }

  function validarValor_(value) {
    if (typeof value === "number") {
      if (!entero_(value, 0, 255)) throw new Error("SwapVM: valor numérico fuera de 0..255. No se enmascara.");
      return value + 0;
    }
    if (typeof value !== "string") throw new Error("SwapVM: el valor debe ser un byte o texto de instrucción.");
    if (value === "") return "";
    if (/^[0-9A-Fa-f]{1,2}H$/.test(value)) return value;
    if (/^[01]{1,8}B$/.test(value)) return value;
    if (value.indexOf(" ") === -1 && value.indexOf(",") === -1 && /[HhBb]$/.test(value)) {
      throw new Error("SwapVM: literal de byte malformado (" + value + ").");
    }
    if (/^[0-9]{1,3}$/.test(value)) {
      var decimal = parseInt(value, 10);
      if (decimal > 255) throw new Error("SwapVM: decimal de texto fuera de 0..255 (" + value + ").");
      return value;
    }
    if (/^0x/i.test(value) || /^[+-]/.test(value) || value.indexOf(".") !== -1) {
      throw new Error("SwapVM: valor malformado (" + value + ").");
    }
    if (/^(NaN|Infinity|-Infinity|undefined|null|true|false)$/.test(value)) {
      throw new Error("SwapVM: valor malformado (" + value + ").");
    }
    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value) || value.indexOf(" ") !== -1 || value.indexOf(",") !== -1 || value.indexOf("[") !== -1) {
      return value;
    }
    throw new Error("SwapVM: valor malformado (" + value + ").");
  }

  function describir_(addr) {
    var n = validarDireccion_(addr);
    return { direccion: n, vpn: n >> 5, desplazamiento: n & 31 };
  }

  function filaPagina_(vpn) {
    return FILA0 + validarVpn_(vpn);
  }

  function hojaSiExiste_() {
    return libro_().getSheetByName(HOJA);
  }

  function esNuestra_(hoja) {
    if (!hoja) return false;
    var nota = "";
    try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (e) { nota = ""; }
    return nota === NOTA;
  }

  function zonaVacia_(hoja) {
    var valores = hoja.getRange(1, 1, 18, 34).getValues();
    var formulas = hoja.getRange(1, 1, 18, 34).getFormulas();
    var r, c;
    for (r = 0; r < valores.length; r++) {
      for (c = 0; c < valores[r].length; c++) {
        if (String(valores[r][c]) !== "" || String(formulas[r][c] || "") !== "") return false;
      }
    }
    return true;
  }

  function hex3_(n) {
    var s = n.toString(16).toUpperCase();
    while (s.length < 3) s = "0" + s;
    return s + "H";
  }

  function hexOff_(n) {
    var s = n.toString(16).toUpperCase();
    if (s.length < 2) s = "0" + s;
    return "+" + s;
  }

  function escribirCabecera_(hoja) {
    var titulo = hoja.getRange(1, 1);
    titulo.setValue("Swap / Memoria virtual");
    if (titulo.setNote) titulo.setNote(NOTA);
    hoja.getRange(2, 1).setValue("Página");
    var offs = [[]];
    var i;
    for (i = 0; i < 32; i++) offs[0].push(hexOff_(i));
    hoja.getRange(2, COL0, 1, 32).setValues(offs);
    hoja.getRange(2, COL_ESTADO).setValue("En RAM");
    for (i = 0; i < 16; i++) {
      var fila = FILA0 + i;
      var inicio = i * 32;
      hoja.getRange(fila, 1).setValue("Página " + i + "  " + hex3_(inicio) + "-" + hex3_(inicio + 31));
    }
  }

  function iniciarDatosVacios_(hoja) {
    var vacio = [];
    var r;
    for (r = 0; r < 16; r++) {
      var fila = [];
      var c;
      for (c = 0; c < 32; c++) fila.push("");
      vacio.push(fila);
    }
    var datos = hoja.getRange(FILA0, COL0, 16, 32);
    if (datos.setNumberFormat) datos.setNumberFormat("@");
    datos.setValues(vacio);
    var estados = [];
    for (r = 0; r < 16; r++) estados.push(["no"]);
    hoja.getRange(FILA0, COL_ESTADO, 16, 1).setValues(estados);
  }

  function instalar_() {
    var libro = libro_();
    var hoja = libro.getSheetByName(HOJA);
    if (!hoja) {
      hoja = libro.insertSheet(HOJA);
      escribirCabecera_(hoja);
      iniciarDatosVacios_(hoja);
      return hoja;
    }
    if (!esNuestra_(hoja)) {
      if (!zonaVacia_(hoja)) throw new Error("SwapVM: la hoja Swap existe y no es de este módulo. No se escribió nada.");
      escribirCabecera_(hoja);
      iniciarDatosVacios_(hoja);
      return hoja;
    }
    return hoja;
  }

  function exigirHoja_() {
    var hoja = hojaSiExiste_();
    if (!hoja || !esNuestra_(hoja)) throw new Error("SwapVM: ejecuta instalarYProbarIssue23 para crear la hoja Swap.");
    return hoja;
  }

  function leerBloque_(vpn) {
    var n = validarVpn_(vpn);
    var hoja = exigirHoja_();
    var fila = hoja.getRange(filaPagina_(n), COL0, 1, 32).getValues()[0];
    var copia = [];
    var i;
    for (i = 0; i < 32; i++) copia.push(fila[i]);
    return copia;
  }

  function escribirBloque_(vpn, bloque) {
    var n = validarVpn_(vpn);
    if (!bloque || typeof bloque === "string" || typeof bloque.length !== "number" || bloque.length !== 32) {
      throw new Error("SwapVM: writeSwap necesita un bloque de exactamente 32 valores.");
    }
    var limpio = [];
    var i;
    for (i = 0; i < 32; i++) limpio.push(validarValor_(bloque[i]));
    var hoja = exigirHoja_();
    var rango = hoja.getRange(filaPagina_(n), COL0, 1, 32);
    if (rango.setNumberFormat) rango.setNumberFormat("@");
    rango.setValues([limpio]);
    return limpio;
  }

  function leerByte_(addr) {
    var d = describir_(addr);
    return leerBloque_(d.vpn)[d.desplazamiento];
  }

  function escribirByte_(addr, valor) {
    var d = describir_(addr);
    var guardar = validarValor_(valor);
    var hoja = exigirHoja_();
    var rango = hoja.getRange(filaPagina_(d.vpn), COL0 + d.desplazamiento);
    if (rango.setNumberFormat) rango.setNumberFormat("@");
    rango.setValue(guardar);
    return guardar;
  }

  function marcar_(vpn, enRam) {
    var n = validarVpn_(vpn);
    if (typeof enRam !== "boolean") throw new Error("SwapVM: En RAM solo acepta true o false. No se mira la RAM física.");
    var hoja = exigirHoja_();
    hoja.getRange(filaPagina_(n), COL_ESTADO).setValue(enRam ? "sí" : "no");
    return enRam ? "sí" : "no";
  }

  function cargarPrograma_() {
    var libro = libro_();
    var programas = libro.getSheetByName("Programas");
    if (!programas) throw new Error("SwapVM: no existe la hoja Programas. No se vació el swap.");
    var datos = programas.getRange("A2:A18").getValues();
    var hoja = instalar_();
    if (!esNuestra_(hoja)) throw new Error("SwapVM: la hoja Swap no es de este módulo. No se vació nada.");
    var vacio = [];
    var r;
    for (r = 0; r < 16; r++) {
      var fila = [];
      var c;
      for (c = 0; c < 32; c++) fila.push("");
      vacio.push(fila);
    }
    var rango = hoja.getRange(FILA0, COL0, 16, 32);
    if (rango.setNumberFormat) rango.setNumberFormat("@");
    rango.setValues(vacio);
    var estados = [];
    for (r = 0; r < 16; r++) estados.push(["no"]);
    hoja.getRange(FILA0, COL_ESTADO, 16, 1).setValues(estados);
    var i;
    for (i = 0; i < datos.length && i < 32; i++) {
      var instruccion = datos[i][0];
      if (instruccion === "" || instruccion === null || typeof instruccion === "undefined") continue;
      if (typeof instruccion !== "number" && typeof instruccion !== "string") continue;
      escribirByte_(i, instruccion);
    }
  }

  function mismo_(a, b) {
    if (a === b) return true;
    if (typeof a === "number" && typeof b === "number" && a !== a && b !== b) return true;
    return false;
  }

  function probar() {
    var libro = libro_();
    var hojaPrincipal = null;
    var muestra = null;
    if (typeof SHEET_NAME !== "undefined") hojaPrincipal = libro.getSheetByName(SHEET_NAME);
    if (hojaPrincipal && typeof RAM_START_ROW !== "undefined" && typeof RAM_START_COL !== "undefined") {
      var esquina = hojaPrincipal.getRange(RAM_START_ROW, RAM_START_COL);
      muestra = {
        v: esquina.getValue(),
        f: esquina.getFormula ? esquina.getFormula() : "",
        fmt: esquina.getNumberFormat ? esquina.getNumberFormat() : "",
        bg: esquina.getBackground ? esquina.getBackground() : null
      };
    }
    var previa = hojaSiExiste_();
    if (previa && !esNuestra_(previa) && !zonaVacia_(previa)) {
      throw new Error("SwapVM: la hoja Swap existe y no es de este módulo. No se escribió nada.");
    }
    instalar_();
    var hoja = exigirHoja_();
    var backupDatos = hoja.getRange(FILA0, COL0, 16, 32).getValues();
    var backupFormulas = hoja.getRange(FILA0, COL0, 16, 32).getFormulas();
    var backupFormatos = hoja.getRange(FILA0, COL0, 16, 32).getNumberFormats();
    var backupEstado = hoja.getRange(FILA0, COL_ESTADO, 16, 1).getValues();
    var ok = 0;
    var mal = 0;
    function registrar(bien, mensaje) {
      if (bien) { ok++; Logger.log("OK  " + mensaje); }
      else { mal++; Logger.log("FALLO  " + mensaje); }
    }
    Logger.log("SwapVM: hoja \"Swap\". 16 páginas x 32 bytes. La hoja activa no se usa.");
    try {
      var d0 = describir_(0);
      var d31 = describir_(31);
      var d32 = describir_("20H");
      var d511 = describir_("1FFH");
      registrar(d0.vpn === 0 && d0.desplazamiento === 0, "dirección 0 → página 0 desplazamiento 0");
      registrar(d31.vpn === 0 && d31.desplazamiento === 31, "dirección 31 → página 0 desplazamiento 31");
      registrar(describir_(32).vpn === 1 && describir_(32).desplazamiento === 0 && d32.direccion === 32, "32 y 20H son la página 1 desplazamiento 0");
      registrar(d511.direccion === 511 && d511.vpn === 15 && d511.desplazamiento === 31, "1FFH es 511, página 15 desplazamiento 31");
      var rechazadas = [512, -1, 1.5, "20", "200H", "zz", "20h", "", null];
      var i;
      var rechazos = true;
      for (i = 0; i < rechazadas.length; i++) {
        var lanzo = false;
        try { describir_(rechazadas[i]); } catch (eDir) { lanzo = String(eDir.message).indexOf("SwapVM:") === 0; }
        if (!lanzo) rechazos = false;
      }
      try { validarVpn_(16); } catch (eVpn) { if (String(eVpn.message).indexOf("SwapVM:") !== 0) rechazos = false; }
      try { validarVpn_(-1); } catch (eVpn2) { if (String(eVpn2.message).indexOf("SwapVM:") !== 0) rechazos = false; }
      registrar(rechazos, "direcciones y páginas inválidas se rechazan");

      escribirByte_(0, "LD AX, 20H");
      registrar(leerByte_(0) === "LD AX, 20H" && leerByte_("00H") === "LD AX, 20H", "la instrucción se conserva como texto");
      escribirByte_(31, "1FH");
      registrar(leerByte_(31) === "1FH" && readSwap(0)[31] === "1FH", "el byte 31 de la página 0 es 1FH");
      escribirByte_(32, 20);
      var leido32 = leerByte_(32);
      registrar((leido32 === 20 || leido32 === "20") && leido32 !== 32 && leerByte_("20H") !== "20H", "el número 20 en la dirección 32 no es 20H");
      escribirByte_(511, "FFH");
      registrar(leerByte_(511) === "FFH" && readSwap(15)[31] === "FFH", "511 cae en la página 15 desplazamiento 31");
      escribirByte_(511, "20");
      registrar(typeof leerByte_(511) === "string" && leerByte_(511) === "20", "el texto decimal 20 no se guarda como 32");

      var pagina14 = readSwap(14);
      var bloque = [];
      for (i = 0; i < 32; i++) bloque.push(i === 0 ? "ADD AX, BX" : "");
      var antes15 = readSwap(15)[0];
      var malo = bloque.slice();
      malo[10] = "GGH";
      var rechazoBloque = false;
      try { writeSwap(15, malo); } catch (eBloque) { rechazoBloque = String(eBloque.message).indexOf("SwapVM:") === 0; }
      var igual14 = true;
      var ahora14 = readSwap(14);
      for (i = 0; i < 32; i++) if (!mismo_(pagina14[i], ahora14[i])) igual14 = false;
      registrar(rechazoBloque && mismo_(readSwap(15)[0], antes15) && igual14, "un bloque inválido no escribe ni la página vecina");
      writeSwap(15, bloque);
      var leidoBloque = readSwap(15);
      registrar(leidoBloque.length === 32 && leidoBloque[0] === "ADD AX, BX" && leidoBloque[31] === "" && readSwap(14)[0] !== "ADD AX, BX", "writeSwap de 32 bytes no pisa la página anterior");

      marcarPaginaEnRAM(0, true);
      registrar(hoja.getRange(FILA0, COL_ESTADO).getValue() === "sí", "la página 0 se marca en RAM solo por la API");
      marcarPaginaEnRAM(0, false);
      registrar(hoja.getRange(FILA0, COL_ESTADO).getValue() === "no", "quitar la marca no lee la RAM física");
      var marcaMala = false;
      try { marcarPaginaEnRAM(1, "sí"); } catch (eMarca) { marcaMala = String(eMarca.message).indexOf("SwapVM:") === 0; }
      registrar(marcaMala && hoja.getRange(FILA0 + 1, COL_ESTADO).getValue() === "no", "En RAM rechaza un texto y no cambia la página 1");

      var programas = libro.getSheetByName("Programas");
      if (!programas) {
        registrar(false, "no existe la hoja Programas; no se recargó el swap");
      } else {
        cargarPrograma_();
        var primera = programas.getRange("A2").getValue();
        var cargada = leerByte_(0);
        var enRam = hoja.getRange(FILA0, COL_ESTADO).getValue();
        registrar(mismo_(cargada, primera) && enRam === "no", "el programa entra al swap y la página no queda marcada en RAM");
      }
    } catch (e) {
      registrar(false, "excepción: " + e.message);
    } finally {
      var rango = hoja.getRange(FILA0, COL0, 16, 32);
      if (rango.setNumberFormats) rango.setNumberFormats(backupFormatos);
      var rr, cc;
      for (rr = 0; rr < 16; rr++) {
        for (cc = 0; cc < 32; cc++) {
          var celda = hoja.getRange(FILA0 + rr, COL0 + cc);
          if (backupFormulas[rr][cc]) celda.setFormula(backupFormulas[rr][cc]);
          else celda.setValue(backupDatos[rr][cc]);
        }
      }
      hoja.getRange(FILA0, COL_ESTADO, 16, 1).setValues(backupEstado);
    }
    var intacta = true;
    if (muestra && hojaPrincipal) {
      var otra = hojaPrincipal.getRange(RAM_START_ROW, RAM_START_COL);
      if (!mismo_(otra.getValue(), muestra.v)) intacta = false;
      if ((otra.getFormula ? otra.getFormula() : "") !== muestra.f) intacta = false;
      if ((otra.getNumberFormat ? otra.getNumberFormat() : "") !== muestra.fmt) intacta = false;
      if ((otra.getBackground ? otra.getBackground() : null) !== muestra.bg) intacta = false;
    }
    registrar(intacta, "Hoja 1 no cambió");
    Logger.log("RESUMEN instalarYProbarIssue23: " + ok + " OK, " + mal + " fallos.");
    if (mal > 0) throw new Error("instalarYProbarIssue23: " + mal + " fallos. Se intentó restaurar el swap.");
    Logger.log("Swap listo: 16 páginas, 512 bytes. Ninguna página quedó marcada en RAM.");
  }

  return {
    instalar: instalar_,
    readSwap: leerBloque_,
    writeSwap: escribirBloque_,
    leerByte: leerByte_,
    escribirByte: escribirByte_,
    marcar: marcar_,
    cargarPrograma: cargarPrograma_,
    describir: describir_,
    probar: probar,
    esNuestra: esNuestra_,
    hoja: HOJA
  };
})();

function readSwap(vpn) { return SwapVM.readSwap(vpn); }
function writeSwap(vpn, bloque) { return SwapVM.writeSwap(vpn, bloque); }
function leerByteSwap(direccion) { return SwapVM.leerByte(direccion); }
function escribirByteSwap(direccion, valor) { return SwapVM.escribirByte(direccion, valor); }
function marcarPaginaEnRAM(vpn, enRam) { return SwapVM.marcar(vpn, enRam); }
function cargarProgramaEnSwap() { return SwapVM.cargarPrograma(); }
function instalarYProbarIssue23() { return SwapVM.probar(); }
