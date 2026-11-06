/**
 * Catalog.gs — Directorio de programas (catálogo en hoja "Directorio").
 * Lógica pura arriba (conteo de instrucciones/bytes/páginas sin depender del ensamblador).
 * Pegamento de Sheets al final: crear hoja, migrar Programas, botones.
 *
 * Columnas del Directorio: ID | Nombre | Descripción | # instr | Bytes | Páginas | Estado
 * Página virtual = 32 bytes (ceil(bytes/32) si es contiguo desde 0).
 */

var CAT_SHEET_NAME = "Directorio";
var CAT_EDITOR_SHEET = "Editor";
var CAT_EDITOR_RANGE = "A1:A200";
var CAT_SELECTOR_CELL = "B1"; // celda del desplegable de programa activo
var CAT_HEADER = ["ID", "Nombre", "Descripción", "# instr", "Bytes", "Páginas", "Estado"];
var CAT_PAGE_SIZE = 32;
var CAT_SOURCE_PREFIX = "SRC_"; // hojas SRC_P1, SRC_P2, ...
var CAT_ESTADOS = ["Borrador", "Ensamblado", "Error", "Cargado"];

/**
 * Mnemonics conocidos para el contador ligero (sin ensamblar de verdad).
 * Mantiene el PR del catálogo independiente del ensamblador.
 */
var CAT_MNEMONICS = {
  "NOP": 1, "MOV": 3, "ADD": 3, "SUB": 3, "INC": 2, "DEC": 2, "CMP": 3,
  "LD": 3, "LOAD": 3, "ST": 3, "STORE": 3, "JMP": 2, "JZ": 2, "JNZ": 2,
  "JC": 2, "JS": 2, "AND": 3, "OR": 3, "IN": 3, "OUT": 3, "HLT": 1
};

/**
 * Contador aproximado de instrucciones / bytes / páginas a partir del fuente.
 * No resuelve etiquetas ni ORG: para metadatos del catálogo.
 * Si la línea es DB, suma la cantidad de valores.
 * Retorna { instructions, bytes, pages, errors[] }.
 */
