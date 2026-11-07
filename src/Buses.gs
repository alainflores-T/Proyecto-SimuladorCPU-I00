// Buses.gs - Bus interno/externo (#30) y buffers tri-state (#31)

var busInterno = crearBus("interno");
var busDir     = crearBus("direccion");
var busDatos   = crearBus("datos");
var estadoBuffers = crearEstadoBuffers();

function crearBus(nombre) {
  return {
    nombre: nombre,
    driver: null,
    value: null
  };
}

function liberarBus(bus) {
  bus.driver = null;
  bus.value = null;
}

function crearEstadoBuffers() {
  var comps = (typeof BUF_COMPONENTES !== "undefined")
    ? BUF_COMPONENTES
    : ["PC","IR","MAR","MDR","AX","BX","CX","DX","ALU","RAM","KBD","LCD"];
  var estado = {};
  for (var i = 0; i < comps.length; i++) {
    estado[comps[i]] = { en: 0, ld: 0, valor: null, bus: null };
  }
  return estado;
}

function limpiarSenalesBuffers() {
  estadoBuffers = crearEstadoBuffers();
}

function normalizarComponente(nombre) {
  var n = String(nombre || "").toUpperCase().trim();
  if (n === "CACHE" || n === "RAM/CACHE") return "RAM";
  if (estadoBuffers.hasOwnProperty(n)) return n;
  return null;
}

function filaBuffer(nombre) {
  var i = BUF_COMPONENTES.indexOf(nombre);
  return i === -1 ? null : BUF_START_ROW + i;
}

function listaBus(busNombre) {
  if (busNombre === "direccion") return BUF_BUS_DIRECCION;
  if (busNombre === "datos") return BUF_BUS_DATOS;
  return BUF_BUS_INTERNO;
}

function nombreLogicoBus(bus) {
  if (bus === busDir) return "direccion";
  if (bus === busDatos) return "datos";
  return "interno";
}

function marcarEnable(nombre, valor, busNombre) {
  var n = normalizarComponente(nombre);
  if (!n) return;
  estadoBuffers[n].en = 1;
  estadoBuffers[n].valor = valor;
  estadoBuffers[n].bus = busNombre;
}

function marcarLoad(nombre) {
  var n = normalizarComponente(nombre);
  if (!n) return;
  estadoBuffers[n].ld = 1;
}

function detectarContencion(busNombre) {
  var comps = listaBus(busNombre);
  var activos = [];
  for (var i = 0; i < comps.length; i++) {
    var e = estadoBuffers[comps[i]];
    if (e && e.en && e.bus === busNombre) activos.push(comps[i]);
  }
  return activos.length > 1 ? activos : null;
}

function errorContencion(sheet, busNombre, drivers) {
  sheet.getRange(CPU_STATE).setValue("HALT");
  var msg = "CONTENCIÓN DE BUS (" + busNombre + "): " + drivers.join(" y ") + " tienen En=1 a la vez";
  registrarLog(sheet, "⛔ " + msg);
  sheet.getRange(BUF_HEADER_ROW, BUF_NAME_COL, 1, 4)
    .setBackground("#F44336")
    .setFontColor("#FFFFFF");
  for (var i = 0; i < drivers.length; i++) {
    var fila = filaBuffer(drivers[i]);
    if (fila) {
      sheet.getRange(fila, BUF_EST_COL).setBackground("#F44336").setFontColor("#FFFFFF");
    }
  }
  SpreadsheetApp.flush();
  throw new Error(msg);
}

function mapaCeldasRegistros() {
  return {
    "PC": REG_PC, "IR": REG_IR, "MAR": REG_MAR, "MDR": REG_MDR,
    "AX": REG_AX, "BX": REG_BX, "CX": REG_CX, "DX": REG_DX
  };
}

function leerFuente(sheet, nombre) {
  var n = String(nombre).toUpperCase().trim();
  if (n === "RAM") {
    return { name: "RAM", value: obtenerDatoRAM(sheet, sheet.getRange(REG_MAR).getValue()) };
  }
  var celdas = mapaCeldasRegistros();
  if (celdas[n]) {
    return { name: n, value: sheet.getRange(celdas[n]).getValue() };
  }
  return { name: n, value: nombre };
}

