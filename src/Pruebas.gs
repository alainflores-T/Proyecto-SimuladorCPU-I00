// Pruebas.gs — casos deterministas en memoria. No tocan Google.
// Los resultados esperados están escritos a mano, no copiados del ciclo anterior.

function simAfirmar(fallos, ok, mensaje) {
  if (!ok) fallos.push(mensaje);
}

function simPrograma(id) {
  var e = simEstadoInicial();
  var r = simCargarCatalogo(e, id);
  return { e: e, r: r };
}

function simHastaFin(e) {
  return simCorrer(e, { maxPasos: 800, maxMs: 999999, ahora: function () { return 0; } });
}

function simInformePruebas_(total, fallos) {
  var lineas = ["PRUEBAS casos=" + total + " fallos=" + fallos.length];
  var i;
  for (i = 0; i < fallos.length; i++) lineas.push("FALLO " + (i + 1) + ": " + fallos[i]);
  if (!fallos.length) lineas.push("OK");
  for (i = 0; i < lineas.length; i++) {
    if (typeof console !== "undefined" && console.log) console.log(lineas[i]);
    if (typeof Logger !== "undefined" && Logger.log) Logger.log(lineas[i]);
  }
  return lineas;
}

function simProbarTodo() {
  var fallos = [];
  var total = 0;
  function caso(nombre, fn) {
    total++;
    var antes = fallos.length;
    try { fn(); }
    catch (err) { fallos.push(nombre + " excepción " + (err && err.message ? err.message : err)); }
    var i;
    for (i = antes; i < fallos.length; i++) {
      if (String(fallos[i]).indexOf(nombre) !== 0) fallos[i] = nombre + ": " + fallos[i];
    }
  }

  caso("1 errores de ensamblador", function () {
    var malo = simEnsamblar("MOV AX\nFOO BX\nST [1E0H], AX\nJNZ noExiste\n");
    simAfirmar(fallos, malo.ok === false, "ensamblado inválido debe rechazarse");
    simAfirmar(fallos, malo.errores.length >= 3, "al menos tres errores, hay " + malo.errores.length);
    var e = simEstadoInicial();
    var carga = simCargarTexto(e, "ST [1F0H], BX\nHLT\n", "malo");
    simAfirmar(fallos, carga.ok === false, "no carga VPN 15");
    simAfirmar(fallos, e.programa === "", "el estado no queda marcado como programa");
    simAfirmar(fallos, e.swap[0] === 0, "un error no escribe el swap");
  });

  caso("2 fallo al cruzar página de 32", function () {
    var e = simEstadoInicial();
    var r = simCargarTexto(e, "ORG 1FH\nMOV AX, 01H\nHLT\n", "cruce");
    simAfirmar(fallos, r.ok === true, "el cruce ensambla " + (r.errores || []).join("; "));
    simHastaFin(e);
    simAfirmar(fallos, e.fase === "HALT", "termina en HALT y está en " + e.fase + " " + e.error);
    simAfirmar(fallos, e.ax === 1, "AX queda 01H y es " + e.ax);
    simAfirmar(fallos, e.registroFallos.join(",") === "0,1", "fallos VPN 0 y 1, vino " + e.registroFallos.join(","));
    simAfirmar(fallos, e.pc === 0x23, "PC después de HLT es 023H y es " + e.pc);
  });

  caso("3 miss y hit de L1I", function () {
    var e = simEstadoInicial();
    e.paginas[0] = { p: 1, pfn: 0, dirty: 0, ref: 0, orden: 1, uso: 1, fija: 0 };
    var a = simCacheLeer(e, 0, "I");
    var b = simCacheLeer(e, 1, "I");
    simAfirmar(fallos, a === 0 && b === 0, "lee ceros");
    simAfirmar(fallos, e.cont.l1iM === 1 && e.cont.l1iH === 1, "un miss y un hit de L1I");
    simAfirmar(fallos, e.cont.l2M === 1 && e.cont.l2H === 0, "el primer fallo consulta L2 y falla");
  });

  caso("4 hit de L1D en escritura", function () {
    var e = simEstadoInicial();
    e.paginas[0].p = 1;
    e.paginas[0].pfn = 0;
    e.paginas[0].orden = 1;
    simCacheLeer(e, 0, "D");
    simCacheEscribir(e, 1, 0x3C);
    simAfirmar(fallos, e.cont.l1dWH === 1 && e.cont.l1dWM === 0, "la segunda escritura de la línea es hit");
    simAfirmar(fallos, e.ram[1] === 0x3C && e.l1d.b[1] === 0x3C, "write-through deja RAM y L1D iguales");
    simAfirmar(fallos, e.cont.mant === 1, "el write-through de L2 va al mantenimiento");
    simAfirmar(fallos, e.cont.l2H === 0, "ese mantenimiento no es un hit de L2");
  });

  caso("5 hit de L2 tras desalojar L1", function () {
    var e = simEstadoInicial();
    simCacheLeer(e, 0, "I");
    simCacheLeer(e, 8, "I");
    simCacheLeer(e, 0, "I");
    simAfirmar(fallos, e.cont.l1iM === 3 && e.cont.l1iH === 0, "tres fallos de L1I de una sola línea");
    simAfirmar(fallos, e.cont.l2M === 2 && e.cont.l2H === 1, "el regreso a la primera línea es hit de L2");
  });

  caso("6 contención de tri-estado", function () {
    var e = simEstadoInicial();
    e.mdr = 0x55;
    var r = simContencion(e);
    simAfirmar(fallos, r.ok === false, "dos emisores no son válidos");
    simAfirmar(fallos, r.mdr === 0x55, "MDR no cambia: quedó " + r.mdr);
    simAfirmar(fallos, r.error.indexOf("Contención") === 0, "el mensaje nombra la contención");
  });

  caso("7 teclado vacío", function () {
    var e = simEstadoInicial();
    simCargarTexto(e, "IN AX, [KBD]\nHLT\n", "vacio");
    var cabeza = e.kbdHead;
    simHastaFin(e);
    simAfirmar(fallos, e.ax === 0, "IN vacío deja AX en 00H");
    simAfirmar(fallos, e.kbdHead === cabeza && e.kbdCount === 0, "la cabeza no se mueve");
    simAfirmar(fallos, e.cont.l1dRH + e.cont.l1dRM + e.cont.l1dWH + e.cont.l1dWM === 0, "IN no cuenta L1D");
  });

  caso("8 desborde de cola", function () {
    var e = simEstadoInicial();
    var i;
    for (i = 0; i < 8; i++) {
      var ok = simTeclear(e, "A");
      simAfirmar(fallos, ok.ok === true, "la tecla " + i + " entra");
    }
    var novena = simTeclear(e, "B");
    simAfirmar(fallos, novena.ok === false, "la novena se rechaza");
    simAfirmar(fallos, e.kbdCount === 8, "la cola sigue en 8");
    simAfirmar(fallos, e.ram[0xF0] === 0x41 && e.ram[0xF7] === 0x41, "F0-F7 conservan A");
    var texto = simEstadoInicial();
    var hola = simTeclear(texto, "HOLA");
    simAfirmar(fallos, hola.ok === true && hola.n === 4, "HOLA entra completa");
    simAfirmar(fallos, texto.kbdCount === 4 && texto.ram[0xF0] === 0x48 && texto.ram[0xF3] === 0x41, "HOLA queda en F0-F3");
    var sobra = simTeclear(texto, "12345");
    simAfirmar(fallos, sobra.ok === false && texto.kbdCount === 4, "un texto que no cabe se rechaza entero");
    var lcd = simEstadoInicial();
    simCargarTexto(lcd, "MOV AX, 41H\nOUT [LCD], AX\nOUT [LCD], AX\nOUT [LCD], AX\nOUT [LCD], AX\nOUT [LCD], AX\nOUT [LCD], AX\nOUT [LCD], AX\nOUT [LCD], AX\nOUT [LCD], AX\nHLT\n", "lcd");
    simHastaFin(lcd);
    simAfirmar(fallos, lcd.lcdCursor === 8, "el cursor queda en 8");
    simAfirmar(fallos, lcd.ram[0xFF] === 0x41 && lcd.fase === "HALT", "el noveno OUT no pasa de FFH");
  });

  caso("9 banderas FF+1", function () {
    var e = simEstadoInicial();
    simCargarTexto(e, "MOV AX, FFH\nADD AX, 01H\nAND AX, FFH\nMOV BX, 01H\nHLT\n", "flags");
    simHastaFin(e);
    simAfirmar(fallos, e.ax === 0 && e.bx === 1, "AX 00H y BX 01H, vino " + e.ax + " " + e.bx);
    simAfirmar(fallos, e.zf === 1 && e.cf === 1 && e.sf === 0, "ZF 1 CF 1 SF 0 tras AND, vino " + e.zf + e.cf + e.sf);
    var d = simEstadoInicial();
    simCargarTexto(d, "MOV AX, 00H\nDEC AX\nHLT\n", "dec");
    simHastaFin(d);
    simAfirmar(fallos, d.ax === 0xFF && d.cf === 1 && d.sf === 1 && d.zf === 0, "DEC de 00H es FFH con CF y SF");
  });

  caso("10 reset determinista", function () {
    var e = simEstadoInicial();
    simCargarCatalogo(e, "P1");
    var swap = e.swap.slice();
    simCorrer(e, { maxPasos: 12, ahora: function () { return 0; } });
    simAfirmar(fallos, e.pasos === 12, "avanzó 12 micro-pasos");
    simReset(e);
    var limpio = simEstadoInicial();
    simAfirmar(fallos, e.pc === 0 && e.ax === 0 && e.fase === "F1", "registros y fase iniciales");
    simAfirmar(fallos, e.fallos === 0 && e.trace.length === 0, "fallos y traza limpios");
    simAfirmar(fallos, e.l1i.v === 0 && e.l2[0].v === 0 && e.cont.l1iM === 0, "la caché queda inválida");
    simAfirmar(fallos, e.palabra === "0000000H" && e.buses.dirInt.emisor === "", "palabra y buses en reposo");
    simAfirmar(fallos, e.swap.join(",") === swap.join(","), "el swap del programa se conserva");
    simAfirmar(fallos, e.paginas[15].p === 1 && e.paginas[15].pfn === 7 && e.paginas[0].p === 0, "VPN 15 fija y el resto ausente");
    simAfirmar(fallos, e.ram.join(",") === limpio.ram.join(","), "la RAM vuelve a cero");
  });

  caso("11 micro-palabra hex", function () {
    var e = simEstadoInicial();
    e.paginas[0] = { p: 1, pfn: 0, dirty: 0, ref: 0, orden: 1, uso: 1, fija: 0 };
    e.ram[0] = 0x00;
    e.ram[1] = 0x00;
    simMicroPaso(e);
    simAfirmar(fallos, e.palabra === "C000000H", "F1 es C000000H y dio " + e.palabra);
    simAfirmar(fallos, e.bits.indexOf("11") === 0, "En_PC y Ld_MAR son los dos bits altos");
    simMicroPaso(e);
    simAfirmar(fallos, e.palabra === "28000C0H", "F2 es 28000C0H y dio " + e.palabra);
    simAfirmar(fallos, e.senales.Mem_R === 1 && e.senales.INC_PC === 1 && e.senales.En_MAR === 1 && e.senales.Ld_MDR === 1, "F2 enciende Mem_R, INC_PC, En_MAR y Ld_MDR");
    simAfirmar(fallos, e.buses.ck === 1 && e.buses.rd === 1, "el reloj y Read acompañan la lectura");
  });

  caso("12 demo P1", function () {
    var pack = simPrograma("P1");
    simAfirmar(fallos, pack.r.ok === true, "P1 ensambla");
    simAfirmar(fallos, pack.e.swap[0] === 0x10 && pack.e.swap[1] === 0x00, "MOV AX, 00H es 10H 00H");
    simHastaFin(pack.e);
    var e = pack.e;
    simAfirmar(fallos, e.fase === "HALT", "P1 llega a HLT " + e.fase + " " + e.error);
    simAfirmar(fallos, e.ax === 0x0C && e.bx === 0x04 && e.cx === 0x00 && e.dx === 0x04, "AX 0CH BX 04H CX 00H DX 04H, vino " + e.ax + "," + e.bx + "," + e.cx + "," + e.dx);
    simAfirmar(fallos, e.zf === 1 && e.cf === 0 && e.sf === 0, "ZF 1 y CF 0 al salir del bucle");
    simAfirmar(fallos, e.registroFallos.join(",") === "0", "un solo fallo, el de la página de código");
    simAfirmar(fallos, e.cont.l1iM === 2 && e.cont.l1iH === 26, "L1I 2 miss y 26 hit, vino " + e.cont.l1iM + "/" + e.cont.l1iH);
    simAfirmar(fallos, e.cont.l2M === 2 && e.cont.l2H === 0, "L2 dos miss de demanda");
    simAfirmar(fallos, e.cont.l1dRH + e.cont.l1dRM + e.cont.l1dWH + e.cont.l1dWM === 0, "P1 no toca L1D");
  });

  caso("13 demo P2", function () {
    var pack = simPrograma("P2");
    simAfirmar(fallos, pack.r.ok === true, "P2 ensambla");
    var e = pack.e;
    simTeclear(e, "H");
    simTeclear(e, "O");
    simTeclear(e, "L");
    simTeclear(e, "A");
    simHastaFin(e);
    simAfirmar(fallos, e.fase === "HALT", "P2 llega a HLT " + e.error);
    simAfirmar(fallos, e.cx === 0 && e.zf === 1 && e.ax === 0, "ocho vueltas y el último IN vacío");
    simAfirmar(fallos, e.ram[0xF8] === 0x48 && e.ram[0xF9] === 0x4F && e.ram[0xFA] === 0x4C && e.ram[0xFB] === 0x41, "LCD muestra HOLA");
    simAfirmar(fallos, e.ram[0xFC] === 0 && e.ram[0xFF] === 0, "el resto del LCD queda en cero");
    simAfirmar(fallos, e.kbdCount === 0, "la cola se vació");
    simAfirmar(fallos, e.paginas[15].p === 1 && e.paginas[15].pfn === 7, "la VM sigue encendida y la VPN 15 fija");
    simAfirmar(fallos, e.cont.l1dRH + e.cont.l1dWH === 0 && e.cont.mant === 0, "IN/OUT no alimentan la tasa de L1D");
  });

  caso("14 demo P3", function () {
    var pack = simPrograma("P3");
    simAfirmar(fallos, pack.r.ok === true, "P3 ensambla " + (pack.r.errores || []).join("; "));
    var e = pack.e;
    simHastaFin(e);
    simAfirmar(fallos, e.fase === "HALT", "P3 llega a HLT " + e.fase + " " + e.error);
    simAfirmar(fallos, e.ax === 0x0A && e.bx === 0x02 && e.cx === 0x03 && e.dx === 0x04, "AX 0AH BX 02H CX 03H DX 04H, vino " + [e.ax, e.bx, e.cx, e.dx].join(","));
    simAfirmar(fallos, e.registroFallos.join(",") === "0,2,5,9,14,3,7,11,0,12,4", "secuencia FIFO " + e.registroFallos.join(","));
    simAfirmar(fallos, e.writebacks === 1, "un write-back de la víctima sucia, hubo " + e.writebacks);
    simAfirmar(fallos, e.swap[9 * 32] === 0x03, "el swap de la VPN 9 conserva el 03H escrito");
    simAfirmar(fallos, e.registroFallos.indexOf(15) < 0, "P3 no falla en la VPN 15");
    simAfirmar(fallos, e.paginas[15].pfn === 7 && e.paginas[15].p === 1, "el marco 7 sigue reservado");
  });

  caso("15 topes, stop, LRU, ida y vuelta y coherencia", function () {
    var e = simEstadoInicial();
    simCargarCatalogo(e, "P1");
    var ticks = 0;
    simCorrer(e, {
      maxPasos: 100,
      maxMs: 2500,
      ahora: function () { ticks += 1000; return ticks; }
    });
    simAfirmar(fallos, e.evento === "TOPE_TIEMPO" && e.corridos < 100, "el tope de tiempo corta la corrida");
    var s = simEstadoInicial();
    simCargarTexto(s, "MOV AX, 01H\nHLT\n", "stop");
    var pcTras = 0;
    simCorrer(s, {
      maxPasos: 30,
      ahora: function () { return 0; },
      cada: function (est, n) { if (n === 3) { pcTras = est.pc; est.stop = 1; } }
    });
    var fasePausa = s.fase;
    var trazaPausa = s.trace.length;
    simAfirmar(fallos, s.stop === 1 && s.fase !== "STOP" && s.pc === pcTras, "Stop conserva la microfase y el PC");
    simCorrer(s, { maxPasos: 10, ahora: function () { return 0; } });
    simAfirmar(fallos, s.fase === fasePausa && s.pc === pcTras && s.trace.length === trazaPausa, "otra corrida con la pausa puesta no avanza");
    var lru = simEstadoInicial();
    lru.politica = "LRU";
    simCargarTexto(lru, "LD AX, [20H]\nLD AX, [40H]\nLD AX, [60H]\nLD AX, [80H]\nLD AX, [A0H]\nLD AX, [C0H]\nLD AX, [20H]\nLD AX, [100H]\nHLT\n", "lru");
    simHastaFin(lru);
    simAfirmar(fallos, lru.registroFallos[lru.registroFallos.length - 1] === 8, "el último fallo es la página nueva");
    simAfirmar(fallos, lru.registroFallos.indexOf(1) >= 0, "LRU vuelve a traer o conserva la página tocada de nuevo");
    var base = simEstadoInicial();
    base.ax = 7;
    base.ram[4] = 9;
    var ida = simExportar(base);
    var vuelta = simEstadoInicial();
    simImportar(vuelta, ida);
    simAfirmar(fallos, vuelta.ax === 7 && vuelta.ram[4] === 9, "el bloque de estado se importa igual");
    var coh = simEstadoInicial();
    coh.paginas[0].p = 1;
    coh.paginas[0].pfn = 0;
    coh.paginas[0].orden = 1;
    simCacheLeer(coh, 0, "I");
    simAfirmar(fallos, coh.l1i.v === 1, "L1I tiene la línea");
    simCacheEscribir(coh, 0, 0x99);
    simAfirmar(fallos, coh.l1i.v === 0, "escribir datos invalida L1I de la misma línea");
    simCacheLeer(coh, 0, "I");
    simAfirmar(fallos, coh.cont.l1iM === 2, "el fetch siguiente vuelve a fallar en L1I");
    var wb = simEstadoInicial();
    simCargarTexto(wb, "MOV AX, 11H\nST [20H], AX\nLD BX, [40H]\nLD BX, [60H]\nLD BX, [80H]\nLD BX, [A0H]\nLD BX, [C0H]\nLD BX, [100H]\nLD BX, [120H]\nHLT\n", "wb");
    simHastaFin(wb);
    simAfirmar(fallos, wb.writebacks === 1 && wb.swap[32] === 0x11, "la víctima sucia de 020H vuelve al swap");
    var vista = simVistaFilas(simEstadoInicial());
    simAfirmar(fallos, vista[4][1] === "00H", "AX en cero se muestra 00H");
    simAfirmar(fallos, simCeldaVista("axHex") !== "A1", "la vista de AX tiene celda propia");
    simAfirmar(fallos, simExigirIds(SIM_HOJA_COPIA, SIM_SCRIPT_COPIA) === true, "la copia conocida pasa la guarda");
    var rechazo = false;
    try { simExigirIds(SIM_HOJA_ORIGINAL, SIM_SCRIPT_COPIA); } catch (errH) { rechazo = true; }
    simAfirmar(fallos, rechazo, "la hoja original se rechaza");
    rechazo = false;
    try { simExigirIds(SIM_HOJA_COPIA, SIM_SCRIPT_ORIGINAL); } catch (errS) { rechazo = true; }
    simAfirmar(fallos, rechazo, "el script original se rechaza");
  });

  caso("17 pausa entre grupos y reanuda", function () {
    var e = simEstadoInicial();
    simCargarTexto(e, "MOV AX, 01H\nMOV BX, 02H\nHLT\n", "grupos");
    var marca = null;
    var grupos = 0;
    while (grupos < 30 && e.fase !== "HALT" && e.fase !== "ERROR") {
      if (e.stop && e.fase !== "STOP") break;
      var i = 0;
      while (i < 4 && e.fase !== "HALT" && e.fase !== "ERROR" && e.fase !== "STOP") {
        simMicroPaso(e);
        i++;
      }
      grupos++;
      if (grupos === 1) marca = { fase: e.fase, pc: e.pc, ax: e.ax, n: e.trace.length, sub: e.sub };
      if (grupos === 1) e.stop = 1;
    }
    simAfirmar(fallos, !!marca && e.stop === 1 && e.fase === marca.fase && e.pc === marca.pc && e.ax === marca.ax && e.trace.length === marca.n, "el grupo siguiente no ejecuta ni borra la fase");
    e.stop = 0;
    simMicroPaso(e);
    simAfirmar(fallos, e.fase !== "STOP" && e.trace.length === marca.n + 1, "Step reanuda un micro-paso real");
    simHastaFin(e);
    simAfirmar(fallos, e.fase === "HALT" && e.ax === 1 && e.bx === 2, "Run reanuda hasta HLT");

    var vieja = simEstadoInicial();
    simCargarTexto(vieja, "MOV AX, 01H\nHLT\n", "vieja");
    simMicroPaso(vieja);
    vieja.fase = "STOP";
    vieja.evento = "STOP";
    vieja.stop = 1;
    simAnotar(vieja, "STOP");
    var ax = vieja.ax;
    var rec = simRecuperarFasePausa_(vieja);
    simAfirmar(fallos, rec.ok === true && vieja.fase === "F2" && vieja.ax === ax, "una pausa F1 se recupera como F2 sin tocar AX");
    vieja.stop = 0;
    simHastaFin(vieja);
    simAfirmar(fallos, vieja.fase === "HALT" && vieja.ax === 1, "la pausa recuperada llega a HLT");

    var ex = simEstadoInicial();
    simCargarTexto(ex, "MOV AX, 01H\nHLT\n", "ex");
    var p = 0;
    while (p < 40 && (!ex.trace.length || ex.trace[ex.trace.length - 1][1] !== "EX")) {
      simMicroPaso(ex);
      p++;
    }
    simAfirmar(fallos, ex.trace.length && ex.trace[ex.trace.length - 1][1] === "EX", "hay un EX completado en la traza");
    var axEx = ex.ax;
    var pcEx = ex.pc;
    ex.fase = "STOP";
    ex.evento = "STOP";
    simAnotar(ex, "STOP");
    simMicroPaso(ex);
    simAfirmar(fallos, ex.fase === "STOP" && ex.ax === axEx && ex.pc === pcEx, "EX no se reemplaza por una fase inventada");
    simAfirmar(fallos, String(ex.evento).indexOf("sin microfase recuperable") >= 0, "el aviso dice que el CPU no se modificó");
  });

  caso("16 P1 reanuda tras guardar cada micro-paso", function () {
    var e = simEstadoInicial();
    simAfirmar(fallos, simCargarCatalogo(e, "P1").ok === true, "P1 carga");
    var n = 0;
    var vioFallo = false;
    var proboHojaVieja = false;
    while (e.fase !== "HALT" && e.fase !== "ERROR" && n < 800) {
      var bloque = simExportar(e);
      if (e.fase === "PF3" && !proboHojaVieja) {
        var i;
        for (i = 0; i < bloque.escalares.length; i++) {
          if (bloque.escalares[i][0] === "continuacion") bloque.escalares[i][1] = "";
        }
        proboHojaVieja = true;
      }
      var siguiente = simEstadoInicial();
      simImportar(siguiente, bloque);
      if (siguiente.fase === "PF2" || siguiente.fase === "PF3" || siguiente.fase === "PF4") vioFallo = true;
      simMicroPaso(siguiente);
      e = siguiente;
      n++;
    }
    simAfirmar(fallos, vioFallo, "el fallo de página queda entre dos guardados");
    simAfirmar(fallos, proboHojaVieja, "se vació la continuación como en la hoja ya preparada");
    simAfirmar(fallos, e.fase === "HALT", "P1 llega a HLT tras recargar (" + e.fase + " " + e.error + ")");
    simAfirmar(fallos, e.ax === 0x0C && e.bx === 0x04 && e.cx === 0 && e.dx === 0x04 && e.zf === 1, "los registros de P1 sobreviven al guardado");
  });

  if (total !== 17) fallos.push("se esperaban 17 casos y se ejecutaron " + total);
  var lineas = simInformePruebas_(total, fallos);
  if (fallos.length) throw new Error(lineas.join("\n"));
  return { ok: true, total: total, fallos: fallos };
}