function catalogContarFuente(fuente) {
  var lineas = Array.isArray(fuente)
    ? fuente
    : String(fuente || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  var instructions = 0;
  var bytes = 0;
  var errors = [];
  var loc = 0;
  var maxLoc = 0;
  var touched = {};

  for (var i = 0; i < lineas.length; i++) {
    var raw = String(lineas[i] == null ? "" : lineas[i]);
    var sin = raw.split(";")[0].split("//")[0].trim();
    if (!sin) continue;

    // quitar etiqueta
    var mEtq = sin.match(/^[A-Za-z_][A-Za-z0-9_]*:\s*(.*)$/);
    if (mEtq) sin = (mEtq[1] || "").trim();
    if (!sin) continue;

    var partes = sin.split(/\s+/);
    var mnem = (partes[0] || "").toUpperCase();
    var resto = sin.substring(partes[0].length).trim();

    if (mnem === "ORG") {
      var n = NaN;
      var t = resto.replace(/[\[\]]/g, "").trim().toUpperCase();
      if (t.endsWith("H")) n = parseInt(t.slice(0, -1), 16);
      else n = parseInt(t, 10);
      if (!isNaN(n)) loc = n & 0x1FF;
      continue;
    }
    if (mnem === "EQU") continue;

    if (mnem === "DB") {
      var vals = resto.split(/[,\s]+/).filter(Boolean);
      var dbn = vals.length || 1;
      for (var b = 0; b < dbn; b++) touched[loc + b] = true;
      loc += dbn;
      if (loc > maxLoc) maxLoc = loc;
      continue;
    }

    var sz = CAT_MNEMONICS[mnem];
    if (sz == null) {
      errors.push("Línea " + (i + 1) + ": mnemonic desconocido '" + mnem + "'");
      continue;
    }
    // Ajuste burdo: si hay dirección > FFH en el texto, +1 byte
    var up = resto.toUpperCase();
    if (/\b1[0-9A-F]{2}H\b/.test(up) || /\[[01][0-9A-F]{2}H\]/.test(up)) {
      if (mnem === "LD" || mnem === "LOAD" || mnem === "ST" || mnem === "STORE" ||
          mnem === "JMP" || mnem === "JZ" || mnem === "JNZ" || mnem === "JC" || mnem === "JS") {
        sz += 1;
      }
    }
    for (var c = 0; c < sz; c++) touched[loc + c] = true;
    loc += sz;
    if (loc > maxLoc) maxLoc = loc;
    instructions++;
  }

  var byteCount = 0;
  var pagesSet = {};
  for (var a in touched) {
    byteCount++;
    pagesSet[Math.floor(parseInt(a, 10) / CAT_PAGE_SIZE)] = true;
  }
  var pages = 0;
  for (var p in pagesSet) pages++;
  if (pages === 0 && byteCount === 0) pages = 0;
  else if (pages === 0) pages = Math.ceil(byteCount / CAT_PAGE_SIZE);

  return {
    instructions: instructions,
    bytes: byteCount,
    pages: pages,
    errors: errors
  };
}

/**
 * Modelo puro de un programa del catálogo.
 */
function catalogCrearEntrada(id, nombre, descripcion, fuenteLineas, estado) {
  var c = catalogContarFuente(fuenteLineas);
  return {
    id: id,
    nombre: nombre,
    descripcion: descripcion || "",
    instructions: c.instructions,
    bytes: c.bytes,
    pages: c.pages,
    estado: estado || (c.errors.length ? "Error" : "Borrador"),
    source: Array.isArray(fuenteLineas) ? fuenteLineas.slice() : String(fuenteLineas || "").split("\n"),
    countErrors: c.errors
  };
}

/**
 * Migra los 5 programas sueltos de la hoja Programas (columnas A,H,K,O,R).
 * Asunciones documentadas:
 *  - Col A filas 2.. = Programa 1 (acceso memoria / carry), encabezado en A1.
 *  - Col H filas 3.. = Programa 2 (acumulador con bucle DEC/JNZ).
 *  - Col K filas 3.. = Programa 3 (contador INC/CMP).
 *  - Col O filas 3.. = Programa 4 (CMP y store).
 *  - Col R filas 3.. = Programa 5 (comparación con dos HLT).
 * Se adaptan saltos absolutos por índice a etiquetas cuando es obvio.
 */
function catalogProgramasMigradosPorDefecto() {
  return [
    catalogCrearEntrada(1, "carry-memoria",
      "Carga AX/BX desde 80H/81H, suma, salta si carry; escribe resultado.",
      [
        "; Migrado de Programas!A (índices → etiquetas)",
        "inicio:",
        "  LD AX, [80H]",
        "  LD BX, [81H]",
        "  ADD AX, BX",
        "  JC fin",
        "  ST [80H], BX",
        "  ST [80H], AX",
        "  JMP inicio",
        "fin:",
        "  HLT"
      ], "Borrador"),
    catalogCrearEntrada(2, "acumulador-bucle",
      "Suma 03H cuatro veces en AX usando DEC/JNZ; guarda en 20H.",
      [
        "; Migrado de Programas!H",
        "  MOV AX, 00H",
        "  MOV BX, 04H",
        "bucle:",
        "  ADD AX, 03H",
        "  DEC BX",
        "  JNZ bucle",
        "  ST [20H], AX",
        "  HLT"
      ], "Borrador"),
    catalogCrearEntrada(3, "contador-cinco",
      "Incrementa AX hasta 5 y lo guarda en 20H.",
      [
        "; Migrado de Programas!K",
        "  MOV AX, 00H",
        "loop:",
        "  INC AX",
        "  CMP AX, 05H",
        "  JNZ loop",
        "  ST [20H], AX",
        "  HLT"
      ], "Borrador"),
    catalogCrearEntrada(4, "cmp-store",
      "Compara AX=03H con BX=08H y almacena AX en 20H.",
      [
        "; Migrado de Programas!O",
        "  MOV AX, 03H",
        "  MOV BX, 08H",
        "  CMP AX, BX",
        "  ST [20H], AX",
        "  HLT"
      ], "Borrador"),
    catalogCrearEntrada(5, "cmp-doble-hlt",
      "Si AX==[10H] escribe 00H; si no, FFH. Dos salidas HLT.",
      [
        "; Migrado de Programas!R",
        "  MOV AX, 0AH",
        "  LD BX, [10H]",
        "  CMP AX, BX",
        "  JZ iguales",
        "  ST [30H], 00H",
        "  HLT",
        "iguales:",
        "  ST [30H], FFH",
        "  HLT"
      ], "Borrador")
  ];
}

/**
 * Serializa entradas a filas de tabla (sin fuente).
 */
function catalogEntradasAFilas(entradas) {
  var filas = [CAT_HEADER.slice()];
  for (var i = 0; i < entradas.length; i++) {
    var e = entradas[i];
    filas.push([
      e.id,
      e.nombre,
      e.descripcion,
      e.instructions,
      e.bytes,
      e.pages,
      e.estado
    ]);
  }
  return filas;
}

/**
 * Genera el texto .asm exportable de un programa.
 */
function catalogExportarAsm(entrada) {
  var header = [
    "; Programa: " + entrada.nombre,
    "; ID: " + entrada.id,
    "; " + (entrada.descripcion || ""),
    "; Bytes≈" + entrada.bytes + "  Páginas≈" + entrada.pages + "  Instr≈" + entrada.instructions,
    ""
  ];
  return header.concat(entrada.source).join("\n") + "\n";
}

// --- Pegamento Google Sheets ---

function catalogObtenerHoja_(nombre, crear) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombre);
  if (!sh && crear) sh = ss.insertSheet(nombre);
  return sh;
}

