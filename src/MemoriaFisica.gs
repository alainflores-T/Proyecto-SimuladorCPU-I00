// MemoriaFisica.gs
// Copia personal de @Gunter310. Acceso físico de la RAM 16x16 (O8:AD23).
//
// Junto con los Util.gs, CPU.gs y loader.gs de este mismo entregable, la matriz
// se lee y se escribe solo desde aquí. Buses.gs no se reemplaza: ya entra por
// obtenerDatoRAM y obtenerCeldaRAM, y esos dos dejan de tocar la hoja activa.
// No dibuja marcos, ni metadatos, ni direcciones de teclado o LCD.
//
// Hoja: SHEET_NAME de Config.gs ("Hoja 1"), nunca la hoja activa.
// Así una prueba no escribe en la pestaña LOG ni en Historial.
// Matriz vigente: RAM_START_ROW = 8, RAM_START_COL = 15 → O8:AD23, 16x16, direcciones 0..255.
//
// Dirección física = PFN * 32 + desplazamiento.
// Cada marco ocupa 32 bytes y, en esta matriz, dos filas seguidas.
// Este archivo no dibuja marcos ni metadatos (VPN, Dirty, FIFO, último uso).
//
// Contrato de dirección (estricto, sin parseInt suelto):
//   - Número entero 0..255. El 20 es la dirección 20 (celda S9), no 32.
//   - Texto HEX con H mayúscula y 1 o 2 dígitos: "20H" es 32 (celda O10).
//   - Se recortan solo espacios de los extremos (" 20H " vale).
//   - Se rechaza "20", "20h", "0x20", "FF", "bad", vacíos, negativos,
//     fraccionarios, NaN, Infinity y cualquier valor > 255.
//   - No se usa parseInt sobre el texto completo: parseInt("20", 16) es 32,
//     parseInt("20H", 16) también es 32 (se detiene en la H) y parseInt("bad", 16)
//     es 2989 (0xBAD), no NaN. Un texto solo entra si el patrón HEX es exacto.
//
// Contrato de valor:
//   - Entero 0..255, guardado como número. Fuera de rango, fracción o NaN: error.
//     No se enmascara con & 0xFF (256 no se convierte en 0, -1 no se convierte en 255).
//   - Texto HEX "A5H", BIN "00010100B" o decimal "20": se guarda tal cual, sin
//     pasar "20" a 32 ni a número dentro de esta función.
//   - Una instrucción ("LD AX, 20H", "NOP", "ADD AX, BX") se guarda como texto.
//     No se interpreta como número.
//   - La hoja de cálculo, al recibir el texto "20", a veces lo guarda como número 20.
//     Eso no es hexadecimal. readPhysical devuelve el valor crudo de getValue().
//
// Teclado 8 B y LCD 8 B: NO se les asigna dirección aquí.
// En Decoder.gs, PORT_CODES (KBD = 00, LCD = 01) son puertos, no celdas de esta RAM.
// Esas ventanas quedan para cuando se acuerden; no se adivinan.

