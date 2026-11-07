/**
 * IoCycle.gs — IN and OUT for issue #35.
 * Requires Keyboard.gs and LCD.gs.
 * Empty input delivers 00H without moving the queue.
 * Text IR only. Does not change flags or PC.
 */
function ioAcceptIn(dest, src) {
  var register = String(dest == null ? "" : dest).trim();
  var port = String(src == null ? "" : src).trim();
  if (!/^(AX|BX|CX|DX)$/.test(register)) return { ok: false, reason: "IN destination must be AX, BX, CX or DX, without brackets." };
  if (!/^\[KBD\]$/i.test(port)) return { ok: false, reason: "IN source must be [KBD]." };
  return { ok: true, register: register };
}

function ioAcceptOut(dest, src) {
  var port = String(dest == null ? "" : dest).trim();
  var register = String(src == null ? "" : src).trim();
  if (!/^\[LCD\]$/i.test(port)) return { ok: false, reason: "OUT destination must be [LCD]." };
  if (!/^(AX|BX|CX|DX)$/.test(register)) return { ok: false, reason: "OUT source must be AX, BX, CX or DX, without brackets." };
  return { ok: true, register: register };
}

function ioExecuteIn(sheet, dest, src) {
  var form = ioAcceptIn(dest, src);
  if (!form.ok) {
    registrarLog(sheet, form.reason);
    return form;
  }
  if (typeof kbdDeliverToBus !== "function") {
    registrarLog(sheet, "IN rejected. Keyboard.gs is not loaded.");
    return { ok: false, reason: "keyboard missing" };
  }
  return kbdDeliverToBus(sheet, form.register);
}

function ioExecuteOut(sheet, dest, src) {
  var form = ioAcceptOut(dest, src);
  if (!form.ok) {
    registrarLog(sheet, form.reason);
    return form;
  }
  if (typeof lcdReceiveFromBus !== "function") {
    registrarLog(sheet, "OUT rejected. LCD.gs is not loaded.");
    return { ok: false, reason: "lcd missing" };
  }
  var value = leerRegistro(sheet, form.register);
  marcarEnable(form.register, value, "datos");
  var conflict = detectarContencion("datos");
  if (estadoBuffers[form.register]) estadoBuffers[form.register].en = 0;
  if (conflict) {
    errorContencion(sheet, "datos", conflict);
    return { ok: false, reason: "contention" };
  }
  limpiarSenalesBuffers();
  setControl(sheet, { rd: 0, wr: 1, io: 1 });
  marcarEnable(form.register, value, "datos");
  marcarLoad("LCD");
  transfer(busDatos, { name: form.register, value: value }, [], sheet);
  return lcdReceiveFromBus(sheet, value);
}