/**
 * Crea/actualiza la hoja Directorio con la tabla y el desplegable.
 * Migra desde Programas si Directorio está vacío.
 */
function catalogInicializarDirectorio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dir = catalogObtenerHoja_(CAT_SHEET_NAME, true);
  var editor = catalogObtenerHoja_(CAT_EDITOR_SHEET, true);

  var last = dir.getLastRow();
  var entradas;
  if (last < 2) {
    entradas = catalogProgramasMigradosPorDefecto();
    // Guardar fuentes en hojas SRC_n
    for (var i = 0; i < entradas.length; i++) {
      catalogGuardarFuente_(entradas[i]);
    }
    var filas = catalogEntradasAFilas(entradas);
    dir.clear();
    dir.getRange(1, 1, filas.length, CAT_HEADER.length).setValues(filas);
    dir.getRange(1, 1, 1, CAT_HEADER.length)
      .setFontWeight("bold").setBackground("#1F4E78").setFontColor("#FFFFFF");
    // Selector
    dir.getRange("A1").setNote("Catálogo de programas (disco emulado)");
    dir.getRange(CAT_SELECTOR_CELL).setValue(entradas[0].nombre);
    var nombres = entradas.map(function (e) { return e.nombre; });
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(nombres, true)
      .setAllowInvalid(false)
      .build();
    dir.getRange(CAT_SELECTOR_CELL).setDataValidation(rule);
    dir.getRange("A1").setValue("ID"); // restaurar header tras note
    // Etiqueta del selector a la izquierda de B1 → usamos D1/E1 libres? Mejor fila auxiliar
    dir.insertRows(1);
    dir.getRange("A1").setValue("Programa activo:");
    dir.getRange("B1").setValue(entradas[0].nombre);
    dir.getRange("B1").setDataValidation(rule);
    dir.getRange("C1").setValue("Botones: Abrir / Nuevo / Duplicar (asigna estas funciones)");
    // Reescribir tabla desde fila 3
    dir.getRange(3, 1, filas.length, CAT_HEADER.length).setValues(filas);
    dir.getRange(3, 1, 1, CAT_HEADER.length)
      .setFontWeight("bold").setBackground("#1F4E78").setFontColor("#FFFFFF");
  }

  SpreadsheetApp.getUi().alert(
    "Directorio listo. Usa el desplegable en B1 y los botones:\n" +
    "catalogAbrirEnEditor / catalogNuevoPrograma / catalogDuplicarPrograma"
  );
}

function catalogGuardarFuente_(entrada) {
  var nombre = CAT_SOURCE_PREFIX + entrada.id;
  var sh = catalogObtenerHoja_(nombre, true);
  sh.clear();
  var vals = entrada.source.map(function (l) { return [l]; });
  if (vals.length === 0) vals = [[""]];
  sh.getRange(1, 1, vals.length, 1).setValues(vals);
  sh.getRange("B1").setValue(entrada.nombre);
  sh.getRange("C1").setValue(entrada.descripcion);
}

function catalogLeerFuente_(id) {
  var sh = catalogObtenerHoja_(CAT_SOURCE_PREFIX + id, false);
  if (!sh) return [];
  var values = sh.getRange(CAT_EDITOR_RANGE).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    out.push(values[i][0] == null ? "" : String(values[i][0]));
  }
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

function catalogLeerTabla_() {
  var dir = catalogObtenerHoja_(CAT_SHEET_NAME, false);
  if (!dir) return [];
  // Detectar fila de encabezado (busca "ID")
  var data = dir.getDataRange().getValues();
  var start = 0;
  for (var r = 0; r < data.length; r++) {
    if (String(data[r][0]).toUpperCase() === "ID") { start = r; break; }
  }
  var entradas = [];
  for (var i = start + 1; i < data.length; i++) {
    var row = data[i];
    if (row[0] === "" || row[0] == null) continue;
    entradas.push({
      id: Number(row[0]),
      nombre: String(row[1] || ""),
      descripcion: String(row[2] || ""),
      instructions: Number(row[3] || 0),
      bytes: Number(row[4] || 0),
      pages: Number(row[5] || 0),
      estado: String(row[6] || "Borrador"),
      rowIndex: i + 1 // 1-based en hoja
    });
  }
  return entradas;
}

function catalogBuscarPorNombre_(nombre) {
  var all = catalogLeerTabla_();
  var up = String(nombre || "").toUpperCase();
  for (var i = 0; i < all.length; i++) {
    if (all[i].nombre.toUpperCase() === up) return all[i];
  }
  return null;
}

