// Buses.gs - Bus interno (CPU) y buses externos (dirección, datos, control)

var busInterno = crearBus("interno");
var busDir     = crearBus("direccion");
var busDatos   = crearBus("datos");

function crearBus(nombre) {
  return {
    nombre: nombre,
    driver: null,
    value: null // null = High-Z
  };
}

function liberarBus(bus) {
  bus.driver = null;
  bus.value = null;
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
  bus.driver = source.name;
  bus.value = source.value;
  if (destinations && destinations.length) {
    for (var i = 0; i < destinations.length; i++) {
      escribirDestinoBus(sheet, destinations[i], source.value);
    }
  }
  mostrarBuses(sheet);
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
  sheet.getRange(BUS_INT_VAL).setBackground(valInt === BUS_ALTA_Z ? "#EEEEEE" : "#C8E6C9");

  var valDir = textoBus(busDir.value);
  sheet.getRange(BUS_EXT_ADDR).setValue(valDir);
  sheet.getRange(BUS_EXT_ADDR).setBackground(busDir.value === null ? "#EEEEEE" : "#CE93D8");

  var valDat = textoBus(busDatos.value);
  sheet.getRange(BUS_EXT_DATA).setValue(valDat);
  sheet.getRange(BUS_EXT_DRIVER).setValue(busDatos.driver || "—");
  sheet.getRange(BUS_EXT_DATA).setBackground(valDat === BUS_ALTA_Z ? "#EEEEEE" : "#FFE0B2");
}

function setControl(sheet, senales) {
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
  setControl(sheet, { rd: 0, wr: 0, io: 0 });
  liberarBus(busDatos);
  liberarBus(busDir);
  var fuente = (typeof origen === "string") ? leerFuente(sheet, origen) : origen;
  var valor = transfer(busInterno, fuente, destinos, sheet);
  pulsoReloj(sheet);
  return valor;
}

function transferLecturaMemoria(sheet) {
  transfer(busDir, leerFuente(sheet, "MAR"), [], sheet);
  setControl(sheet, { rd: 1, wr: 0, io: 0 });
  var ram = leerFuente(sheet, "RAM");
  var valor = transfer(busDatos, ram, ["MDR"], sheet);
  pulsoReloj(sheet);
  return valor;
}

function transferEscrituraMemoria(sheet) {
  transfer(busDir, leerFuente(sheet, "MAR"), [], sheet);
  setControl(sheet, { rd: 0, wr: 1, io: 0 });
  transfer(busDatos, leerFuente(sheet, "MDR"), ["RAM"], sheet);
  pulsoReloj(sheet);
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
}

function resetearBuses(sheet) {
  liberarBus(busInterno);
  liberarBus(busDir);
  liberarBus(busDatos);
  setControl(sheet, { rd: 0, wr: 0, io: 0 });
  sheet.getRange(BUS_CTRL_CLK).setValue(0);
  mostrarBuses(sheet);
}