var memoriaFisica_ = (function () {

  function requerirConfig_() {
    if (typeof SHEET_NAME === "undefined" || typeof RAM_START_ROW === "undefined" || typeof RAM_START_COL === "undefined") {
      throw new Error("MemoriaFisica: faltan SHEET_NAME, RAM_START_ROW o RAM_START_COL (Config.gs).");
    }
  }

  // Misma idea que cargarDesdeHojaProgramas: la hoja se busca por nombre.
  // obtenerCeldaRAM usa la hoja activa; este módulo no.
  function hoja_() {
    requerirConfig_();
    if (typeof SpreadsheetApp === "undefined" || !SpreadsheetApp.getActiveSpreadsheet) {
      throw new Error("MemoriaFisica: SpreadsheetApp no está disponible.");
    }
    var libro = SpreadsheetApp.getActiveSpreadsheet();
    if (!libro) {
      throw new Error("MemoriaFisica: no hay un libro activo.");
    }
    var hoja = libro.getSheetByName(SHEET_NAME);
    if (!hoja) {
      throw new Error("MemoriaFisica: no existe la hoja \"" + SHEET_NAME + "\". No se usa la hoja activa.");
    }
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

  function validarDireccion_(addr) {
    if (typeof addr === "number") {
      if (addr !== addr || addr === Infinity || addr === -Infinity) {
        throw new Error("MemoriaFisica: dirección numérica inválida (NaN o infinito).");
      }
      if (Math.floor(addr) !== addr) {
        throw new Error("MemoriaFisica: dirección fraccionaria rechazada (" + addr + ").");
      }
      if (addr < 0 || addr > 255) {
        throw new Error("MemoriaFisica: dirección fuera de 0..255 (" + addr + ").");
      }
      return addr + 0;
    }

    if (typeof addr === "string") {
      var texto = addr.trim();
      // Solo HEX explícito. "20" no entra: sería ambiguo y el parseInt en base 16 lo volvería 32.
      if (!/^[0-9A-Fa-f]{1,2}H$/.test(texto)) {
        throw new Error("MemoriaFisica: dirección de texto rechazada (" + describir_(addr) + "). Use un entero 0..255 o HEX con H, como 20H.");
      }
      var n = parseInt(texto.substring(0, texto.length - 1), 16);
      if (n !== n || n < 0 || n > 255) {
        throw new Error("MemoriaFisica: dirección HEX fuera de 0..255 (" + texto + ").");
      }
      return n;
    }

    throw new Error("MemoriaFisica: tipo de dirección no admitido (" + describir_(addr) + ").");
  }

  function posicion_(addr) {
    var direccion = validarDireccion_(addr);
    var fila = RAM_START_ROW + Math.floor(direccion / 16);
    var columna = RAM_START_COL + (direccion % 16);
    return {
      direccion: direccion,
      fila: fila,
      columna: columna,
      a1: columnaA1_(columna) + fila,
      pfn: Math.floor(direccion / 32),
      desplazamiento: direccion % 32
    };
  }

  function validarValor_(value) {
    if (typeof value === "number") {
      if (value !== value || value === Infinity || value === -Infinity) {
        throw new Error("MemoriaFisica: valor numérico inválido (NaN o infinito). No se enmascara.");
      }
      if (Math.floor(value) !== value) {
        throw new Error("MemoriaFisica: valor fraccionario rechazado (" + value + "). No se enmascara.");
      }
      if (value < 0 || value > 255) {
        throw new Error("MemoriaFisica: valor fuera de 0..255 (" + value + "). No se enmascara.");
      }
      return value + 0;
    }

    if (typeof value !== "string") {
      throw new Error("MemoriaFisica: valor de tipo no admitido (" + describir_(value) + ").");
    }
    if (value === "") return "";

    // Byte HEX o BIN completo: se conserva el texto, no se convierte a número.
    if (/^[0-9A-Fa-f]{1,2}H$/.test(value)) return value;
    if (/^[01]{1,8}B$/.test(value)) return value;
    if (/^[0-9A-Fa-f]+H$/.test(value)) {
      throw new Error("MemoriaFisica: literal HEX inválido (" + value + "). Use 1 o 2 dígitos, por ejemplo A5H.");
    }
    // GGH, 20h, 2B, 100000000B: parecen un byte y no lo son.
    // "LD AX, 20H" lleva espacio, así que no entra en este rechazo.
    if (value.indexOf(" ") === -1 && value.indexOf(",") === -1 && /[HhBb]$/.test(value)) {
      throw new Error("MemoriaFisica: literal de byte malformado (" + value + ").");
    }

    if (/^[0-9]{1,3}$/.test(value)) {
      var decimal = parseInt(value, 10);
      if (decimal > 255) {
        throw new Error("MemoriaFisica: decimal de texto fuera de 0..255 (" + value + ").");
      }
      return value;
    }

    if (/^0x/i.test(value) || /^[+-]/.test(value) || value.indexOf(".") !== -1) {
      throw new Error("MemoriaFisica: valor malformado (" + value + ").");
    }
    if (/^(NaN|Infinity|-Infinity|undefined|null|true|false)$/.test(value)) {
      throw new Error("MemoriaFisica: valor malformado (" + value + ").");
    }

    // Instrucción u otro texto: no se convierte a número ni se recorta.
    if (/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(value) || value.indexOf(" ") !== -1 || value.indexOf(",") !== -1 || value.indexOf("[") !== -1) {
      return value;
    }

    throw new Error("MemoriaFisica: valor malformado (" + describir_(value) + ").");
  }

  function read(addr) {
    var pos = posicion_(addr);
    return hoja_().getRange(pos.fila, pos.columna).getValue();
  }

  function write(addr, value) {
    var pos = posicion_(addr);
    var guardar = validarValor_(value);
    hoja_().getRange(pos.fila, pos.columna).setValue(guardar);
    return guardar;
  }

  // La restauración no vuelve a validar el dato: debe devolver exactamente
  // lo que había, aunque sea una instrucción o un texto que no es un byte.
  function restaurar_(addr, original) {
    var pos = posicion_(addr);
    hoja_().getRange(pos.fila, pos.columna).setValue(original);
  }

  // Un solo getValues / setValues para no hacer 256 viajes de ida y vuelta.
  // escribirBloque no revalida cada celda: el formato y la restauración
  // reescriben instrucciones y textos que ya estaban en la matriz.
  // La escritura de una celda nueva sigue en writePhysical.
  function leerBloque() {
    var data = hoja_().getRange(RAM_START_ROW, RAM_START_COL, 16, 16).getValues();
    var copia = [];
    var i;
    for (i = 0; i < data.length; i++) copia[i] = data[i].slice();
    return copia;
  }

  function escribirBloque(matriz) {
    if (!matriz || matriz.length !== 16) {
      throw new Error("MemoriaFisica: el bloque físico debe tener 16 filas.");
    }
    var copia = [];
    var i;
    for (i = 0; i < 16; i++) {
      if (!matriz[i] || matriz[i].length !== 16) {
        throw new Error("MemoriaFisica: la fila " + i + " del bloque no tiene 16 celdas.");
      }
      copia[i] = matriz[i].slice();
    }
    hoja_().getRange(RAM_START_ROW, RAM_START_COL, 16, 16).setValues(copia);
  }

  function vaciar() {
    hoja_().getRange(RAM_START_ROW, RAM_START_COL, 16, 16).setValue("");
  }

  function limpiarFondo() {
    hoja_().getRange(RAM_START_ROW, RAM_START_COL, 16, 16).setBackground(null);
  }

  function pintarFondo(addr, color) {
    var pos = posicion_(addr);
    hoja_().getRange(pos.fila, pos.columna).setBackground(color);
  }

  function fondo(addr) {
    var pos = posicion_(addr);
    return hoja_().getRange(pos.fila, pos.columna).getBackground();
  }

  function fondoNeutro_(color) {
    if (color === null || typeof color === "undefined" || color === "") return true;
    var s = String(color).toLowerCase();
    return s === "#ffffff" || s === "#fff" || s === "white";
  }

  function mismoFondo_(a, b) {
    if (a === b) return true;
    if (typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase()) return true;
    if (fondoNeutro_(a) && fondoNeutro_(b)) return true;
    return false;
  }

  function esVerdeDatos_(color) {
    return String(color || "").toLowerCase().indexOf("c8e6c9") !== -1;
  }

  function describir_(v) {
    if (typeof v === "string") return "\"" + v + "\"";
    if (typeof v === "number" && v !== v) return "NaN";
    if (v === Infinity) return "Infinity";
    if (v === -Infinity) return "-Infinity";
    if (v === null) return "null";
    if (typeof v === "undefined") return "undefined";
    if (typeof v === "boolean") return v ? "true" : "false";
    return String(v);
  }

  function enteroDecimal_(v) {
    if (typeof v === "number") {
      if (v !== v || v === Infinity || v === -Infinity || Math.floor(v) !== v) return null;
      return v;
    }
    if (typeof v === "string" && /^[0-9]{1,3}$/.test(v)) {
      var n = parseInt(v, 10);
      if (n <= 255) return n;
    }
    return null;
  }

  // La hoja a veces convierte el texto "20" en el número 20 al guardarlo.
  // Esa pareja se acepta al comprobar la restauración. "20H", 32 y una instrucción no.
  function mismoValor_(a, b) {
    if (a === b) return true;
    if (typeof a === "number" && typeof b === "number" && a !== a && b !== b) return true;
    if (Object.prototype.toString.call(a) === "[object Date]" && Object.prototype.toString.call(b) === "[object Date]") {
      return a.getTime() === b.getTime();
    }
    var da = enteroDecimal_(a);
    var db = enteroDecimal_(b);
    if (da === null || db === null) return false;
    return da === db;
  }

  function pareceCentinela_(v, n) {
    return v === n || v === String(n);
  }

  function elegirCentinela_(original) {
    if (pareceCentinela_(original, 161)) return 90;
    return 161;
  }

  function rechaza_(fn) {
    try {
      fn();
      return false;
    } catch (e) {
      return String(e && e.message).indexOf("MemoriaFisica:") === 0;
    }
  }

  function probar() {
    requerirConfig_();
    if (SHEET_NAME !== "Hoja 1" || RAM_START_ROW !== 8 || RAM_START_COL !== 15) {
      Logger.log("FALLO  Config distinta de Hoja 1, fila 8, columna 15. No se escribió nada.");
      throw new Error("probarMemoriaFisica abortada: la RAM configurada no es O8:AD23.");
    }

    var hoja = hoja_();
    if (hoja.getName() !== SHEET_NAME) {
      throw new Error("MemoriaFisica: se abrió una hoja que no es \"" + SHEET_NAME + "\".");
    }

    var ok = 0;
    var mal = 0;
    function registrar(bien, mensaje) {
      if (bien) {
        ok++;
        Logger.log("OK  " + mensaje);
      } else {
        mal++;
        Logger.log("FALLO  " + mensaje);
      }
    }

    Logger.log("MemoriaFisica: hoja \"" + SHEET_NAME + "\" por nombre. La hoja activa no se consulta.");
    Logger.log("Contrato: entero 0..255, o HEX con H (20H = 32). La cadena \"20\" se rechaza.");

    registrar(true, "Config vigente: Hoja 1, fila 8, columna 15 (O8:AD23)");

    var p20 = posicion_(20);
    var p20h = posicion_("20H");
    registrar(p20.direccion === 20 && p20.a1 === "S9" && p20.fila === 9 && p20.columna === 19,
      "entero 20 → S9 fila 9 columna 19 (dirección 20, no 32)");
    registrar(p20h.direccion === 32 && p20h.a1 === "O10" && p20h.fila === 10 && p20h.columna === 15,
      "texto 20H → O10 fila 10 columna 15 (dirección 32)");
    registrar(posicion_("1FH").direccion === 31 && posicion_("FFH").direccion === 255 && posicion_("00H").direccion === 0,
      "1FH → 31, FFH → 255, 00H → 0");
    registrar(posicion_(" 20H ").direccion === 32 && rechaza_(function () { posicion_("20h"); }),
      "\" 20H \" se recorta y vale 32; \"20h\" se rechaza");
    registrar(posicion_(15).a1 === "AD8" && posicion_(16).a1 === "O9",
      "salto de fila cada 16: 15 → AD8 y 16 → O9");
    registrar(mismoValor_("20", 20) && !mismoValor_("20", 32) && !mismoValor_("20H", 32) && !mismoValor_("20H", 20) && !mismoValor_("LD AX, 20H", 32) && !mismoValor_(-1, 255),
      "al restaurar, 20 y \"20\" equivalen; \"20H\", la instrucción y -1 no se confunden");

    var vigiladas = [0, 1, 15, 16, 20, 31, 32, 33, 254, 255];
    var antes = {};
    var i;
    for (i = 0; i < vigiladas.length; i++) {
      antes[vigiladas[i]] = read(vigiladas[i]);
    }

    var dirMalas = [
      -1, 256, 1.5, NaN, Infinity,
      "bad", "zz", "20", "255", "FF", "100H", "GGH", "20h", "0x20", "20B", " 20 ", "",
      null, true, false, undefined, 255.9
    ];
    for (i = 0; i < dirMalas.length; i++) {
      var dirMala = dirMalas[i];
      var rechazada = rechaza_(function () { read(dirMala); }) && rechaza_(function () { write(dirMala, 1); });
      registrar(rechazada, "dirección rechazada " + describir_(dirMala));
    }

    var mapa = [
      { addr: 0, fila: 8, col: 15, a1: "O8", pfn: 0, off: 0 },
      { addr: 31, fila: 9, col: 30, a1: "AD9", pfn: 0, off: 31 },
      { addr: 32, fila: 10, col: 15, a1: "O10", pfn: 1, off: 0 },
      { addr: 255, fila: 23, col: 30, a1: "AD23", pfn: 7, off: 31 }
    ];

    function probarCelda_(esp) {
      var pos = posicion_(esp.addr);
      var mapeoOk = pos.fila === esp.fila && pos.columna === esp.col && pos.a1 === esp.a1 &&
        pos.pfn === esp.pfn && pos.desplazamiento === esp.off &&
        pos.direccion === (esp.pfn * 32 + esp.off);
      registrar(mapeoOk, "mapeo " + esp.addr + " → " + pos.a1 + " fila " + pos.fila + " columna " + pos.columna + ", marco " + pos.pfn + " desplazamiento " + pos.desplazamiento);

      var original = read(esp.addr);
      var centinela = elegirCentinela_(original);
      try {
        var escrito = write(esp.addr, centinela);
        var leidoCen = read(esp.addr);
        // La hoja, si la celda está en formato texto, puede devolver "161" en vez del número 161.
        registrar(escrito === centinela && (leidoCen === centinela || leidoCen === String(centinela)),
          "ida y vuelta en " + esp.addr + " (" + pos.a1 + ")");

        if (esp.addr === 0) {
          var hex = write(0, "A5H");
          registrar(hex === "A5H" && read(0) === "A5H", "A5H se conserva como texto");
          var num = write(0, 20);
          var leidoNum = read(0);
          registrar(typeof num === "number" && num === 20 && (leidoNum === 20 || leidoNum === "20") && leidoNum !== "20H",
            "entero 20 no pasa a 32 ni a 20H");
          var txt = write(0, "20");
          var leidoTxt = read(0);
          registrar(txt === "20" && (leidoTxt === "20" || leidoTxt === 20) && leidoTxt !== 32 && leidoTxt !== "20H",
            "texto \"20\" no se guarda como 32 ni como 20H");
          var bin = write(0, "00010100B");
          registrar(bin === "00010100B" && read(0) === "00010100B", "00010100B se conserva como BIN");
          var inst = write(0, "LD AX, 20H");
          registrar(inst === "LD AX, 20H" && read(0) === "LD AX, 20H",
            "instrucción \"LD AX, 20H\" no se interpreta como número");
        }
      } catch (e) {
        registrar(false, "excepción en " + esp.addr + ": " + e.message);
      } finally {
        try {
          restaurar_(esp.addr, original);
        } catch (errRestore) {
          registrar(false, "no se pudo restaurar " + esp.a1 + ": " + errRestore.message);
        }
      }
      registrar(mismoValor_(read(esp.addr), original), "restaurada " + esp.a1);
    }

    for (i = 0; i < mapa.length; i++) {
      probarCelda_(mapa[i]);
    }

    // Fallo provocado a propósito: finally tiene que restaurar igual.
    var original32 = read(32);
    var forzado = false;
    try {
      write(32, elegirCentinela_(original32));
      forzado = true;
      throw new Error("fallo forzado");
    } catch (e) {
      if (!forzado) {
        registrar(false, "el fallo forzado no llegó a escribir: " + e.message);
      }
    } finally {
      try {
        restaurar_(32, original32);
      } catch (errRestore) {
        registrar(false, "no se pudo restaurar O10 tras el fallo forzado: " + errRestore.message);
      }
    }
    registrar(forzado && mismoValor_(read(32), original32),
      "un fallo a mitad de prueba restaura O10");

    var base0 = read(0);
    var valoresMalos = [
      -1, 256, 300, 1.5, NaN, Infinity,
      "GGH", "100H", "20h", "0xA5", "12.5", "-1", "NaN",
      true, null, undefined
    ];
    for (i = 0; i < valoresMalos.length; i++) {
      var malo = valoresMalos[i];
      var rechazo = false;
      var escrito = false;
      try {
        write(0, malo);
        escrito = true;
      } catch (e) {
        rechazo = String(e && e.message).indexOf("MemoriaFisica:") === 0;
      } finally {
        // Si el rechazo ocurrió antes de escribir, la celda no se toca.
        // Si algo llegó a guardarse, finally la devuelve igual.
        if (escrito || read(0) !== base0) {
          try {
            restaurar_(0, base0);
          } catch (errRestore) {
            registrar(false, "no se pudo restaurar O8 tras un valor inválido: " + errRestore.message);
          }
        }
      }
      registrar(rechazo && mismoValor_(read(0), base0),
        "valor rechazado " + describir_(malo) + " y O8 sigue igual");
    }

    var iguales = true;
    for (i = 0; i < vigiladas.length; i++) {
      if (!mismoValor_(read(vigiladas[i]), antes[vigiladas[i]])) iguales = false;
    }
    registrar(iguales, "celdas vigiladas iguales al inicio (0, 1, 15, 16, 20, 31, 32, 33, 254, 255)");

    Logger.log("RESUMEN probarMemoriaFisica: " + ok + " OK, " + mal + " fallos.");
    if (mal > 0) {
      throw new Error("probarMemoriaFisica: " + mal + " fallos. Se intentó restaurar cada celda probada.");
    }
    Logger.log("Escrituras solo en O8, AD9, O10 y AD23, ya restauradas. LOG y Historial no se usan.");
  }

  // Prueba viva y reversible. No llama a resetCPU, runCPU ni al cargador.
  function probarIntegracion() {
    requerirConfig_();
    if (SHEET_NAME !== "Hoja 1" || RAM_START_ROW !== 8 || RAM_START_COL !== 15) {
      Logger.log("FALLO  Config distinta de Hoja 1, fila 8, columna 15. No se escribió nada.");
      throw new Error("probarIntegracionRAM abortada: la RAM configurada no es O8:AD23.");
    }
    var hoja = hoja_();
    if (hoja.getName() !== SHEET_NAME) {
      throw new Error("MemoriaFisica: se abrió una hoja que no es \"" + SHEET_NAME + "\".");
    }

    var ok = 0;
    var mal = 0;
    function registrar(bien, mensaje) {
      if (bien) {
        ok++;
        Logger.log("OK  " + mensaje);
      } else {
        mal++;
        Logger.log("FALLO  " + mensaje);
      }
    }

    Logger.log("IntegracionRAM: hoja \"" + SHEET_NAME + "\". Sin resetCPU, sin runCPU y sin cargador.");

    var bloque = leerBloque();
    var bloqueOk = bloque && bloque.length === 16 && bloque[0].length === 16 && bloque[15].length === 16 &&
      mismoValor_(bloque[0][0], read(0)) &&
      mismoValor_(bloque[1][15], read(31)) &&
      mismoValor_(bloque[2][0], read(32)) &&
      mismoValor_(bloque[15][15], read(255));
    registrar(bloqueOk, "bloque 16x16 alineado con las direcciones 0, 31, 32 y 255");

    var o0 = read(0);
    var o20 = read(20);
    var o31 = read(31);
    var o32 = read(32);
    var f0 = fondo(0);
    var f31 = fondo(31);
    var f32 = fondo(32);
    var rangoMar = hoja.getRange(REG_MAR);
    var mar = rangoMar.getValue();
    var marFormula = rangoMar.getFormula ? rangoMar.getFormula() : "";
    var marFormato = rangoMar.getNumberFormat ? rangoMar.getNumberFormat() : "";

    try {
      var leido00 = obtenerDatoRAM(hoja, "00H");
      var leido0 = obtenerDatoRAM(hoja, 0);
      registrar(mismoValor_(leido00, o0) && mismoValor_(leido0, o0),
        "obtenerDatoRAM(\"00H\") y obtenerDatoRAM(0) leen la dirección 0");
      registrar(mismoValor_(obtenerDatoRAM(hoja, "20H"), o32),
        "obtenerDatoRAM(\"20H\") lee la dirección 32");
      var nopSinEscritura = obtenerDatoRAM(hoja, "20") === "NOP" &&
        obtenerDatoRAM(hoja, "bad") === "NOP" &&
        obtenerDatoRAM(hoja, "zz") === "NOP" &&
        mismoValor_(read(0), o0) && mismoValor_(read(32), o32);
      registrar(nopSinEscritura, "obtenerDatoRAM(\"20\"), \"bad\" y \"zz\" devuelven NOP sin escribir");

      var fachada = obtenerCeldaRAM("00H");
      fachada.setValue("A5H");
      registrar(fachada.getValue() === "A5H" && read(0) === "A5H", "fachada: A5H vuelve como texto");
      fachada.setValue(20);
      var n20 = read(0);
      registrar((n20 === 20 || n20 === "20") && n20 !== 32 && n20 !== "20H",
        "fachada: el número 20 no se guarda como 32");
      fachada.setValue("LD AX, 20H");
      registrar(read(0) === "LD AX, 20H" && fachada.getValue() === "LD AX, 20H",
        "fachada: \"LD AX, 20H\" no se interpreta como número");

      var rechazoTexto = false;
      var rechazoBad = false;
      try { obtenerCeldaRAM("20"); } catch (e1) {
        rechazoTexto = String(e1 && e1.message).indexOf("MemoriaFisica:") === 0;
      }
      try { obtenerCeldaRAM("bad"); } catch (e2) {
        rechazoBad = String(e2 && e2.message).indexOf("MemoriaFisica:") === 0;
      }
      registrar(rechazoTexto && rechazoBad && read(0) === "LD AX, 20H",
        "obtenerCeldaRAM(\"20\") y obtenerCeldaRAM(\"bad\") se rechazan");

      rangoMar.setValue("20H");
      var fuente32 = leerFuente(hoja, "RAM");
      registrar(fuente32 && fuente32.name === "RAM" && mismoValor_(fuente32.value, o32),
        "leerFuente con MAR 20H lee la dirección 32");

      rangoMar.setValue("00H");
      var fuente0 = leerFuente(hoja, "RAM");
      registrar(fuente0 && fuente0.value === "LD AX, 20H",
        "leerFuente con MAR 00H ve el dato centralizado");

      // El número 20 es la dirección 20. setValue("20") en una celda general
      // lo guarda así; por eso aquí se escribe el número, no el texto.
      rangoMar.setNumberFormat("0");
      rangoMar.setValue(20);
      var marNumero = rangoMar.getValue();
      var fuenteNum = leerFuente(hoja, "RAM");
      registrar(typeof marNumero === "number" && marNumero === 20 &&
        fuenteNum && fuenteNum.name === "RAM" && fuenteNum.value !== "NOP" &&
        mismoValor_(fuenteNum.value, read(20)) &&
        mismoValor_(read(20), o20) && mismoValor_(read(32), o32),
        "leerFuente con MAR numérico 20 lee la dirección 20 y no devuelve NOP");

      // El texto "20" solo sigue siendo texto si la celda está en formato de texto.
      rangoMar.setNumberFormat("@");
      rangoMar.setValue("20");
      var marTexto = rangoMar.getValue();
      var fuenteTxt = leerFuente(hoja, "RAM");
      registrar(typeof marTexto === "string" && marTexto === "20" &&
        fuenteTxt && fuenteTxt.value === "NOP" &&
        mismoValor_(read(20), o20) && mismoValor_(read(32), o32),
        "leerFuente con MAR texto \"20\" devuelve NOP");

      rangoMar.setValue("20H");
      escribirDestinoBus(hoja, "RAM", "B1H");
      registrar(read(32) === "B1H" && esVerdeDatos_(fondo(32)),
        "escribirDestinoBus guarda B1H en la dirección 32 y pinta el fondo");

      rangoMar.setValue("1FH");
      escribirDestinoBus(hoja, "RAM", 20);
      var v31 = read(31);
      registrar((v31 === 20 || v31 === "20") && v31 !== 32 && v31 !== "20H" && esVerdeDatos_(fondo(31)),
        "escribirDestinoBus guarda el número 20 en la dirección 31");

      rangoMar.setValue("bad");
      var rechazoBus = false;
      try { escribirDestinoBus(hoja, "RAM", "A5H"); }
      catch (e3) { rechazoBus = String(e3 && e3.message).indexOf("MemoriaFisica:") === 0; }
      registrar(rechazoBus && read(0) === "LD AX, 20H", "MAR bad no escribe en la dirección 0");
    } catch (e) {
      registrar(false, "excepción: " + e.message);
    } finally {
      try { restaurar_(0, o0); } catch (e0) { registrar(false, "no se restauró O8: " + e0.message); }
      try { restaurar_(31, o31); } catch (e31) { registrar(false, "no se restauró AD9: " + e31.message); }
      try { restaurar_(32, o32); } catch (e32) { registrar(false, "no se restauró O10: " + e32.message); }
      try { pintarFondo(0, f0); } catch (ef0) { registrar(false, "no se restauró el fondo de O8: " + ef0.message); }
      try { pintarFondo(31, f31); } catch (ef31) { registrar(false, "no se restauró el fondo de AD9: " + ef31.message); }
      try { pintarFondo(32, f32); } catch (ef32) { registrar(false, "no se restauró el fondo de O10: " + ef32.message); }
      try {
        if (rangoMar.setNumberFormat && marFormato !== "") rangoMar.setNumberFormat(marFormato);
        if (marFormula) rangoMar.setFormula(marFormula);
        else rangoMar.setValue(mar);
      } catch (em) { registrar(false, "no se restauró MAR: " + em.message); }
    }

    var datosOk = mismoValor_(read(0), o0) && mismoValor_(read(20), o20) && mismoValor_(read(31), o31) && mismoValor_(read(32), o32);
    var fondosOk = mismoFondo_(fondo(0), f0) && mismoFondo_(fondo(31), f31) && mismoFondo_(fondo(32), f32);
    var marAhora = rangoMar.getValue();
    var marOk = marAhora === mar &&
      (!rangoMar.getNumberFormat || marFormato === "" || rangoMar.getNumberFormat() === marFormato) &&
      (!rangoMar.getFormula || (marFormula ? rangoMar.getFormula() === marFormula : rangoMar.getFormula() === ""));
    registrar(datosOk && fondosOk && marOk, "celdas 0, 31 y 32, sus fondos y MAR quedaron restaurados");

    Logger.log("RESUMEN probarIntegracionRAM: " + ok + " OK, " + mal + " fallos.");
    if (mal > 0) {
      throw new Error("probarIntegracionRAM: " + mal + " fallos. Se intentó restaurar celdas, fondos y MAR.");
    }
    Logger.log("Sin resetCPU, sin vaciar la RAM y sin escribir en LOG.");
  }

  return {
    read: read,
    write: write,
    probar: probar,
    probarIntegracion: probarIntegracion,
    hoja: hoja_,
    direccion: validarDireccion_,
    leerBloque: leerBloque,
    escribirBloque: escribirBloque,
    vaciar: vaciar,
    limpiarFondo: limpiarFondo,
    pintarFondo: pintarFondo,
    fondo: fondo
  };
})();

function readPhysical(addr) {
  return memoriaFisica_.read(addr);
}

function writePhysical(addr, value) {
  return memoriaFisica_.write(addr, value);
}

// En el desplegable, por este orden: probarMemoriaFisica y después probarIntegracionRAM.
// No ejecutes resetCPU, runCPU, cargarDesdeHojaProgramas ni probarContencion para estas pruebas.
function probarMemoriaFisica() {
  return memoriaFisica_.probar();
}

// Métodos de bloque y de fondo. No son funciones del desplegable a propósito:
// vaciar y escribirBloque reescribirían la matriz si se lanzaran sueltos.
var RAMFisica = {
  hoja: function () { return memoriaFisica_.hoja(); },
  direccion: function (addr) { return memoriaFisica_.direccion(addr); },
  leerBloque: function () { return memoriaFisica_.leerBloque(); },
  escribirBloque: function (matriz) { return memoriaFisica_.escribirBloque(matriz); },
  vaciar: function () { return memoriaFisica_.vaciar(); },
  limpiarFondo: function () { return memoriaFisica_.limpiarFondo(); },
  pintarFondo: function (addr, color) { return memoriaFisica_.pintarFondo(addr, color); },
  fondo: function (addr) { return memoriaFisica_.fondo(addr); }
};

function probarIntegracionRAM() {
  return memoriaFisica_.probarIntegracion();
}
