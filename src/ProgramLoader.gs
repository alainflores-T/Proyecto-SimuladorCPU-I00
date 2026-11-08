/**
 * ProgramLoader.gs — Load catalog programs as machine bytes.
 * Does not replace src/loader.gs or define onOpen.
 * Does not change RESERVA_ES. Refuses the personal physical-I/O opt-in.
 * Instruction boundaries store lengths only; live bytes are authoritative.
 */
var LOADER_PAGE_BYTES = 32;
var LOADER_SPACE_BYTES = 512;
var LOADER_PAGE_COUNT = 16;

function loaderPagesFromImage(image) {
  var pages = {};
  var addr;
  for (addr in image) {
    if (!Object.prototype.hasOwnProperty.call(image, addr)) continue;
    var n = parseInt(addr, 10);
    if (isNaN(n) || n < 0 || n >= LOADER_SPACE_BYTES) continue;
    var vpn = Math.floor(n / LOADER_PAGE_BYTES);
    var offset = n % LOADER_PAGE_BYTES;
    if (!pages[vpn]) {
      pages[vpn] = [];
      var i;
      for (i = 0; i < LOADER_PAGE_BYTES; i++) pages[vpn][i] = 0;
    }
    pages[vpn][offset] = image[addr] & 0xFF;
  }
  return pages;
}

function loaderRejectReason(result) {
  if (!result || result.ok !== true) {
    var errors = result && result.errors ? result.errors.join("\n") : "Assembly failed.";
    return "Load rejected. The program has errors.\n" + errors;
  }
  if (result.size > LOADER_SPACE_BYTES) {
    return "Load rejected. The program is " + result.size + " bytes and the virtual space is 512.";
  }
  return "";
}

function loaderBlankPage() {
  var page = [];
  var i;
  for (i = 0; i < LOADER_PAGE_BYTES; i++) page.push(0);
  return page;
}

function loaderWritePlan(pages) {
  var plan = [];
  var vpn;
  for (vpn = 0; vpn < LOADER_PAGE_COUNT; vpn++) {
    plan.push({ vpn: vpn, bytes: loaderBlankPage() });
  }
  var keys = [];
  for (vpn in pages) {
    if (Object.prototype.hasOwnProperty.call(pages, vpn)) keys.push(Number(vpn));
  }
  keys.sort(function (a, b) { return a - b; });
  var i;
  for (i = 0; i < keys.length; i++) {
    plan.push({ vpn: keys[i], bytes: pages[keys[i]] });
  }
  return plan;
}

function loaderBuild(sourceText) {
  var assembled = assemble(sourceText);
  var reason = loaderRejectReason(assembled);
  if (reason) return { ok: false, reason: reason };
  var pages = loaderPagesFromImage(assembled.image);
  return {
    ok: true,
    pages: pages,
    plan: loaderWritePlan(pages),
    boundaries: loaderBoundariesFromListing(assembled.listing)
  };
}

function loaderIoOptInOn() {
  if (typeof POLITICA_ES !== "undefined" && POLITICA_ES && POLITICA_ES.nombre === "ram-dedicada-16") return false;
  if (typeof ioOptInOn === "function") return ioOptInOn();
  if (typeof PropertiesService === "undefined") return false;
  var key = typeof IO_OPT_IN_KEY !== "undefined" ? IO_OPT_IN_KEY : "IO_OPT_IN";
  return PropertiesService.getDocumentProperties().getProperty(key) === "physical-test";
}

function loaderLog(message) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(typeof SHEET_NAME !== "undefined" ? SHEET_NAME : "Hoja 1") || ss.getActiveSheet();
  if (typeof registrarLog === "function") registrarLog(sheet, message);
  return sheet;
}