function catalogProgramaActivoNombre_() {
  var dir = catalogObtenerHoja_(CAT_SHEET_NAME, false);
  if (!dir) return null;
  return String(dir.getRange("B1").getValue() || "").trim();
}

/**
 * Botón: Abrir en editor — copia la fuente del programa activo a la hoja Editor.
 */
function catalogAbrirEnEditor() {
  var nombre = catalogProgramaActivoNombre_();
  var entrada = catalogBuscarPorNombre_(nombre);
  if (!entrada) {
    SpreadsheetApp.getUi().alert("Selecciona un programa válido en B1.");
    return;
  }
  var fuente = catalogLeerFuente_(entrada.id);
  var editor = catalogObtenerHoja_(CAT_EDITOR_SHEET, true);
  editor.getRange(CAT_EDITOR_RANGE).clearContent();
  if (fuente.length) {
    var vals = fuente.map(function (l) { return [l]; });
    editor.getRange(1, 1, vals.length, 1).setValues(vals);
  }
  editor.getRange("B1").setValue(entrada.nombre);
  SpreadsheetApp.getUi().alert("Programa '" + entrada.nombre + "' abierto en Editor.");
}

/**
 * Botón: Nuevo programa — agrega una entrada vacía y la abre.
 */
function catalogNuevoPrograma() {
  var all = catalogLeerTabla_();
  var maxId = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id > maxId) maxId = all[i].id;
  }
  var nuevo = catalogCrearEntrada(maxId + 1, "programa-" + (maxId + 1),
    "Nuevo programa", ["  NOP", "  HLT"], "Borrador");
  catalogGuardarFuente_(nuevo);

  var dir = catalogObtenerHoja_(CAT_SHEET_NAME, true);
  var filas = catalogLeerTabla_();
  // Encontrar última fila de datos
  var data = dir.getDataRange().getValues();
  var last = data.length + 1;
  dir.getRange(last, 1, 1, 7).setValues([[
    nuevo.id, nuevo.nombre, nuevo.descripcion,
    nuevo.instructions, nuevo.bytes, nuevo.pages, nuevo.estado
  ]]);

  // Actualizar validación del desplegable
  filas.push(nuevo);
  var nombres = filas.map(function (e) { return e.nombre; });
  nombres.push(nuevo.nombre);
  // unique
  var seen = {};
  var uniq = [];
  for (var k = 0; k < nombres.length; k++) {
    if (!seen[nombres[k]]) { seen[nombres[k]] = true; uniq.push(nombres[k]); }
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(uniq, true).build();
  dir.getRange("B1").setDataValidation(rule).setValue(nuevo.nombre);

  catalogAbrirEnEditor();
}

/**
 * Botón: Duplicar — clona el programa activo con nuevo ID/nombre.
 */
function catalogDuplicarPrograma() {
  var nombre = catalogProgramaActivoNombre_();
  var entrada = catalogBuscarPorNombre_(nombre);
  if (!entrada) {
    SpreadsheetApp.getUi().alert("Selecciona un programa válido en B1.");
    return;
  }
  var fuente = catalogLeerFuente_(entrada.id);
  var all = catalogLeerTabla_();
  var maxId = 0;
  for (var i = 0; i < all.length; i++) {
    if (all[i].id > maxId) maxId = all[i].id;
  }
  var copia = catalogCrearEntrada(
    maxId + 1,
    entrada.nombre + "-copia",
    entrada.descripcion + " (copia)",
    fuente,
    "Borrador"
  );
  catalogGuardarFuente_(copia);

  var dir = catalogObtenerHoja_(CAT_SHEET_NAME, true);
  var data = dir.getDataRange().getValues();
  var last = data.length + 1;
  dir.getRange(last, 1, 1, 7).setValues([[
    copia.id, copia.nombre, copia.descripcion,
    copia.instructions, copia.bytes, copia.pages, copia.estado
  ]]);

  var nombres = all.map(function (e) { return e.nombre; });
  nombres.push(copia.nombre);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(nombres, true).build();
  dir.getRange("B1").setDataValidation(rule).setValue(copia.nombre);
  SpreadsheetApp.getUi().alert("Duplicado como '" + copia.nombre + "'.");
}

/**
 * Recalcula #instr/bytes/páginas de todas las filas leyendo SRC_*.
 */
function catalogRefrescarMetadatos() {
  var all = catalogLeerTabla_();
  var dir = catalogObtenerHoja_(CAT_SHEET_NAME, false);
  for (var i = 0; i < all.length; i++) {
    var fuente = catalogLeerFuente_(all[i].id);
    var c = catalogContarFuente(fuente);
    dir.getRange(all[i].rowIndex, 4, 1, 3).setValues([[c.instructions, c.bytes, c.pages]]);
  }
}
