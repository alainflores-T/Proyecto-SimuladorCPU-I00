/**
 * ProgramLoader.gs — Load button for issue #20.
 * Does not replace src/loader.gs (cargarDesdeHojaProgramas stays as it is).
 * Does not define onOpen.
 *
 * Swap, the frame table (P, Dirty, Ref) and page faults are not on develop yet.
 * This button checks the selected catalog program and splits it into 32-byte
 * pages, then stops before writing RAM or Swap.
 */

var LOADER_PAGE_BYTES = 32;
var LOADER_SPACE_BYTES = 512;

/**
 * image is assemble().image: address -> byte.
 * Returns { vpn: [32 bytes] } for every page that contains at least one byte.
 * VPN = floor(address / 32). Holes inside a touched page are 0.
 */
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

/** Why an assemble() result must not be loaded. Empty string means allowed. */
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

function loaderLog(message) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(typeof SHEET_NAME !== "undefined" ? SHEET_NAME : "Hoja 1") || ss.getActiveSheet();
  if (typeof registrarLog === "function") registrarLog(sheet, message);
  return sheet;
}

/** Reads Directory!B1, assembles, and splits pages. Swap writing waits for #23. */
function loadSelectedProgram() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var directory = ss.getSheetByName(CATALOG_SHEET);
  var sources = ss.getSheetByName(CATALOG_SOURCE_SHEET);
  if (!directory || !sources || typeof catalogReadPrograms !== "function") {
    SpreadsheetApp.getUi().alert("Run catalogInitialize first.");
    return { ok: false, reason: "catalog" };
  }
  var name = directory.getRange(CATALOG_SELECTOR).getValue();
  var program = catalogFindProgram(catalogReadPrograms(sources), name);
  if (!program) {
    SpreadsheetApp.getUi().alert("Select a program in Directory!B1.");
    return { ok: false, reason: "selection" };
  }
  var assembled = assemble(program.lines.join("\n"));
  var reason = loaderRejectReason(assembled);
  if (reason) {
    loaderLog(reason);
    SpreadsheetApp.getUi().alert(reason);
    return { ok: false, reason: reason, program: program.name };
  }
  var pages = loaderPagesFromImage(assembled.image);
  var vpns = [];
  var vpn;
  for (vpn in pages) if (Object.prototype.hasOwnProperty.call(pages, vpn)) vpns.push(Number(vpn));
  vpns.sort(function (a, b) { return a - b; });

  if (typeof vmWriteSwapPage !== "function") {
    var blocked = "Load stopped for " + program.name + ". " + vpns.length +
      " page(s) are ready (VPN " + vpns.join(", ") +
      ") but there is no Swap API yet (#23, #24, #25). RAM was not cleared.";
    loaderLog(blocked);
    SpreadsheetApp.getUi().alert(blocked);
    return { ok: false, blocked: "swap", program: program.name, vpns: vpns, pages: pages };
  }

  for (var p = 0; p < vpns.length; p++) vmWriteSwapPage(vpns[p], pages[vpns[p]]);
  if (typeof RAMFisica !== "undefined" && RAMFisica.vaciar) RAMFisica.vaciar();
  if (typeof vaciarColaTeclado === "function") vaciarColaTeclado();
  if (typeof limpiarLCD === "function") limpiarLCD();
  var sheet = loaderLog("Loaded " + program.name + " into Swap. " + vpns.length + " page(s).");
  sheet.getRange(REG_PC).setValue("00H");
  sheet.getRange(CPU_STATE).setValue("READY");
  return { ok: true, program: program.name, vpns: vpns };
}

/** Menu only. Do not add onOpen in this file. */
function loaderInstallMenu() {
  SpreadsheetApp.getUi().createMenu("Loader")
    .addItem("Load selected program", "loadSelectedProgram")
    .addToUi();
}