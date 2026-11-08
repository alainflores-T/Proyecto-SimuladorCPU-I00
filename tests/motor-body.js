function check(name, cond, detail) {
  results.push({ name: name, ok: !!cond, detail: detail || "" });
  console.log((cond ? "PASS" : "FAIL") + " | " + name + (detail ? " | " + detail : ""));
}

var informe = prepararSimulador();
check("prepararSimulador sin fallos", informe.every(function (linea) { return linea.indexOf(": ok") !== -1; }), informe.join(" || "));
hoja().getRange(REG_PC).setValue("00H");
hoja().getRange(CPU_STATE).setValue("READY");
var sinCarga = uiComenzarEjecucion();
check("RUN sin LOAD no arranca", sinCarga.ok === false && String(sinCarga.reason).indexOf("LOAD") !== -1, sinCarga.reason);
var pasosVacios = 0;
while (pasosVacios < 40 && String(hoja().getRange(CPU_STATE).getValue()) !== "HALT") {
  stepCPU();
  pasosVacios++;
}
check("celdas vacías no llevan el PC a 62H", String(hoja().getRange(CPU_STATE).getValue()) === "HALT" && String(hoja().getRange(REG_PC).getValue()) !== "62H", "estado=" + hoja().getRange(CPU_STATE).getValue() + " pc=" + hoja().getRange(REG_PC).getValue() + " pasos=" + pasosVacios);
var diag = diagnosticarSimulador();
check("diagnóstico sin programa no pide otro clic", String(diag).indexOf("no hay programa virtual cargado") !== -1 && String(diag).indexOf("Cola ") !== -1, diag);
var rechazoMarco = false;
try { mapearPagina(0, 7); } catch (ePin) { rechazoMarco = String(ePin.message).indexOf("reservado") !== -1; }
check("el marco 7 rechaza una página", rechazoMarco);
catalogInitialize();
var directory = book.getSheetByName("Directory");
check("catálogo inicializado", !!directory && directory.getRange("B1").getValue() !== "", String(directory && directory.getRange("B1").getValue()));