function loadSelectedProgram() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var directory = ss.getSheetByName(CATALOG_SHEET);
  var sources = ss.getSheetByName(CATALOG_SOURCE_SHEET);
  if (!directory || !sources || typeof catalogReadPrograms !== "function") {
    SpreadsheetApp.getUi().alert("Run catalogInitialize first.");
    return { ok: false, reason: "catalog" };
  }
  if (loaderIoOptInOn()) {
    var blockedIo = "Load refused. The personal I/O opt-in is on. Turn it off first. This load enables virtual memory and can overwrite F0H-FFH. RESERVA_ES was not changed.";
    loaderLog(blockedIo);
    SpreadsheetApp.getUi().alert(blockedIo);
    return { ok: false, reason: "io-opt-in" };
  }
  var name = directory.getRange(CATALOG_SELECTOR).getValue();
  var program = catalogFindProgram(catalogReadPrograms(sources), name);
  if (!program) {
    SpreadsheetApp.getUi().alert("Select a program in Directory!B1.");
    return { ok: false, reason: "selection" };
  }
  var built = loaderBuild(program.lines.join("\n"));
  if (!built.ok) {
    loaderLog(built.reason);
    SpreadsheetApp.getUi().alert(built.reason);
    return { ok: false, reason: built.reason, program: program.name };
  }
  if (typeof vmWriteSwapPage !== "function" || typeof cpuSaveBoundaries !== "function") {
    var missing = "Load stopped. vmWriteSwapPage or the boundary helper is missing. RAM, Swap and the boundary map were not changed.";
    loaderLog(missing);
    SpreadsheetApp.getUi().alert(missing);
    return { ok: false, reason: "swap" };
  }
  cpuClearBoundaries();
  var step;
  try {
    for (step = 0; step < built.plan.length; step++) {
      vmWriteSwapPage(built.plan[step].vpn, built.plan[step].bytes);
    }
  } catch (err) {
    cpuClearBoundaries();
    var failed = "Load failed before READY. " + (err && err.message ? err.message : err);
    loaderLog(failed);
    SpreadsheetApp.getUi().alert(failed);
    return { ok: false, reason: failed, program: program.name };
  }
  cpuSaveBoundaries(built.boundaries);
  if (typeof esRamInstalar === "function") {
    try { esRamInstalar(); } catch (esErr) { loaderLog("E/S dedicada no instalada: " + esErr.message); }
  }
  if (typeof asegurarPoliticaDemostracion === "function") {
    try { asegurarPoliticaDemostracion("FIFO"); }
    catch (polErr) { loaderLog("Política de reemplazo no quedó visible: " + polErr.message); }
  }
  if (typeof RAMFisica !== "undefined" && RAMFisica.vaciar) RAMFisica.vaciar();
  if (typeof resetCaches === "function") {
    try { resetCaches(); }
    catch (cacheErr) { loaderLog("Caches were not cleared: " + cacheErr.message); }
  }
  if (typeof resetContadoresCache === "function") {
    try { resetContadoresCache(); }
    catch (countErr) { loaderLog("Cache counters were not cleared: " + countErr.message); }
  }
  var listed = [];
  var vpn;
  for (vpn in built.pages) {
    if (Object.prototype.hasOwnProperty.call(built.pages, vpn)) listed.push(Number(vpn));
  }
  listed.sort(function (a, b) { return a - b; });
  var sheet = loaderLog("Loaded " + program.name + " (VPN " + listed.join(", ") + "). Swap holds machine bytes, RAM frames are clear, pages are absent, FIFO is selected. Keyboard and LCD use the dedicated 16-byte I/O RAM, outside the 8 frames.");
  var pc = sheet.getRange(REG_PC);
  if (pc.setNumberFormat) pc.setNumberFormat("@");
  pc.setValue("00H");
  sheet.getRange(CPU_STATE).setValue("READY");
  return { ok: true, program: program.name, vpns: listed };
}

function loaderInstallMenu() {
  SpreadsheetApp.getUi().createMenu("Loader")
    .addItem("Load selected program", "loadSelectedProgram")
    .addToUi();
}