/**
 * Hoja Vista: tablero de solo lectura del estado real.
 * No borra Hoja 1. Si Vista existe y no es de este módulo, no se toca.
 */
var VISTA_HOJA = "Vista";
var VISTA_NOTA = "VISTA-v1";

function instalarVista() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(VISTA_HOJA);
  if (!hoja) hoja = libro.insertSheet(VISTA_HOJA);
  else {
    var nota = "";
    try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (e) { nota = ""; }
    if (nota !== VISTA_NOTA && String(hoja.getRange(1, 1).getValue() || "") !== "") {
      throw new Error("Vista existe y no es de este módulo. No se escribió nada.");
    }
  }
  var titulo = hoja.getRange(1, 1);
  titulo.setValue("Simulador SIS-131");
  if (titulo.setNote) titulo.setNote(VISTA_NOTA);
  hoja.getRange(2, 1).setValue("Nombre y logotipo: pendientes de acuerdo del equipo.");
  hoja.getRange(4, 1).setValue("CPU");
  hoja.getRange(5, 1, 1, 8).setValues([["AX", "", "BX", "", "CX", "", "DX", ""]]);
  hoja.getRange(6, 1, 1, 8).setValues([["PC", "", "IR", "", "MAR", "", "MDR", ""]]);
  hoja.getRange(7, 1, 1, 6).setValues([["ZF", "", "CF", "", "SF", ""]]);
  hoja.getRange(8, 1, 1, 8).setValues([["ALU1", "", "ALU2", "", "SYM", "", "RES", ""]]);
  hoja.getRange(10, 1).setValue("Buses");
  hoja.getRange(11, 1, 1, 6).setValues([["Interno", "", "Dirección", "", "Datos", ""]]);
  hoja.getRange(12, 1, 1, 8).setValues([["RD", "", "WR", "", "IO", "", "Palabra", ""]]);
  hoja.getRange(14, 1).setValue("Caché");
  hoja.getRange(15, 1, 1, 4).setValues([["Nivel", "Hits", "Misses", "Tasa"]]);
  hoja.getRange(19, 1).setValue("Teclado F0H-F7H");
  hoja.getRange(21, 1).setValue("LCD F8H-FFH");
  hoja.getRange(23, 1).setValue("Páginas (solo presentes se colorean)");
  hoja.getRange(24, 1, 1, 5).setValues([["VPN", "P", "PFN", "Dirty", "Ref"]]);
  hoja.getRange(41, 1).setValue("Marcos físicos 0-7. Elegibles 0-6. Marco 7 = E/S, no entra al reemplazo.");
  return hoja;
}

function pintarVista(snap) {
  if (!snap) return;
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = libro.getSheetByName(VISTA_HOJA);
  if (!hoja) return;
  var nota = "";
  try { nota = String(hoja.getRange(1, 1).getNote() || ""); } catch (e) { nota = ""; }
  if (nota !== VISTA_NOTA) return;
  hoja.getRange(3, 1).setValue("Estado " + snap.estado + "  política " + (snap.politica || ""));
  hoja.getRange(5, 2).setValue(snap.ax);
  hoja.getRange(5, 4).setValue(snap.bx);
  hoja.getRange(5, 6).setValue(snap.cx);
  hoja.getRange(5, 8).setValue(snap.dx);
  hoja.getRange(6, 2).setValue(snap.pc);
  hoja.getRange(6, 4).setValue(snap.ir);
  hoja.getRange(6, 6).setValue(snap.mar);
  hoja.getRange(6, 8).setValue(snap.mdr);
  hoja.getRange(7, 2).setValue(snap.zf);
  hoja.getRange(7, 4).setValue(snap.cf);
  hoja.getRange(7, 6).setValue(snap.sf);
  hoja.getRange(8, 2).setValue(snap.alu.op1);
  hoja.getRange(8, 4).setValue(snap.alu.op2);
  hoja.getRange(8, 6).setValue(snap.alu.sym);
  hoja.getRange(8, 8).setValue(snap.alu.res);
  var bus = snap.buses || {};
  function colorBus(valor) {
    return String(valor) === "ZZ" || valor === "" || valor == null ? "#B0BEC5" : "#C8E6C9";
  }
  hoja.getRange(11, 2).setValue(bus.interno).setBackground(colorBus(bus.interno));
  hoja.getRange(11, 4).setValue(bus.direccion).setBackground(colorBus(bus.direccion));
  hoja.getRange(11, 6).setValue(bus.datos).setBackground(colorBus(bus.datos));
  hoja.getRange(12, 2).setValue(bus.rd);
  hoja.getRange(12, 4).setValue(bus.wr);
  hoja.getRange(12, 6).setValue(bus.io);
  hoja.getRange(12, 8).setValue(snap.palabra || "");
  var cache = snap.cache || {};
  function filaCache(fila, nombre, caja) {
    hoja.getRange(fila, 1).setValue(nombre);
    hoja.getRange(fila, 2).setValue(caja ? caja.hits : 0);
    hoja.getRange(fila, 3).setValue(caja ? caja.misses : 0);
    hoja.getRange(fila, 4).setValue(caja ? caja.tasa : 0);
  }
  filaCache(16, "L1I", cache.l1i);
  filaCache(17, "L1D", cache.l1d);
  filaCache(18, "L2", cache.l2);
  var teclado = snap.teclado || [];
  var lcd = snap.lcd || [];
  var i;
  for (i = 0; i < 8; i++) {
    hoja.getRange(20, 1 + i).setValue(teclado.length > i ? teclado[i] : "");
    var n = lcd.length > i ? lcd[i] : 0;
    var glifo = n >= 32 && n <= 126 ? String.fromCharCode(n) : (n ? "." : "");
    hoja.getRange(22, 1 + i).setValue(glifo);
  }
  var paginas = snap.paginas || [];
  for (i = 0; i < paginas.length && i < 16; i++) {
    var p = paginas[i];
    var fila = 25 + i;
    hoja.getRange(fila, 1, 1, 5).setValues([[p.vpn, p.p, p.pfn, p.dirty, p.ref]]);
    var fondo = String(p.p) === "1" ? (String(p.dirty) === "1" ? "#FFE0B2" : "#E8F5E9") : "#FFFFFF";
    hoja.getRange(fila, 1, 1, 5).setBackground(fondo);
  }
  var eventos = snap.eventos || [];
  hoja.getRange(42, 1).setValue(eventos.length ? eventos[eventos.length - 1] : "");
}