var progDir = path.join(root, "programs");
["arithmetic-ax-dx.asm", "keyboard-lcd-echo.asm", "scattered-access.asm"].forEach(function (file) {
  var text = fs.readFileSync(path.join(progDir, file), "utf8");
  var asm = assemble(text);
  var rt = roundTripTest(text);
  var entries = text.replace(/\r/g, "").split("\n").map(editorLineFromSource);
  var ed = editorCheckProgram(entries);
  check("assemble " + file, asm.ok, (asm.errors || []).join("; "));
  check("roundTrip " + file, rt.ok, rt.ok ? "" : JSON.stringify(rt.mismatches).slice(0, 240));
  check("editor " + file, ed.ok, (ed.errors || []).join(" | "));
});
var cat = catalogBuiltinPrograms();
cat.forEach(function (p) {
  var disk = fs.readFileSync(path.join(progDir, p.file), "utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  check("catálogo = archivo " + p.file, disk === p.lines.join("\n").trim());
});

function hoja() { return book.getSheetByName("Hoja 1"); }
function reg(nombre) { return String(hoja().getRange(REGISTROS_GENERALES[nombre]).getValue()); }
function presentes() {
  var n = 0;
  var i;
  for (i = 0; i < 16; i++) if (String(book.getSheetByName("TablaPaginas").getRange(3 + i, 2).getValue()) === "1") n++;
  return n;
}
function correrHastaHalt(maxLotes) {
  var inicio = uiComenzarEjecucion();
  if (!inicio.ok) return inicio;
  var lotes = 0;
  var ultimo = inicio;
  while (lotes < maxLotes) {
    ultimo = uiLoteRun(inicio.token);
    lotes++;
    if (!ultimo.ok || !ultimo.continuar) break;
  }
  return ultimo;
}
function cargar(nombre) {
  directory.getRange("B1").setValue(nombre);
  alerts.length = 0;
  var r = loadSelectedProgram();
  return r;
}

// Contención: el destino no cambia y luego se recupera.
hoja().getRange(REG_MDR).setValue("11H");
limpiarSenalesBuffers();
marcarEnable("RAM", "11H", "datos");
var lanzo = false;
var msg = "";
try {
  transfer(busDatos, { name: "KBD", value: "22H" }, ["MDR"], hoja());
} catch (e) {
  lanzo = true;
  msg = e.message;
}
check("contención lanza antes de escribir MDR", lanzo && String(hoja().getRange(REG_MDR).getValue()) === "11H", msg + " mdr=" + hoja().getRange(REG_MDR).getValue());
var rec = recuperarContencion(hoja());
check("recuperación deja READY y no toca MDR", rec.ok && String(hoja().getRange(CPU_STATE).getValue()) === "READY" && String(hoja().getRange(REG_MDR).getValue()) === "11H");
check("bus de datos queda en ZZ", String(hoja().getRange(BUS_EXT_DATA).getValue()) === "ZZ", String(hoja().getRange(BUS_EXT_DATA).getValue()));

// Programa 1 por el cargador y el ciclo reales.
var c1 = cargar("Arithmetic AX..DX");
check("LOAD aritmética", c1 && c1.ok, JSON.stringify(c1) + " " + alerts.join(" | "));
check("FIFO visible al cargar", politicaGuardada_() === "FIFO", String(politicaGuardada_()));
var antes = (leerContadoresCache().eventos || []).length;
var f2 = cpuApplyVirtualFetch2(hoja());
var mid = (leerContadoresCache().eventos || []).length;
var f3 = cpuApplyVirtualFetch3(hoja());
var fin = (leerContadoresCache().eventos || []).length;
check("FETCH_2 lee y FETCH_3 no repite la caché", f2 && f2.ok && f3 && f3.ok && fin === mid && mid > antes, "antes=" + antes + " mid=" + mid + " fin=" + fin);
reiniciarCpu();
var ramMuestra = readPhysical(0);
var fin1 = correrHastaHalt(80);
check("aritmética llega a HALT", String(hoja().getRange(CPU_STATE).getValue()) === "HALT", JSON.stringify(fin1));
check("aritmética AX BX CX DX ZF", reg("AX") === "0CH" && reg("BX") === "04H" && reg("CX") === "00H" && reg("DX") === "04H" && hoja().getRange(FLAG_ZF).getValue() == 1,
  JSON.stringify({ AX: reg("AX"), BX: reg("BX"), CX: reg("CX"), DX: reg("DX"), ZF: hoja().getRange(FLAG_ZF).getValue() }));
var cache1 = leerContadoresCache();
check("aritmética tuvo miss y luego hit", cache1.l1i.misses >= 1 && cache1.l1i.hits >= 1, JSON.stringify(cache1.l1i));
check("RESET conserva la RAM y pone AX en 00H", (function () {
  var antesRam = readPhysical(0);
  reiniciarCpu();
  return reg("AX") === "00H" && String(hoja().getRange(CPU_STATE).getValue()) === "READY" && String(readPhysical(0)) === String(antesRam);
})(), "ax=" + reg("AX") + " ram0=" + readPhysical(0));

// CLEAR conserva el swap y deja las páginas ausentes.
var swap0 = readSwap(0)[0];
limpiarMaquina();
check("CLEAR vacía presencia y conserva el primer byte del swap", presentes() === 0 && String(readSwap(0)[0]) === String(swap0) && readPhysical(0) === "",
  "presentes=" + presentes() + " swap0=" + readSwap(0)[0] + " ram0=" + JSON.stringify(readPhysical(0)));

// Eco con la VM encendida y la cola en la RAM dedicada.
var c2 = cargar("Keyboard to LCD");
check("LOAD eco", c2 && c2.ok, JSON.stringify(c2) + " " + alerts.join(" | "));
check("memoria virtual activa junto con E/S", memoriaVirtualActiva() && ioCanUseRam().ok, ioCanUseRam().reason || "");
var i;
for (i = 0; i < 8; i++) {
  var enq = kbdEnqueueByte(65 + i);
  if (!enq.ok) check("encolar " + i, false, enq.reason);
}
check("la cola está en readPhysical F0H", (function () {
  var q = esRamLeerRegion(POLITICA_ES.teclado);
  return q.ok && q.bytes[0] === 65 && readPhysical(0xF0) === 65 && readPhysical(0xE0) !== 65;
})(), "F0=" + readPhysical(0xF0) + " E0=" + readPhysical(0xE0));
var fin2 = correrHastaHalt(120);
check("eco llega a HALT", String(hoja().getRange(CPU_STATE).getValue()) === "HALT", JSON.stringify(fin2));
var lcd = esRamLeerRegion(POLITICA_ES.lcd);
check("LCD muestra ABCDEFGH en F8H", lcd.ok && lcd.bytes.join(",") === "65,66,67,68,69,70,71,72" && readPhysical(0xF8) === 65, lcd.ok ? lcd.bytes.join(",") : lcd.reason);
check("256 B, 8 marcos físicos, 7 elegibles", POLITICA_ES.ramFisica === 256 && POLITICA_ES.marcosFisicos === 8 && POLITICA_ES.marcosElegibles === 7 && POLITICA_ES.marcoReservado === 7 && RESERVA_ES.teclado.inicio === 0xF0);

// Programa disperso: fallos, reemplazo y misses por el ciclo real.
limpiarMaquina();
var marca = kbdEnqueueByte(0xAB);
var c3 = cargar("Scattered accesses");
check("LOAD no borra la cola", marca.ok && c3 && c3.ok && readPhysical(0xF0) === 0xAB, "F0=" + readPhysical(0xF0));
check("LOAD disperso", c3 && c3.ok, JSON.stringify(c3) + " " + alerts.join(" | "));
var fin3 = correrHastaHalt(160);
check("disperso llega a HALT", String(hoja().getRange(CPU_STATE).getValue()) === "HALT", JSON.stringify(fin3));
check("disperso registros", reg("AX") === "03H" && reg("BX") === "02H" && reg("CX") === "03H" && reg("DX") === "04H",
  JSON.stringify({ AX: reg("AX"), BX: reg("BX"), CX: reg("CX"), DX: reg("DX") }));
function pfnUsados() {
  var lista = [];
  var i;
  for (i = 0; i < 16; i++) {
    if (String(book.getSheetByName("TablaPaginas").getRange(3 + i, 2).getValue()) === "1") {
      lista.push(String(book.getSheetByName("TablaPaginas").getRange(3 + i, 3).getValue()));
    }
  }
  return lista;
}
check("hay 7 páginas y ninguna en el marco 7", presentes() === 7 && pfnUsados().indexOf("7") === -1, "presentes=" + presentes() + " pfn=" + pfnUsados().join(","));
var vista = book.getSheetByName("Vista");
var snapVista = uiSnapshot();
check("la hoja Vista refleja AX", vista && String(vista.getRange(5, 2).getValue()) === reg("AX") && snapVista.ax === reg("AX"), String(vista && vista.getRange(5, 2).getValue()));
var cache3 = leerContadoresCache();
check("disperso acumula misses de datos", cache3.l1d.misses >= 1 && cache3.l2.misses >= 1, JSON.stringify({ l1d: cache3.l1d, l2: cache3.l2 }));
var logText = "";
var log = book.getSheetByName("LOG");
if (log) {
  var last = log.getLastRow();
  var vals = last ? log.getRange(1, 3, last, 1).getValues() : [];
  logText = vals.map(function (row) { return String(row[0]); }).join("\n");
}
check("el log registró page faults", logText.indexOf("PAGE FAULT") !== -1, logText.split("\n").filter(function (l) { return l.indexOf("PAGE FAULT") !== -1; }).slice(0, 4).join(" || "));
var sucia = false;
for (i = 0; i < 16; i++) if (String(book.getSheetByName("TablaPaginas").getRange(3 + i, 4).getValue()) === "1") sucia = true;
check("alguna página residente queda dirty", sucia);
var extras = ["020H", "080H", "0C0H", "100H", "140H", "180H", "1A0H"];
var ei;
var extraErr = "";
for (ei = 0; ei < extras.length; ei++) {
  hoja().getRange(REG_MAR).setValue(extras[ei]);
  try { leerMemoriaIntegrada(hoja(), "dato"); }
  catch (eExtra) { extraErr = eExtra.message; break; }
}
var log2 = "";
if (log) {
  var last2 = log.getLastRow();
  log2 = log.getRange(1, 3, last2, 1).getValues().map(function (row) { return String(row[0]); }).join("\n");
}
check("un desalojo sucio hace write-back de 32 bytes", log2.indexOf("write-back") !== -1, (extraErr ? extraErr + " || " : "") + log2.split("\n").filter(function (l) { return l.indexOf("write-back") !== -1 || l.indexOf("PAGE FAULT") !== -1; }).slice(-3).join(" || "));
check("tras más fallos siguen 7 páginas presentes", presentes() === 7, "presentes=" + presentes());

// Fronteras de traducción: 0 y 511 caben; 512 no.
var t0 = describirDireccionMMU_ = null;
var presente = null;
var pi;
for (pi = 0; pi < 16; pi++) {
  if (String(book.getSheetByName("TablaPaginas").getRange(3 + pi, 2).getValue()) === "1") { presente = pi; break; }
}
try {
  var borde = translate(presente * 32);
  check("una página presente traduce fuera del marco 7", borde && borde.pfn !== 7 && borde.fisica < 0xE0, JSON.stringify(borde));
} catch (e0) {
  check("una página presente traduce fuera del marco 7", false, e0.message);
}
var rechaza512 = false;
try { translate(512); } catch (e512) { rechaza512 = String(e512.message).indexOf("0..511") !== -1; }
check("dirección 512 rechazada", rechaza512);

// Un segundo RUN con token vigente no arranca otro ciclo.
var primero = uiComenzarEjecucion();
var segundo = uiComenzarEjecucion();
check("doble RUN rechazado", primero.ok && segundo.ok === false, segundo.reason);
uiPause();
var lotePausa = uiLoteRun(primero.token);
check("PAUSE corta el lote sin micro-pasos", lotePausa.ok && lotePausa.pausa && lotePausa.pasos === 0, JSON.stringify(lotePausa));

// Snapshot coherente con las celdas.
var snap = uiSnapshot();
check("snapshot refleja AX y el estado", snap.ax === reg("AX") && snap.estado === String(hoja().getRange(CPU_STATE).getValue()), JSON.stringify({ ax: snap.ax, estado: snap.estado }));
check("snapshot de buses no inventa un conductor si está en ZZ", !(snap.buses.datos === "ZZ" && snap.buses.conductorDatos && snap.buses.conductorDatos !== "—" && snap.buses.conductorDatos !== ""), JSON.stringify(snap.buses));

// HEX de la palabra, incluido IN/OUT, sale del encoder.
var filas = filasTablaMicrocodigo();
function fila(nombre) {
  var i;
  for (i = 0; i < filas.length; i++) if (filas[i][0] === nombre) return filas[i][3];
  return "";
}
check("HEX MOV reg", fila("MOV (reg)") === "004800H", fila("MOV (reg)"));
check("HEX IN", fila("IN") === hexDeLista(["IO", "En_KBD", "Ld_AX"]));
check("HEX OUT", fila("OUT") === hexDeLista(["IO", "Mem_W", "En_AX", "Ld_LCD"]));
check("la tabla tiene IN y OUT", fila("IN") !== "" && fila("OUT") !== "");

kbdReset();
var sepA = kbdEnqueueByte("A".charCodeAt(0));
var sepB = kbdEnqueueByte("B".charCodeAt(0));
var sepC = kbdEnqueueByte("C".charCodeAt(0));
var vistaCola = uiSnapshot();
check("tres letras en llamadas separadas salen en F0H y en el snapshot",
  sepA.ok && sepB.ok && sepC.ok && sepC.meta.count === 3 && readPhysical(0xF0) === 65 && readPhysical(0xF1) === 66 && vistaCola.teclado[0] === 65 && vistaCola.teclado[2] === 67,
  JSON.stringify(vistaCola.teclado));
var claro = limpiarMaquina();
var diagCola = diagnosticarSimulador();
check("CLEAR termina e informa que la cola sigue",
  claro.ok === true && String(claro.mensaje).indexOf("CLEAR terminó") !== -1 && String(claro.mensaje).indexOf("3/8") !== -1 && claro.snapshot.teclado[0] === 65,
  claro.mensaje);
check("CLEAR no borra F0H ni el contador", readPhysical(0xF0) === 65 && kbdReadMeta().count === 3);
check("el diagnóstico muestra la ocupación de la cola", String(diagCola).indexOf("Cola 3/8") !== -1 && String(diagCola).indexOf("65") !== -1, diagCola);
var trasClear = kbdEnqueueByte("D".charCodeAt(0));
check("después de CLEAR se puede encolar la siguiente letra", trasClear.ok && trasClear.meta.count === 4 && readPhysical(0xF3) === 68, trasClear.reason || "");
var nCola;
for (nCola = 0; nCola < 5; nCola++) kbdEnqueueByte("Z".charCodeAt(0));
var novena = kbdEnqueueByte("A".charCodeAt(0));
check("la novena avisa cola llena y no cambia F0H", novena.ok === false && String(novena.reason).indexOf("llena") !== -1 && readPhysical(0xF0) === 65, novena.reason);
var z;
for (z = 0; z < 8; z++) writePhysical(0xF0 + z, 0);
var trasCeldas = kbdEnqueueByte("A".charCodeAt(0));
check("poner F0H en cero a mano no reinicia el contador", trasCeldas.ok === false && kbdReadMeta().count === 8 && readPhysical(0xF0) === 0, "count=" + kbdReadMeta().count);
var oficial = kbdReset();
check("Vaciar cola sincroniza RAM y contador", oficial.ok && kbdReadMeta().count === 0 && readPhysical(0xF0) === 0 && readPhysical(0xF7) === 0);
var cargaEco = cargar("Keyboard to LCD");
var unaA = panelEnviarTecla("A");
check("tras vaciar y LOAD entra una A y el snapshot la muestra",
  cargaEco.ok && unaA.ok && unaA.meta.count === 1 && readPhysical(0xF0) === 65 && unaA.snapshot.teclado[0] === 65 && String(unaA.mensaje).indexOf("1/8") !== -1,
  unaA.mensaje);
reiniciarCpu();
var finUna = correrHastaHalt(120);
var lcdUna = esRamLeerRegion(POLITICA_ES.lcd);
check("el eco con una A escribe 65 en F8H y ceros después",
  String(hoja().getRange(CPU_STATE).getValue()) === "HALT" && lcdUna.ok && lcdUna.bytes[0] === 65 && lcdUna.bytes[1] === 0 && readPhysical(0xF8) === 65,
  JSON.stringify(lcdUna.bytes) + " fin=" + (finUna && finUna.estado));
check("siguen 256 B y el marco 7 no recibe páginas", POLITICA_ES.ramFisica === 256 && presentes() <= 7 && pfnUsados().indexOf("7") === -1, "presentes=" + presentes());
