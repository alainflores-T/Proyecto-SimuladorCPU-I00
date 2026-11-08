function simCrearLibroPrueba(opciones) {
  opciones = opciones || {};
  var hojas = [];
  var activa = null;

  function clave(fila, col) { return fila + "," + col; }

  function hojaNueva(nombre) {
    var valores = {};
    var merges = [];
    var formatos = [];
    var numeros = {};
    var validaciones = {};
    var protecciones = [];
    var checks = {};
    var hoja = {
      nombre: nombre,
      oculta: false,
      getName: function () { return hoja.nombre; },
      setName: function (nuevo) {
        var i;
        for (i = 0; i < hojas.length; i++) {
          if (hojas[i] !== hoja && hojas[i].getName().toLowerCase() === String(nuevo).toLowerCase()) {
            throw new Error("Ya existe una hoja con el nombre " + nuevo);
          }
        }
        hoja.nombre = nuevo;
      },
      getParent: function () { return libro; },
      getMaxRows: function () { return 1000; },
      getMaxColumns: function () { return 40; },
      hideSheet: function () { hoja.oculta = true; },
      clear: function () { valores = {}; },
      setFrozenRows: function () {},
      anchos: {},
      setColumnWidth: function (col, px) { hoja.anchos[col] = px; },
      setHiddenGridlines: function (ocultar) { hoja.rejillaOculta = !!ocultar; },
      alturas: {},
      envolturas: {},
      setRowHeight: function (fila, alto) { hoja.alturas[fila] = alto; },
      casillas: checks,
      validaciones: validaciones,
      numeros: numeros,
      setConditionalFormatRules: function (lista) { formatos = lista || []; },
      getConditionalFormatRules: function () { return formatos.slice(); },
      getProtections: function () { return protecciones.slice(); },
      protect: function () {
        var p = {
          setDescription: function () { return p; },
          setWarningOnly: function () { return p; },
          setUnprotectedRanges: function () { return p; },
          getEditors: function () { return []; },
          removeEditors: function () { return p; },
          remove: function () {
            var i = protecciones.indexOf(p);
            if (i >= 0) protecciones.splice(i, 1);
          }
        };
        protecciones.push(p);
        return p;
      },
      getRange: function (fila, col, nFilas, nCols) {
        var nf = nFilas || 1;
        var nc = nCols || 1;
        var rango = {
          fila: fila,
          col: col,
          nFilas: nf,
          nCols: nc,
          getValue: function () {
            var v = valores[clave(fila, col)];
            return v === undefined ? "" : v;
          },
          setValue: function (v) { valores[clave(fila, col)] = v; return rango; },
          getValues: function () {
            var out = [];
            var r;
            var c;
            for (r = 0; r < nf; r++) {
              var filaVals = [];
              for (c = 0; c < nc; c++) {
                var v = valores[clave(fila + r, col + c)];
                filaVals.push(v === undefined ? "" : v);
              }
              out.push(filaVals);
            }
            return out;
          },
          setValues: function (datos) {
            if (!datos || datos.length !== nf) {
              throw new Error("El número de filas de los datos no coincide con el número de filas del rango. Los datos tienen " + (datos ? datos.length : 0) + ", y el rango, " + nf + ".");
            }
            var ancho = datos[0] ? datos[0].length : 0;
            if (ancho !== nc) {
              throw new Error("El número de columnas de los datos no coincide con el número de columnas del rango. Los datos tienen " + ancho + ", y el rango, " + nc + ".");
            }
            var r;
            var c;
            for (r = 0; r < nf; r++) {
              if (!datos[r] || datos[r].length !== nc) {
                throw new Error("El número de columnas de los datos no coincide con el número de columnas del rango. Los datos tienen " + (datos[r] ? datos[r].length : 0) + ", y el rango, " + nc + ".");
              }
              for (c = 0; c < nc; c++) {
                var fr = fila + r;
                var fc = col + c;
                var m;
                for (m = 0; m < merges.length; m++) {
                  var g = merges[m];
                  var dentro = fr >= g.fila && fr < g.fila + g.nFilas && fc >= g.col && fc < g.col + g.nCols;
                  var cubre = fila <= g.fila && col <= g.col && fila + nf >= g.fila + g.nFilas && col + nc >= g.col + g.nCols;
                  if (dentro && !cubre) {
                    throw new Error("No se puede escribir sobre celdas combinadas.");
                  }
                }
                var valor = datos[r][c];
                if (typeof valor === "string" && /^[0-9]{1,2} [0-9]{1,2}$/.test(valor) && numeros[clave(fr, fc)] !== "@") {
                  valor = new Date(Date.UTC(2026, 7, 14));
                }
                valores[clave(fr, fc)] = valor;
              }
            }
          },
          setBackground: function () { return rango; },
          setFontColor: function () { return rango; },
          setFontWeight: function () { return rango; },
          setFontSize: function () { return rango; },
          setHorizontalAlignment: function () { return rango; },
          setVerticalAlignment: function () { return rango; },
          setFontFamily: function () { return rango; },
          setBorder: function () { return rango; },
          setNumberFormat: function (fmt) {
            var r;
            var c;
            for (r = 0; r < nf; r++) {
              for (c = 0; c < nc; c++) numeros[clave(fila + r, col + c)] = fmt;
            }
            return rango;
          },
          setWrap: function () {
            var r;
            var c;
            for (r = 0; r < nf; r++) {
              for (c = 0; c < nc; c++) hoja.envolturas[clave(fila + r, col + c)] = true;
            }
            return rango;
          },
          setDataValidation: function (regla) { validaciones[clave(fila, col)] = regla; return rango; },
          clearDataValidations: function () {
            var r;
            var c;
            for (r = 0; r < nf; r++) {
              for (c = 0; c < nc; c++) delete validaciones[clave(fila + r, col + c)];
            }
            return rango;
          },
          insertCheckboxes: function () { checks[clave(fila, col)] = true; },
          removeCheckboxes: function () {
            var r;
            var c;
            for (r = 0; r < nf; r++) {
              for (c = 0; c < nc; c++) delete checks[clave(fila + r, col + c)];
            }
            return rango;
          },
          clearContent: function () {
            var r;
            var c;
            for (r = 0; r < nf; r++) {
              for (c = 0; c < nc; c++) delete valores[clave(fila + r, col + c)];
            }
          },
          getMergedRanges: function () {
            var lista = [];
            var m;
            for (m = 0; m < merges.length; m++) {
              var g = merges[m];
              var toca = !(g.fila + g.nFilas <= fila || fila + nf <= g.fila || g.col + g.nCols <= col || col + nc <= g.col);
              if (toca) {
                lista.push((function (grupo) {
                  return {
                    breakApart: function () {
                      var k = merges.indexOf(grupo);
                      if (k >= 0) merges.splice(k, 1);
                    }
                  };
                })(g));
              }
            }
            return lista;
          },
          breakApart: function () {}
        };
        rango.merge = function () {
          merges.push({ fila: fila, col: col, nFilas: nf, nCols: nc });
        };
        return rango;
      }
    };
    hojas.push(hoja);
    if (!activa) activa = hoja;
    return hoja;
  }

  var libro = {
    getId: function () { return opciones.hojaId || SIM_HOJA_COPIA; },
    getSheets: function () { return hojas.slice(); },
    getSheetByName: function (nombre) {
      var i;
      for (i = 0; i < hojas.length; i++) if (hojas[i].getName() === nombre) return hojas[i];
      return null;
    },
    insertSheet: function (nombre) {
      var i;
      for (i = 0; i < hojas.length; i++) {
        if (hojas[i].getName().toLowerCase() === String(nombre).toLowerCase()) {
          throw new Error("Ya existe una hoja con el nombre " + nombre + ".");
        }
      }
      return hojaNueva(nombre);
    },
    setActiveSheet: function (hoja) { activa = hoja; },
    getActiveSheet: function () { return activa; },
    moveActiveSheet: function () {}
  };

  (opciones.iniciales || ["Programas", "Hoja 1", "Microcodigo", "TablaPaginas", "Swap", "Caches", "LOG", "Hoja 5"]).forEach(function (nombre) {
    hojaNueva(nombre);
  });
  var programas = libro.getSheetByName("Programas");
  if (programas) programas.getRange(1, 1, 1, 2).merge();

  return libro;
}

