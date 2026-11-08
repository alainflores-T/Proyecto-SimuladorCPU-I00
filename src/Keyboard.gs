/**
 * Keyboard.gs — RAM-backed keyboard queue for issue #33.
 * Personal-copy physical tests only. Does not reserve a paging frame.
 * Do not run the loader or enable virtual memory after opting in.
 * RESERVA_ES remains unchanged. Enter is ASCII 0x0D.
 */
var KBD_META_KEY = "KBD_META";
var IO_OPT_IN_KEY = "IO_OPT_IN";

function ioPersonalMap() {
  return {
    keyboard: { start: 0xF0, bytes: 8 },
    lcd: { start: 0xF8, bytes: 8 },
    acceptNonPageableFrame: true
  };
}

function ioMapForValidator(map) {
  return {
    teclado: { inicio: map.keyboard.start, bytes: map.keyboard.bytes },
    lcd: { inicio: map.lcd.start, bytes: map.lcd.bytes },
    aceptarMarcoNoPaginable: map.acceptNonPageableFrame === true
  };
}

function ioValidatePersonalMap(map) {
  map = map || ioPersonalMap();
  if (!map.keyboard || !map.lcd) return { ok: false, reason: "ioPersonalMap needs keyboard and lcd." };
  if (map.keyboard.bytes !== 8 || map.lcd.bytes !== 8) return { ok: false, reason: "Each region must be exactly 8 bytes." };
  if (typeof validarReservaES !== "function") return { ok: false, reason: "validarReservaES is missing." };
  var judgment = validarReservaES(ioMapForValidator(map));
  if (judgment.estado !== "aceptada") return { ok: false, reason: judgment.motivo || "Map rejected.", judgment: judgment };
  return { ok: true, map: map, judgment: judgment };
}

function ioOptInOn() {
  if (typeof PropertiesService === "undefined") return false;
  return PropertiesService.getDocumentProperties().getProperty(IO_OPT_IN_KEY) === "physical-test";
}

function ioFrameFree(frame) {
  if (typeof MarcosRAM === "undefined" || !MarcosRAM || !MarcosRAM.leer) {
    return { ok: false, reason: "MarcosRAM is not loaded. Run prepararMarcosRAM on this copy first." };
  }
  var vpn;
  try {
    vpn = MarcosRAM.leer(frame, "vpn");
  } catch (err) {
    return { ok: false, reason: "Frame " + frame + " ownership is unknown (" + (err && err.message ? err.message : err) + "). No I/O access." };
  }
  if (vpn !== null && vpn !== undefined) {
    return { ok: false, reason: "Frame " + frame + " is assigned to VPN " + vpn + ". No I/O access." };
  }
  return { ok: true };
}

function esPoliticaDedicada_() {
  return typeof POLITICA_ES !== "undefined" && POLITICA_ES && POLITICA_ES.nombre === "ventana-marco-7";
}

/** Both reads and writes require the physical-test guard, salvo la RAM dedicada. */
function ioCanUseRam() {
  if (esPoliticaDedicada_()) {
    if (typeof esRamLista !== "function" || !esRamLista()) {
      return { ok: false, reason: "La RAM de E/S dedicada no está instalada. Ejecute prepararSimulador. No se tocó ningún marco." };
    }
    return {
      ok: true,
      map: {
        keyboard: { start: POLITICA_ES.teclado.inicio, bytes: POLITICA_ES.teclado.bytes },
        lcd: { start: POLITICA_ES.lcd.inicio, bytes: POLITICA_ES.lcd.bytes },
        dedicada: true
      },
      frames: []
    };
  }
  var checked = ioValidatePersonalMap();
  if (!checked.ok) return checked;
  if (!ioOptInOn()) return { ok: false, reason: "Personal I/O opt-in is off. Shared RESERVA_ES is still null. No RAM access." };
  if (typeof memoriaVirtualActiva === "function" && memoriaVirtualActiva()) {
    return { ok: false, reason: "Virtual memory is on. Frame ownership can change. No I/O access." };
  }
  if (typeof programaVirtualCargado === "function" && programaVirtualCargado()) {
    return { ok: false, reason: "A virtual program is loaded. No I/O access." };
  }
  var frames = checked.judgment.marcos || [];
  for (var i = 0; i < frames.length; i++) {
    var free = ioFrameFree(frames[i]);
    if (!free.ok) return free;
  }
  return { ok: true, map: checked.map, frames: frames };
}

