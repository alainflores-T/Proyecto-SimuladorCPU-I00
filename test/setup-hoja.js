function simCrearLibroPrueba(opciones) {
  opciones = opciones || {};
  var hojas = [];
  var activa = null;

  function clave(fila, col) { return fila + "," + col; }

  function hojaNueva(nombre) {
    var valores = {};
    var merges = [];
    var formatos = [];
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
      setColumnWidth: function () {},
      alturas: {},
      envolturas: {},
      setRowHeight: function (fila, alto) { hoja.alturas[fila] = alto; },
      casillas: checks,
      validaciones: validaciones,
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
                valores[clave(fr, fc)] = datos[r][c];
              }
            }
          },
          setBackground: function () { return rango; },
          setFontColor: function () { return rango; },
          setFontWeight: function () { return rango; },
          setFontSize: function () { return rango; },
          setHorizontalAlignment: function () { return rango; },
          setNumberFormat: function () { return rango; },
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
  afirmar(String(panel.getRange(1, 1).getValue()).indexOf("UNIDAD CENTRAL") === 0, "el título del panel se escribió");
  afirmar(String(panel.getRange(5, 1).getValue()) === "Registro", "los registros quedan a la izquierda");
  afirmar(String(panel.getRange(21, 1).getValue()) === "Buses", "los buses están en la hoja principal");
  afirmar(String(panel.getRange(12, 10).getValue()) === "Memoria RAM", "la RAM queda a la derecha");
  afirmar(String(panel.getRange(13, 11).getValue()) === "=_ESTADO!A" + SIM_FILA_RAM, "la celda 00h apunta al primer byte");
  afirmar(String(panel.getRange(28, 26).getValue()) === "=_ESTADO!P" + (SIM_FILA_RAM + 15), "la celda FFh apunta al último byte");
  afirmar(String(panel.getRange(13, 11).getValue()).indexOf("\"") < 0, "la RAM visible no concatena con comillas");
  var rota = '" "_ESTADO!';
  var junta = '" "&_ESTADO!';
  function simCuenta_(texto, token) {
    var n = 0;
    var i = 0;
    var s = String(texto);
    while ((i = s.indexOf(token, i)) >= 0) { n++; i += token.length; }
    return n;
  }
  var bytesCache = String(panel.getRange(6, 14).getValue());
  afirmar(bytesCache.indexOf(rota) < 0, "los bytes de caché no dejan el espacio sin &");
  afirmar(simCuenta_(bytesCache, junta) === 7, "la línea L1I une 8 bytes con & a cada lado");
  afirmar(bytesCache.indexOf("=_ESTADO!E" + SIM_FILA_CACHE) === 0, "la línea L1I empieza en la columna E del estado");
  var palabra = String(panel.getRange(14, 3).getValue());
  afirmar(palabra.indexOf('"') < 0 && simCuenta_(palabra, "&_ESTADO!") === 27, "la palabra de 28 bits no usa el separador con espacio");
  afirmar(String(panel.getRange(31, 10).getValue()).indexOf("VM activa") === 0, "el panel dice que la VM está activa");
  afirmar(String(panel.getRange(31, 11).getValue()) === "=_ESTADO!A" + (SIM_FILA_PAG + 15), "el indicador lee la presencia de la VPN 15");
  afirmar(String(panel.getRange(31, 13).getValue()) === "=_ESTADO!B" + (SIM_FILA_PAG + 15), "el indicador lee el marco de la VPN 15");
  afirmar(panel.envolturas["30,10"] === true && panel.alturas[30] >= 36, "el aviso de marcos cabe en su fila");
  afirmar(String(panel.getRange(4, 10).getValue()) === "Caché", "la caché está encima de la RAM");
  afirmar(String(panel.getRange(30, 10).getValue()).indexOf("7") >= 0, "el riesgo de 7 marcos paginables es visible");
  afirmar(String(panel.getRange(19, 7).getValue()) === "Último fallo", "el fallo de página se marca como histórico");
  afirmar(String(panel.getRange(6, 3).getValue()).indexOf("=") === 0, "el PC es una fórmula al estado");
  afirmar(String(panel.getRange(22, 3).getValue()).indexOf("=") === 0, "el valor del bus es una fórmula");
  afirmar(panel.validaciones["3,4"], "el selector P1 P2 P3 está en el panel");
  afirmar(panel.casillas["3,1"] && panel.casillas["3,2"] && panel.casillas["3,3"], "Step, Run y Load son casillas");
  afirmar(libro.getSheetByName("PERIFERICOS").getRange(3, 1).getValue() === "A", "el teclado físico empieza en A");
  afirmar(String(libro.getSheetByName("PERIFERICOS").getRange(12, 2).getValue()).indexOf("76") > 0, "el LCD lee los glifos del estado");
  afirmar(String(libro.getSheetByName("TRACE").getRange(201, 1).getValue()).indexOf(String(SIM_FILA_TRAZA + 199)) > 0, "TRACE muestra las 200 filas");
  afirmar(libro.getSheetByName("CPU").oculta === true, "la pestaña CPU antigua se oculta y no se borra");
  afirmar(libro.getSheetByName("Hoja 1").oculta !== true, "las pestañas heredadas siguen visibles");
  afirmar(libro.getSheetByName("_ESTADO").getRange(1, 1).getValue() === SIM_MAGIA, "la magia del estado quedó escrita");
  libro.getSheetByName("PROGRAMAS").getRange(5, 2).setValue("MOV AX, 01H");

  var filaAx = simFilaEscalar("ax");
  libro.getSheetByName("_ESTADO").getRange(filaAx, 2).setValue(42);
  libro.getSheetByName("PANEL").getRange(3, 4).setValue("P2");
  libro.getSheetByName("PANEL").getRange(3, 5).setValue(800);
  var segundo = simPrepararEstaCopia();
  afirmar(String(segundo).indexOf("conservó") >= 0, "el reintento avisa que conservó el estado");
  afirmar(libro.getSheetByName("_ESTADO").getRange(filaAx, 2).getValue() === 42, "el reintento no borra un valor ya guardado");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(5, 2).getValue() === "MOV AX, 01H", "el editor de programas sobrevive al reintento");
  afirmar(libro.getSheetByName("Hoja 1") !== null, "las pestañas ajenas siguen en el libro");
  afirmar(libro.getSheetByName("PANEL").getRange(3, 4).getValue() === "P2", "el selector de programa sobrevive al reintento");
  afirmar(libro.getSheetByName("PANEL").getRange(3, 5).getValue() === 800, "la demora escrita sobrevive al reintento");
  var posAx = simPosA1_(simCeldaVista("axBin"));
  afirmar(libro.getSheetByName("_ESTADO").getRange(posAx.fila, posAx.col).getValue() === "00101010", "el binario de AX conserva los ceros");

  panel.getRange(3, 4).setValue("0000000H");
  panel.getRange(19, 3).insertCheckboxes();
  panel.getRange(20, 3).setDataValidation({ tipo: "vieja" });
  simPrepararEstaCopia();
  afirmar(panel.getRange(3, 4).getValue() === "P1", "0000000H no se acepta como programa");
  afirmar(!panel.casillas["19,3"], "la casilla vieja C19 se quita");
  afirmar(!panel.validaciones["20,3"], "la validación vieja fuera de los controles se quita");
  afirmar(!!panel.validaciones["3,4"], "la lista del selector vuelve a quedar en el panel");
  afirmar(libro.getSheetByName("_ESTADO").getRange(filaAx, 2).getValue() === 42, "limpiar la presentación no borra AX");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(5, 2).getValue() === "MOV AX, 01H", "limpiar la presentación no borra el editor");

  panel.getRange(3, 4).setValue("P2");
  var carga = simCargarDesdePanel();
  afirmar(String(carga).indexOf("P2") >= 0, "el selector carga el catálogo P2");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(5, 2).getValue() === "MOV AX, 01H", "cargar el selector no pisa el editor");
  afirmar(String(libro.getSheetByName("_ESTADO").getRange(simFilaEscalar("programa"), 2).getValue()) === "P2", "el estado queda con P2");

  var choque = false;
  try { libro.insertSheet("programas"); }
  catch (err3) { choque = true; }
  afirmar(choque, "insertar programas en otro caso choca con PROGRAMAS");

  return { ok: fallos.length === 0, total: 1, fallos: fallos };
}
