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
          setDataValidation: function (regla) { validaciones[clave(fila, col)] = regla; return rango; },
          insertCheckboxes: function () { checks[clave(fila, col)] = true; },
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
                lista.push({
                  breakApart: function () {
                    var k = merges.indexOf(g);
                    if (k >= 0) merges.splice(k, 1);
                  }
                });
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
        setAllowInvalid: function () { return o; },
        build: function () { return { tipo: "lista" }; }
      };
      return o;
    }
  };
  ScriptApp = { getScriptId: function () { return SIM_SCRIPT_COPIA; } };
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
  simInstalarServiciosPrueba(libro);
  var primero = simPrepararEstaCopia();
  afirmar(String(primero).indexOf("inicial") >= 0, "la primera preparación crea el estado");
  afirmar(libro.getSheetByName("PROGRAMAS") !== null, "PROGRAMAS queda con el nombre canónico");
  afirmar(libro.getSheetByName("Programas") === null, "no queda una hoja Programas distinta");
  afirmar(libro.getSheetByName("PROGRAMAS").getRange(1, 1).getMergedRanges().length === 0, "el merge heredado se separó");
  var panel = libro.getSheetByName("PANEL");
  afirmar(String(panel.getRange(1, 1).getValue()).indexOf("Simulador") === 0, "el título del panel se escribió");
  afirmar(String(panel.getRange(5, 2).getValue()).indexOf("=") === 0, "la fórmula de estado está en la columna 2");
  afirmar(libro.getSheetByName("_ESTADO").getRange(1, 1).getValue() === SIM_MAGIA, "la magia del estado quedó escrita");

  var filaAx = simFilaEscalar("ax");
  libro.getSheetByName("_ESTADO").getRange(filaAx, 2).setValue(42);
  var segundo = simPrepararEstaCopia();
  afirmar(String(segundo).indexOf("conservó") >= 0, "el reintento avisa que conservó el estado");
  afirmar(libro.getSheetByName("_ESTADO").getRange(filaAx, 2).getValue() === 42, "el reintento no borra un valor ya guardado");
  afirmar(libro.getSheetByName("Hoja 1") !== null, "las pestañas ajenas siguen en el libro");

  var choque = false;
  try { libro.insertSheet("programas"); }
  catch (err3) { choque = true; }
  afirmar(choque, "insertar programas en otro caso choca con PROGRAMAS");

  return { ok: fallos.length === 0, total: 1, fallos: fallos };
}