function ioParseStoredByte(value) {
  if (value === "" || value == null) return 0;
  if (typeof value === "number") {
    if (value !== value || Math.floor(value) !== value || value < 0 || value > 255) return null;
    return value;
  }
  var text = String(value).trim();
  if (text === "") return 0;
  if (/^[0-9A-Fa-f]{1,2}H$/i.test(text)) {
    var hex = parseInt(text.slice(0, -1), 16);
    return hex <= 255 ? hex : null;
  }
  if (/^[0-9]{1,3}$/.test(text)) {
    var dec = parseInt(text, 10);
    return dec <= 255 ? dec : null;
  }
  return null;
}

function ioReadBytes(region) {
  var gate = ioCanUseRam();
  if (!gate.ok) return gate;
  if (gate.map && gate.map.dedicada && typeof esRamLeerRegion === "function") return esRamLeerRegion(region);
  if (typeof readPhysical !== "function") return { ok: false, reason: "readPhysical is missing." };
  var bytes = [];
  for (var i = 0; i < region.bytes; i++) {
    var parsed = ioParseStoredByte(readPhysical(region.start + i));
    if (parsed === null) return { ok: false, reason: "RAM at " + (region.start + i) + " is not one byte. No I/O state was changed." };
    bytes.push(parsed);
  }
  return { ok: true, bytes: bytes };
}

function ioWriteBytes(region, bytes) {
  var gate = ioCanUseRam();
  if (!gate.ok) return gate;
  if (gate.map && gate.map.dedicada && typeof esRamEscribirRegion === "function") return esRamEscribirRegion(region, bytes);
  if (!bytes || bytes.length !== region.bytes) return { ok: false, reason: "Expected " + region.bytes + " bytes." };
  if (typeof writePhysical !== "function") return { ok: false, reason: "writePhysical is missing." };
  var previous = ioReadBytes(region);
  if (!previous.ok) return previous;
  var i;
  try {
    for (i = 0; i < region.bytes; i++) writePhysical(region.start + i, bytes[i] & 0xFF);
  } catch (err) {
    for (var j = 0; j < i; j++) {
      try { writePhysical(region.start + j, previous.bytes[j]); } catch (ignore) {}
    }
    return { ok: false, reason: String(err && err.message ? err.message : err) };
  }
  return { ok: true };
}

function ioRegionEmpty(region) {
  var read = ioReadBytes(region);
  if (!read.ok) return read;
  for (var i = 0; i < read.bytes.length; i++) {
    if (read.bytes[i] !== 0) return { ok: false, reason: "Address " + (region.start + i) + " is not zero." };
  }
  return { ok: true };
}

function ioEnablePersonalOptIn() {
  var checked = ioValidatePersonalMap();
  if (!checked.ok) {
    SpreadsheetApp.getUi().alert(checked.reason);
    return checked;
  }
  var gatePreview = { ok: true };
  if (typeof memoriaVirtualActiva === "function" && memoriaVirtualActiva()) {
    gatePreview = { ok: false, reason: "Virtual memory is on." };
  } else if (typeof programaVirtualCargado === "function" && programaVirtualCargado()) {
    gatePreview = { ok: false, reason: "A virtual program is loaded." };
  }
  if (!gatePreview.ok) {
    SpreadsheetApp.getUi().alert(gatePreview.reason + " Opt-in was not enabled.");
    return gatePreview;
  }
  var frames = checked.judgment.marcos || [];
  for (var f = 0; f < frames.length; f++) {
    var free = ioFrameFree(frames[f]);
    if (!free.ok) {
      SpreadsheetApp.getUi().alert(free.reason);
      return free;
    }
  }
  PropertiesService.getDocumentProperties().setProperty(IO_OPT_IN_KEY, "physical-test");
  var keyboardEmpty = ioRegionEmpty(checked.map.keyboard);
  var lcdEmpty = ioRegionEmpty(checked.map.lcd);
  if (!keyboardEmpty.ok || !lcdEmpty.ok) {
    PropertiesService.getDocumentProperties().deleteProperty(IO_OPT_IN_KEY);
    var why = !keyboardEmpty.ok ? keyboardEmpty.reason : lcdEmpty.reason;
    SpreadsheetApp.getUi().alert("Opt-in cancelled. " + why + " I/O regions must be unused zeros on this copy. Do not run the loader after enabling.");
    return { ok: false, reason: why };
  }
  SpreadsheetApp.getUi().alert("Physical-only opt-in is on. Shared RESERVA_ES is still null, so the pager still has 8 frames. Do not turn virtual memory on and do not run the loader. Keyboard " + checked.map.keyboard.start + ", LCD " + checked.map.lcd.start + ".");
  return { ok: true, map: checked.map };
}