function escribirDestinoBus(sheet, dest, valor) {
  var d = String(dest).toUpperCase().trim();
  if (d === "RAM") {
    var celdaRAM = obtenerCeldaRAM(sheet.getRange(REG_MAR).getValue());
    if (celdaRAM) {
      celdaRAM.setValue(valor);
      celdaRAM.setBackground("#C8E6C9");
    }
    return;
  }
  if (esRegistro(d)) {
    escribirRegistro(sheet, d, valor);
    return;
  }
  var celdas = mapaCeldasRegistros();
  if (celdas[d]) {
    sheet.getRange(celdas[d]).setValue(valor);
  }
}

function transfer(bus, source, destinations, sheet) {
  var busNombre = nombreLogicoBus(bus);
  marcarEnable(source.name, source.value, busNombre);
  var conflicto = detectarContencion(busNombre);
  if (conflicto) {
    mostrarBuses(sheet);
  pintarBuffers(sheet);
  senalIncPC = 0;
  if (typeof publicarPalabraDesdeEstado === "function") publicarPalabraDesdeEstado(sheet);
  }

  bus.driver = source.name;
  bus.value = source.value;
  if (destinations && destinations.length) {
    for (var i = 0; i < destinations.length; i++) {
      marcarLoad(destinations[i]);
      escribirDestinoBus(sheet, destinations[i], source.value);
    }
  }
  mostrarBuses(sheet);
  pintarBuffers(sheet);
  return source.value;
}

function textoBus(val) {
  if (val === null || val === undefined || val === "") return BUS_ALTA_Z;
  return val;
}

function mostrarBuses(sheet) {
  var valInt = textoBus(busInterno.value);
  sheet.getRange(BUS_INT_VAL).setValue(valInt);
  sheet.getRange(BUS_INT_DRIVER).setValue(busInterno.driver || "—");
  sheet.getRange(BUS_INT_VAL).setBackground(valInt === BUS_ALTA_Z ? "#B0BEC5" : "#C8E6C9");

  var valDir = textoBus(busDir.value);
  sheet.getRange(BUS_EXT_ADDR).setValue(valDir);
  sheet.getRange(BUS_EXT_ADDR).setBackground(busDir.value === null ? "#B0BEC5" : "#CE93D8");

  var valDat = textoBus(busDatos.value);
  sheet.getRange(BUS_EXT_DATA).setValue(valDat);
  sheet.getRange(BUS_EXT_DRIVER).setValue(busDatos.driver || "—");
  sheet.getRange(BUS_EXT_DATA).setBackground(valDat === BUS_ALTA_Z ? "#B0BEC5" : "#FFE0B2");
}

function setControl(sheet, senales) {
  ultimasSenalesControl = {
    rd: senales.rd ? 1 : 0,
    wr: senales.wr ? 1 : 0,
    io: senales.io ? 1 : 0
  };
  // ...el resto igual
  sheet.getRange(BUS_CTRL_RD).setValue(senales.rd ? 1 : 0);
  sheet.getRange(BUS_CTRL_WR).setValue(senales.wr ? 1 : 0);
  sheet.getRange(BUS_CTRL_IO).setValue(senales.io ? 1 : 0);
}

function pulsoReloj(sheet) {
  sheet.getRange(BUS_CTRL_CLK).setValue(1);
  SpreadsheetApp.flush();
  Utilities.sleep(150);
  sheet.getRange(BUS_CTRL_CLK).setValue(0);
}

function transferInterna(sheet, origen, destinos) {
  limpiarSenalesBuffers();
  setControl(sheet, { rd: 0, wr: 0, io: 0 });
  liberarBus(busDatos);
  liberarBus(busDir);
  var fuente = (typeof origen === "string") ? leerFuente(sheet, origen) : origen;
  var valor = transfer(busInterno, fuente, destinos, sheet);
  pulsoReloj(sheet);
  return valor;
}

function transferLecturaMemoria(sheet) {
  limpiarSenalesBuffers();
  transfer(busDir, leerFuente(sheet, "MAR"), [], sheet);
  setControl(sheet, { rd: 1, wr: 0, io: 0 });
  var ram = leerFuente(sheet, "RAM");
  var valor = transfer(busDatos, ram, ["MDR"], sheet);
  pulsoReloj(sheet);
  return valor;
}

function transferEscrituraMemoria(sheet) {
  limpiarSenalesBuffers();
  transfer(busDir, leerFuente(sheet, "MAR"), [], sheet);
  setControl(sheet, { rd: 0, wr: 1, io: 0 });
  transfer(busDatos, leerFuente(sheet, "MDR"), ["RAM"], sheet);
  pulsoReloj(sheet);
}

