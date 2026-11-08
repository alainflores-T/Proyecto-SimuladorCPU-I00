// ES.gs — cola de teclado y LCD 8×1 dentro del marco 7.
// VA 1F0H-1F7H = PA F0H-F7H. VA 1F8H-1FFH = PA F8H-FFH.
// IN y OUT no pasan por la caché. La cola vacía entrega 00H
// y no mueve la cabeza. La novena tecla no entra.

function simCodigoTecla(texto) {
  var raw = String(texto === null || typeof texto === "undefined" ? "" : texto);
  if (raw === "") return { ok: false, error: "Tecla vacía" };
  if (raw.toUpperCase() === "ENTER") return { ok: true, byte: 0x0D };
  if (raw.length !== 1) return { ok: false, error: "Una tecla o ENTER" };
  var code = raw.charCodeAt(0);
  if (code < 0 || code > 255) return { ok: false, error: "Fuera de un byte" };
  return { ok: true, byte: code };
}

function simMeterTecla_(e, byte) {
  if (e.kbdCount >= 8) return { ok: false, error: "Cola llena" };
  var pa = 0xF0 + (e.kbdTail & 7);
  e.ram[pa] = byte & 255;
  e.kbdTail = (e.kbdTail + 1) & 7;
  e.kbdCount++;
  return { ok: true, byte: byte & 255 };
}

function simTeclear(e, texto) {
  var raw = String(texto === null || typeof texto === "undefined" ? "" : texto);
  if (raw === "") return { ok: false, error: "Tecla vacía" };
  if (raw.toUpperCase() === "ENTER") return simMeterTecla_(e, 0x0D);
  if (raw.length === 1) {
    var codigo = simCodigoTecla(raw);
    if (!codigo.ok) return codigo;
    return simMeterTecla_(e, codigo.byte);
  }
  if (e.kbdCount + raw.length > 8) {
    return { ok: false, error: "Cola de 8. Quedan " + (8 - e.kbdCount) + " huecos." };
  }
  var i;
  for (i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) > 255) return { ok: false, error: "Fuera de un byte" };
  }
  var ultimo = 0;
  for (i = 0; i < raw.length; i++) ultimo = simMeterTecla_(e, raw.charCodeAt(i)).byte;
  return { ok: true, byte: ultimo, n: raw.length };
}

function simLimpiarCola(e) {
  var i;
  for (i = 0; i < 8; i++) e.ram[0xF0 + i] = 0;
  e.kbdHead = 0;
  e.kbdTail = 0;
  e.kbdCount = 0;
  return e;
}

function simLimpiarLcd(e) {
  var i;
  for (i = 0; i < 8; i++) e.ram[0xF8 + i] = 0;
  e.lcdCursor = 0;
  return e;
}

function simGlifo(n) {
  n = n & 255;
  if (n >= 32 && n <= 126) return String.fromCharCode(n);
  if (n === 0) return "";
  return ".";
}