function ioDisablePersonalOptIn() {
  if (typeof PropertiesService !== "undefined") PropertiesService.getDocumentProperties().deleteProperty(IO_OPT_IN_KEY);
  SpreadsheetApp.getUi().alert("Personal opt-in removed. RAM bytes were not modified.");
}

function kbdHex(n) {
  var hex = (n & 0xFF).toString(16).toUpperCase();
  return (hex.length < 2 ? "0" : "") + hex + "H";
}

function kbdText(n) {
  if (n === 0x0D) return "ENTER";
  if (n >= 32 && n <= 126) return String.fromCharCode(n);
  return ".";
}

function kbdKeyCode(text) {
  var raw = String(text == null ? "" : text);
  if (raw === "") return { ok: false, reason: "Type one character, or ENTER." };
  if (raw.toUpperCase() === "ENTER") return { ok: true, byte: 0x0D };
  if (raw.length !== 1) return { ok: false, reason: "One character only. Use Send Enter for 0x0D." };
  var code = raw.charCodeAt(0);
  if (code < 0 || code > 255) return { ok: false, reason: "Character is outside one byte." };
  return { ok: true, byte: code };
}

function kbdReadMeta() {
  var meta = { head: 0, tail: 0, count: 0 };
  if (typeof PropertiesService === "undefined") return meta;
  var raw = PropertiesService.getDocumentProperties().getProperty(KBD_META_KEY);
  if (!raw) return meta;
  try {
    var parsed = JSON.parse(raw);
    if (!parsed) return meta;
    if (parsed.head >= 0 && parsed.head < 8) meta.head = parsed.head;
    if (parsed.tail >= 0 && parsed.tail < 8) meta.tail = parsed.tail;
    if (parsed.count >= 0 && parsed.count <= 8) meta.count = parsed.count;
  } catch (err) {
    return { head: 0, tail: 0, count: 0 };
  }
  return meta;
}

function kbdSaveMeta(meta) {
  if (typeof PropertiesService === "undefined") return;
  PropertiesService.getDocumentProperties().setProperty(KBD_META_KEY, JSON.stringify({ head: meta.head, tail: meta.tail, count: meta.count }));
}

function kbdSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName("Keyboard") || ss.insertSheet("Keyboard");
}

function kbdShowPanel(note) {
  var sheet = kbdSheet();
  var map = ioPersonalMap().keyboard;
  sheet.getRange("A1").setValue("Keyboard queue");
  sheet.getRange("A2").setValue("Key");
  sheet.getRange("A3").setValue("Head");
  sheet.getRange("A4").setValue("Tail");
  sheet.getRange("A5").setValue("Count");
  sheet.getRange("A11").setValue(note || "");
  var labels = [];
  var hex = [];
  var ascii = [];
  var gate = ioCanUseRam();
  var meta = kbdReadMeta();
  var bytes = null;
  if (gate.ok) {
    var read = ioReadBytes(map);
    if (read.ok) bytes = read.bytes;
    else note = read.reason;
  }
  for (var i = 0; i < map.bytes; i++) {
    labels.push(kbdHex(map.start + i));
    if (bytes) {
      hex.push(kbdHex(bytes[i]));
      ascii.push(kbdText(bytes[i]));
    } else {
      hex.push("");
      ascii.push("");
    }
  }
  if (!gate.ok) sheet.getRange("A11").setValue(gate.reason);
  else if (note) sheet.getRange("A11").setValue(note);
  sheet.getRange("B3").setValue(gate.ok ? meta.head : "");
  sheet.getRange("B4").setValue(gate.ok ? meta.tail : "");
  sheet.getRange("B5").setValue(gate.ok ? meta.count : "");
  sheet.getRange(7, 1, 1, map.bytes).setValues([labels]);
  sheet.getRange(8, 1, 1, map.bytes).setValues([hex]);
  sheet.getRange(9, 1, 1, map.bytes).setValues([ascii]);
}