function inicializarPanelBuffers(sheet) {
  sheet.getRange(BUF_HEADER_ROW, BUF_NAME_COL, 1, 4)
    .setBackground("#FFF9C4")
    .setFontColor("#000000")
    .setFontWeight("bold");
  sheet.getRange(BUF_HEADER_ROW, BUF_NAME_COL).setValue("BUFFERS TRI-STATE");
  sheet.getRange(BUF_HEADER_ROW, BUF_EN_COL).setValue("En");
  sheet.getRange(BUF_HEADER_ROW, BUF_LD_COL).setValue("Ld");
  sheet.getRange(BUF_HEADER_ROW, BUF_EST_COL).setValue("Estado");

  for (var i = 0; i < BUF_COMPONENTES.length; i++) {
    sheet.getRange(BUF_START_ROW + i, BUF_NAME_COL).setValue(BUF_COMPONENTES[i]);
  }
}

function pintarBuffers(sheet) {
  for (var i = 0; i < BUF_COMPONENTES.length; i++) {
    var nombre = BUF_COMPONENTES[i];
    var e = estadoBuffers[nombre];
    var fila = BUF_START_ROW + i;
    var en = e.en ? 1 : 0;
    var ld = e.ld ? 1 : 0;
    var est = e.en ? textoBus(e.valor) : "Z";

    sheet.getRange(fila, BUF_EN_COL).setValue(en).setBackground(en ? "#C8E6C9" : "#EEEEEE").setFontColor("#000000");
    sheet.getRange(fila, BUF_LD_COL).setValue(ld).setBackground(ld ? "#BBDEFB" : "#EEEEEE").setFontColor("#000000");
    sheet.getRange(fila, BUF_EST_COL).setValue(est).setBackground(e.en ? "#C8E6C9" : "#EEEEEE").setFontColor("#000000");
  }
}

function resetearBuffers(sheet) {
  limpiarSenalesBuffers();
  sheet.getRange(BUF_HEADER_ROW, BUF_NAME_COL, 1, 4)
    .setBackground("#FFF9C4")
    .setFontColor("#000000");
  pintarBuffers(sheet);
}

function inicializarPanelBuses(sheet) {
  sheet.getRange("J15").setValue("BUS INTERNO (CPU)").setFontWeight("bold").setBackground("#C8E6C9");
  sheet.getRange("K15").setBackground("#C8E6C9");
  sheet.getRange("J16").setValue("Valor");
  sheet.getRange("J17").setValue("Conductor");

  sheet.getRange("J18").setValue("BUS EXTERNO").setFontWeight("bold").setBackground("#BBDEFB");
  sheet.getRange("K18").setBackground("#BBDEFB");
  sheet.getRange("J19").setValue("Address").setBackground("#CE93D8");
  sheet.getRange("J20").setValue("Data").setBackground("#FFE0B2");
  sheet.getRange("J21").setValue("Conductor");

  sheet.getRange("J22").setValue("CONTROL").setFontWeight("bold").setBackground("#FFCDD2");
  sheet.getRange("K22").setBackground("#FFCDD2");
  sheet.getRange("J23").setValue("Read");
  sheet.getRange("J24").setValue("Write");
  sheet.getRange("J25").setValue("Clock");
  sheet.getRange("J26").setValue("IO");

   inicializarPanelBuffers(sheet);
  if (typeof inicializarPanelPalabraControl === "function") inicializarPanelPalabraControl(sheet);
  if (typeof inicializarHojaMicrocodigo === "function") inicializarHojaMicrocodigo();
}

function resetearBuses(sheet) {
  liberarBus(busInterno);
  liberarBus(busDir);
  liberarBus(busDatos);
  setControl(sheet, { rd: 0, wr: 0, io: 0 });
  sheet.getRange(BUS_CTRL_CLK).setValue(0);
  mostrarBuses(sheet);
  resetearBuffers(sheet);
}

// Prueba de aceptación: fuerza En_PC=1 y En_AX=1 en el bus interno.
// En el editor de Apps Script, elige probarContencion y dale Run.
function probarContencion() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  inicializarPanelBuffers(sheet);
  limpiarSenalesBuffers();
  marcarEnable("PC", sheet.getRange(REG_PC).getValue(), "interno");
  marcarEnable("AX", sheet.getRange(REG_AX).getValue(), "interno");
  pintarBuffers(sheet);
  var conflicto = detectarContencion("interno");
  if (conflicto) errorContencion(sheet, "interno", conflicto);
}