function simReglaFormato_() {
  var o = {
    whenTextEqualTo: function () { return o; },
    whenTextDoesNotContain: function () { return o; },
    whenTextContains: function () { return o; },
    whenNumberEqualTo: function () { return o; },
    setBackground: function () { return o; },
    setFontColor: function () { return o; },
    setRanges: function () { return o; },
    build: function () { return { tipo: "formato" }; }
  };
  return o;
}

function simInstalarServiciosPrueba(libro) {
  SpreadsheetApp = {
    getActiveSpreadsheet: function () { return libro; },
    ProtectionType: { SHEET: "SHEET" },
    newConditionalFormatRule: function () { return simReglaFormato_(); },
    newDataValidation: function () {
      var o = {
        requireValueInList: function () { return o; },
        requireNumberBetween: function () { return o; },
        setAllowInvalid: function () { return o; },
        build: function () { return { tipo: "lista" }; }
      };
      return o;
    }
  };
  ScriptApp = { getScriptId: function () { return SIM_SCRIPT_COPIA; } };
  LockService = {
    getDocumentLock: function () {
      return { tryLock: function () { return true; }, releaseLock: function () {} };
    }
  };
}

function simProbarSetupHoja() {
  var fallos = [];
  function afirmar(ok, mensaje) { if (!ok) fallos.push(mensaje); }

  var libroMalo = { getRange: function () {
    return { setValues: function () {} };
  }};
  var disparo = false;
  try {
    libroMalo.getRange(1, 1, 17, 2).setValues([["solo una columna"]]);
  } catch (err) { disparo = false; }
  var hojaRigida = simCrearLibroPrueba().getSheetByName("Hoja 1");
  var rechazo = false;
  try { hojaRigida.getRange(1, 1, 1, 2).setValues([["una"]]); }
  catch (err2) { rechazo = String(err2.message).indexOf("columnas") >= 0; }
  afirmar(rechazo, "el mock rechaza una fila de 1 columna en un rango de 2");

  var libro = simCrearLibroPrueba();
  libro.insertSheet("CPU");
  libro.insertSheet("BUSES");
  libro.insertSheet("CACHE");
  libro.insertSheet("MEMORIA");
  libro.insertSheet("ES");
  simInstalarServiciosPrueba(libro);
  var primero = simPrepararEstaCopia();
  afirmar(String(primero).indexOf("inicial") >= 0, "la primera preparación crea el estado");
  afirmar(libro.getSheetByName("PROGRAMAS") !== null, "PROGRAMAS queda con el nombre canónico");
  afirmar(libro.getSheetByName("Programas") === null, "no queda una hoja Programas distinta");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(1, 1).getMergedRanges().length === 0, "el merge heredado se separó");
  var panel = libro.getSheetByName("PANEL");
  var mapa = simMapaPanel_();
  afirmar(String(panel.getRange(1, 1).getValue()).indexOf("UNIDAD CENTRAL") === 0, "el título del panel se escribió");
  afirmar(String(panel.getRange(mapa.regFila, 2).getValue()) === "Registro", "los registros quedan a la izquierda");
  afirmar(String(panel.getRange(mapa.busFila, 2).getValue()) === "Buses", "los buses están en la hoja principal");
  afirmar(String(panel.getRange(mapa.ramEncabezadoFila, mapa.ramEncabezadoCol).getValue()) === "Memoria RAM", "la RAM queda a la derecha de los registros");
  afirmar(mapa.ramEncabezadoCol > 5, "la RAM no se pinta encima de los registros");
  afirmar(String(panel.getRange(mapa.ramFila, mapa.ramCol).getValue()) === "=_ESTADO!A" + SIM_FILA_RAM, "la celda 00h apunta al primer byte");
  afirmar(String(panel.getRange(mapa.ramFila + 15, mapa.ramCol + 15).getValue()) === "=_ESTADO!P" + (SIM_FILA_RAM + 15), "la celda FFh apunta al último byte");
  afirmar(String(panel.getRange(mapa.ramFila, mapa.ramCol).getValue()).indexOf("\"") < 0, "la RAM visible no concatena con comillas");
  afirmar(panel.anchos[6] <= 16 && panel.anchos[mapa.ramCol] >= 36 && panel.anchos[mapa.ramCol] <= 44, "el hueco entre CPU y RAM es estrecho y el byte cabe");
  afirmar(panel.rejillaOculta === true, "la hoja principal oculta la cuadrícula");
  var rota = '" "_ESTADO!';
  var junta = '" "&_ESTADO!';
  function simCuenta_(texto, token) {
    var n = 0;
    var i = 0;
    var s = String(texto);
    while ((i = s.indexOf(token, i)) >= 0) { n++; i += token.length; }
    return n;
  }
  var bytesCache = String(panel.getRange(mapa.cacheBytesFila, mapa.cacheBytesCol).getValue());
  afirmar(bytesCache.indexOf(rota) < 0, "los bytes de caché no dejan el espacio sin &");
  afirmar(simCuenta_(bytesCache, junta) === 7, "la línea L1I une 8 bytes con & a cada lado");
  afirmar(bytesCache.indexOf("=_ESTADO!E" + SIM_FILA_CACHE) === 0, "la línea L1I empieza en la columna E del estado");
  var palabra = String(panel.getRange(mapa.palabraFila, mapa.palabraCol).getValue());
  afirmar(palabra.indexOf('"') < 0 && simCuenta_(palabra, "&_ESTADO!") === 27, "la palabra de 28 bits no usa el separador con espacio");
  afirmar(String(panel.getRange(mapa.vmActivaFila, mapa.vmNotaCol).getValue()).indexOf("VM activa") === 0, "el panel dice que la VM está activa");
  afirmar(String(panel.getRange(mapa.vmActivaFila, mapa.vmNotaCol + 1).getValue()) === "=_ESTADO!A" + (SIM_FILA_PAG + 15), "el indicador lee la presencia de la VPN 15");
  afirmar(String(panel.getRange(mapa.vmActivaFila, mapa.vmNotaCol + 3).getValue()) === "=_ESTADO!B" + (SIM_FILA_PAG + 15), "el indicador lee el marco de la VPN 15");
  afirmar(panel.envolturas[mapa.vmNotaFila + "," + mapa.vmNotaCol] === true && panel.alturas[mapa.vmNotaFila] >= 36, "el aviso de marcos cabe en su fila");
  afirmar(String(panel.getRange(mapa.cacheFila, mapa.ramEncabezadoCol).getValue()).indexOf("Caché") === 0, "la caché está en la hoja principal");
  afirmar(String(panel.getRange(mapa.cacheBytesFila + 1, mapa.cacheBytesCol + 8).getValue()).indexOf("l1d") >= 0 || String(panel.getRange(mapa.cacheBytesFila + 1, 20).getValue()).indexOf("=") === 0, "L1D tiene miss");
  afirmar(String(panel.getRange(mapa.cacheBytesFila, 21).getValue()).indexOf("%") >= 0, "la tasa de L1I lleva porcentaje");
  afirmar(String(panel.getRange(mapa.vmNotaFila, mapa.vmNotaCol).getValue()).indexOf("7") >= 0, "el riesgo de 7 marcos paginables es visible");
  afirmar(String(panel.getRange(mapa.falloFila, mapa.falloCol).getValue()) === "Último fallo", "el fallo de página queda dentro de la ALU");
  afirmar(mapa.falloCol < mapa.ramEncabezadoCol && mapa.falloFila >= mapa.aluFila && mapa.falloFila < mapa.aluFila + 6, "las banderas no flotan fuera de la ALU");
  afirmar(String(panel.getRange(mapa.vmDatosFila, mapa.ramCol).getValue()) === "=_ESTADO!A" + SIM_FILA_SWAP, "la mitad +00 de la VM lee el swap");
  afirmar(String(panel.getRange(mapa.vmAltaFila, mapa.ramCol).getValue()) === "=_ESTADO!Q" + SIM_FILA_SWAP, "la mitad +10 de la VM lee la otra mitad");
  afirmar(String(panel.getRange(mapa.pagFila, mapa.vmNotaCol).getValue()) === "VPN", "la tabla de páginas está bajo la VM");
  afirmar(String(panel.getRange(mapa.pcFila, mapa.pcCol).getValue()).indexOf("=") === 0, "el PC es una fórmula al estado");
  afirmar(String(panel.getRange(mapa.busValorFila, mapa.busValorCol).getValue()).indexOf("=") === 0, "el valor del bus es una fórmula");
  afirmar(String(panel.getRange(mapa.busValorFila, 5).getValue()).indexOf("High-Z") >= 0, "el bus apagado dice High-Z");
  afirmar(panel.validaciones[mapa.prog[0] + "," + mapa.prog[1]], "el selector P1 P2 P3 está en el panel");
  afirmar(panel.casillas[mapa.step[0] + "," + mapa.step[1]] && panel.casillas[mapa.run[0] + "," + mapa.run[1]] && panel.casillas[mapa.load[0] + "," + mapa.load[1]], "Step, Run y Load son casillas");
  var perifericos = libro.getSheetByName("PERIFERICOS");
  afirmar(perifericos.getRange(3, 1).getValue() === "1", "la fila numérica empieza en 1");
  afirmar(perifericos.getRange(6, 3).getValue() === "Q" && perifericos.getRange(9, 3).getValue() === "A" && perifericos.getRange(12, 5).getValue() === "Z", "el teclado es QWERTY");
  afirmar(perifericos.getRange(15, 5).getValue() === "Espacio" && perifericos.getRange(15, 17).getValue() === "Borrar", "hay espacio y borrar");
  afirmar(String(perifericos.getRange(22, 1).getValue()).indexOf("76") > 0, "el LCD lee los glifos del estado");
  afirmar(String(perifericos.getRange(19, 1).getValue()) === "=_ESTADO!A" + (SIM_FILA_RAM + 15), "la FIFO lee F0");
  afirmar(String(libro.getSheetByName("TRACE").getRange(201, 1).getValue()).indexOf(String(SIM_FILA_TRAZA + 199)) > 0, "TRACE muestra las 200 filas");
  afirmar(libro.getSheetByName("CPU").oculta === true, "la pestaña CPU antigua se oculta y no se borra");
  afirmar(libro.getSheetByName("Hoja 1").oculta !== true, "las pestañas heredadas siguen visibles");
  afirmar(libro.getSheetByName("_ESTADO").getRange(1, 1).getValue() === SIM_MAGIA, "la magia del estado quedó escrita");
  libro.getSheetByName("PROGRAMAS").getRange(5, 2).setValue("MOV AX, 01H");

  var filaAx = simFilaEscalar("ax");
  libro.getSheetByName("_ESTADO").getRange(filaAx, 2).setValue(42);
  libro.getSheetByName("PANEL").getRange(mapa.prog[0], mapa.prog[1]).setValue("P2");
  libro.getSheetByName("PANEL").getRange(mapa.delay[0], mapa.delay[1]).setValue(800);
  var segundo = simPrepararEstaCopia();
  afirmar(String(segundo).indexOf("conservó") >= 0, "el reintento avisa que conservó el estado");
  afirmar(libro.getSheetByName("_ESTADO").getRange(filaAx, 2).getValue() === 42, "el reintento no borra un valor ya guardado");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(5, 2).getValue() === "MOV AX, 01H", "el editor de programas sobrevive al reintento");
  afirmar(libro.getSheetByName("Hoja 1") !== null, "las pestañas ajenas siguen en el libro");
  afirmar(libro.getSheetByName("PANEL").getRange(mapa.prog[0], mapa.prog[1]).getValue() === "P2", "el selector de programa sobrevive al reintento");
  afirmar(libro.getSheetByName("PANEL").getRange(mapa.delay[0], mapa.delay[1]).getValue() === 800, "la demora escrita sobrevive al reintento");
  var posAx = simPosA1_(simCeldaVista("axBin"));
  afirmar(libro.getSheetByName("_ESTADO").getRange(posAx.fila, posAx.col).getValue() === "00101010", "el binario de AX conserva los ceros");

  panel.getRange(mapa.prog[0], mapa.prog[1]).setValue("0000000H");
  panel.getRange(19, 3).insertCheckboxes();
  panel.getRange(20, 3).setDataValidation({ tipo: "vieja" });
  simPrepararEstaCopia();
  afirmar(panel.getRange(mapa.prog[0], mapa.prog[1]).getValue() === "P1", "0000000H no se acepta como programa");
  afirmar(!panel.casillas["19,3"], "la casilla vieja C19 se quita");
  afirmar(!panel.validaciones["20,3"], "la validación vieja fuera de los controles se quita");
  afirmar(!!panel.validaciones[mapa.prog[0] + "," + mapa.prog[1]], "la lista del selector vuelve a quedar en el panel");
  afirmar(libro.getSheetByName("_ESTADO").getRange(filaAx, 2).getValue() === 42, "limpiar la presentación no borra AX");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(5, 2).getValue() === "MOV AX, 01H", "limpiar la presentación no borra el editor");

  panel.getRange(mapa.prog[0], mapa.prog[1]).setValue("P2");
  var carga = simCargarDesdePanel();
  afirmar(String(carga).indexOf("P2") >= 0, "el selector carga el catálogo P2");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(5, 2).getValue() === "MOV AX, 01H", "cargar el selector no pisa el editor");
  afirmar(String(libro.getSheetByName("_ESTADO").getRange(simFilaEscalar("programa"), 2).getValue()) === "P2", "el estado queda con P2");
  libro.getSheetByName("_ESTADO").getRange(filaAx, 2).setValue(7);
  panel.getRange(mapa.prog[0], mapa.prog[1]).setValue("P3");
  simPrepararEstaCopia();
  afirmar(panel.getRange(mapa.prog[0], mapa.prog[1]).getValue() === "P2", "el selector muestra el programa del estado y no el valor viejo");
  afirmar(libro.getSheetByName("_ESTADO").getRange(filaAx, 2).getValue() === 7, "repintar la hoja no reinicia la CPU");

  var choque = false;
  try { libro.insertSheet("programas"); }
  catch (err3) { choque = true; }
  afirmar(choque, "insertar programas en otro caso choca con PROGRAMAS");

  var imagen = simEnsamblar("MOV CX, 08H\n");
  afirmar(imagen.ok && imagen.imagen[0] === 0x14 && imagen.imagen[1] === 0x08, "MOV CX, 08H se ensambla a 14 08");
  var editor = [];
  var n;
  for (n = 0; n < 40; n++) editor.push(["", n === 0 ? "MOV CX, 08H" : "", ""]);
  var programas = libro.getSheetByName("PROGRAMAS");
  var pcAntes = libro.getSheetByName("_ESTADO").getRange(simFilaEscalar("pc"), 2).getValue();
  programas.getRange(5, 2, 40, 3).setValues(editor);
  var aviso = simEnsamblarHoja();
  var g5 = programas.getRange(5, 7).getValue();
  afirmar(String(aviso).indexOf("correcto") >= 0, "ensamblar MOV CX, 08H es correcto");
  afirmar(g5 === "14 08", "PROGRAMAS!G5 conserva el texto 14 08, vino " + g5);
  afirmar(programas.numeros["5,7"] === "@", "G5 queda en formato texto");
  afirmar(libro.getSheetByName("_ESTADO").getRange(simFilaEscalar("pc"), 2).getValue() === pcAntes, "el listado no cambia el PC");

  return { ok: fallos.length === 0, total: 1, fallos: fallos };
}