function kbdEnqueueByte(byte) {
  var gate = ioCanUseRam();
  if (!gate.ok) return gate;
  if (typeof byte !== "number" || byte !== byte || Math.floor(byte) !== byte || byte < 0 || byte > 255) {
    return { ok: false, reason: "Keyboard byte must be an integer 0..255." };
  }
  var read = ioReadBytes(gate.map.keyboard);
  if (!read.ok) return read;
  var meta = kbdReadMeta();
  if (meta.count >= gate.map.keyboard.bytes) {
    return {
      ok: false,
      reason: "La cola está llena (" + meta.count + "/8) en su contador interno. Borrar F0H a mano no lo reinicia. Use Vaciar cola.",
      meta: meta
    };
  }
  var slots = read.bytes.slice();
  slots[meta.tail] = byte;
  var wrote = ioWriteBytes(gate.map.keyboard, slots);
  if (!wrote.ok) return wrote;
  var next = { head: meta.head, tail: (meta.tail + 1) % gate.map.keyboard.bytes, count: meta.count + 1 };
  kbdSaveMeta(next);
  return { ok: true, meta: next, byte: byte, mensaje: "Encolado. Ocupadas " + next.count + "/8." };
}

function kbdSendKey() {
  var sheet = kbdSheet();
  var parsed = kbdKeyCode(sheet.getRange("B2").getValue());
  if (!parsed.ok) {
    kbdShowPanel(parsed.reason);
    return parsed;
  }
  var result = kbdEnqueueByte(parsed.byte);
  kbdShowPanel(result.ok ? "Queued " + kbdHex(parsed.byte) : result.reason);
  return result;
}

function kbdSendEnter() {
  kbdSheet().getRange("B2").setValue("ENTER");
  return kbdSendKey();
}

function kbdReset() {
  var gate = ioCanUseRam();
  if (!gate.ok) {
    if (typeof SpreadsheetApp !== "undefined") kbdShowPanel(gate.reason);
    return gate;
  }
  var zeros = [];
  for (var i = 0; i < gate.map.keyboard.bytes; i++) zeros.push(0);
  var wrote = ioWriteBytes(gate.map.keyboard, zeros);
  if (!wrote.ok) return wrote;
  kbdSaveMeta({ head: 0, tail: 0, count: 0 });
  if (typeof SpreadsheetApp !== "undefined") kbdShowPanel("Queue reset.");
  return { ok: true };
}

function kbdDeliverToBus(sheet, dest) {
  var gate = ioCanUseRam();
  if (!gate.ok) {
    registrarLog(sheet, "IN blocked: " + gate.reason);
    return { ok: false, reason: gate.reason };
  }
  marcarEnable("KBD", "00H", "datos");
  var conflict = detectarContencion("datos");
  if (estadoBuffers.KBD) estadoBuffers.KBD.en = 0;
  if (conflict) {
    errorContencion(sheet, "datos", conflict);
    return { ok: false, reason: "contention" };
  }
  var read = ioReadBytes(gate.map.keyboard);
  if (!read.ok) {
    registrarLog(sheet, "IN blocked: " + read.reason);
    return read;
  }
  var meta = kbdReadMeta();
  var empty = meta.count <= 0;
  var byte = 0;
  if (!empty) {
    byte = read.bytes[meta.head];
    var slots = read.bytes.slice();
    slots[meta.head] = 0;
    var wrote = ioWriteBytes(gate.map.keyboard, slots);
    if (!wrote.ok) {
      registrarLog(sheet, "IN blocked: " + wrote.reason);
      return wrote;
    }
    kbdSaveMeta({ head: (meta.head + 1) % gate.map.keyboard.bytes, tail: meta.tail, count: meta.count - 1 });
  }
  var shown = kbdHex(byte);
  limpiarSenalesBuffers();
  setControl(sheet, { rd: 1, wr: 0, io: 1 });
  marcarEnable("KBD", shown, "datos");
  transfer(busDatos, { name: "KBD", value: shown }, [dest], sheet);
  if (typeof SpreadsheetApp !== "undefined") kbdShowPanel(empty ? "IN empty queue. 00H delivered." : "IN took " + shown);
  if (empty) registrarLog(sheet, "IN empty queue. " + dest + " = 00H. Head was not moved.");
  else registrarLog(sheet, "IN " + dest + " <- " + shown + " En_KBD=1");
  return { ok: true, byte: byte, empty: empty };
}

function kbdInstallMenu() {
  kbdShowPanel(ioCanUseRam().ok ? "Queue ready." : "Reservation off. RAM is not the queue until you enable the personal opt-in.");
  SpreadsheetApp.getUi().createMenu("Keyboard")
    .addItem("Enable physical-only opt-in", "ioEnablePersonalOptIn")
    .addItem("Disable opt-in", "ioDisablePersonalOptIn")
    .addItem("Send key", "kbdSendKey")
    .addItem("Send Enter", "kbdSendEnter")
    .addItem("Reset queue", "kbdReset")
    .addToUi();
}