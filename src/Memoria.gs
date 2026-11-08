// Memoria.gs — MMU, fallo de página, FIFO por defecto y marco 7 fijo.
// VA 9 bits: VPN = VA[8:5], offset = VA[4:0].
// PA = PFN * 32 + offset, 8 bits.
// Marcos 0..6 paginables. Marco 7 = PFN de la VPN 15, siempre presente,
// nunca víctima. Teclado F0-F7 y LCD F8-FF viven ahí.
// Riesgo R1: la RAM tiene 8 marcos, pero solo 7 son paginables.
// No se afirma la nota plena de G3/G4 sin la aceptación del docente.

function simTraducir(e, va) {
  va = va & 0x1FF;
  var vpn = va >> 5;
  var off = va & 31;
  var p = e.paginas[vpn];
  if (!p.p) return { fallo: 1, va: va, vpn: vpn, offset: off };
  return { fallo: 0, va: va, vpn: vpn, offset: off, pfn: p.pfn, pa: p.pfn * 32 + off, io: p.fija ? 1 : 0 };
}

function simMarcarAcceso(e, vpn, escritura) {
  var p = e.paginas[vpn];
  p.ref = 1;
  if (p.fija) return;
  e.relojUso++;
  p.uso = e.relojUso;
  if (escritura) p.dirty = 1;
}

function simElegirMarco(e) {
  var usado = {};
  var i;
  for (i = 0; i < 15; i++) {
    var p = e.paginas[i];
    if (p.p && !p.fija && p.pfn >= 0) usado[p.pfn] = i;
  }
  for (i = 0; i < 7; i++) {
    if (typeof usado[i] === "undefined") return { pfn: i, victima: -1, dirty: 0 };
  }
  var mejor = -1;
  for (i = 0; i < 15; i++) {
    var q = e.paginas[i];
    if (!q.p || q.fija) continue;
    if (mejor < 0) { mejor = i; continue; }
    var a = e.paginas[mejor];
    var clave = e.politica === "LRU" ? "uso" : "orden";
    if (q[clave] < a[clave] || (q[clave] === a[clave] && q.pfn < a.pfn)) mejor = i;
  }
  if (mejor < 0) return null;
  return { pfn: e.paginas[mejor].pfn, victima: mejor, dirty: e.paginas[mejor].dirty ? 1 : 0 };
}

function simIniciarFallo(e, va, reanudar, escritura, tipo) {
  va = va & 0x1FF;
  var vpn = va >> 5;
  if (vpn === 15) {
    e.error = "La VPN 15 es E/S fija y no admite fallo de página.";
    e.faseError = 1;
    return "ERROR";
  }
  var elec = simElegirMarco(e);
  if (!elec) {
    e.error = "No hay marco paginable para la VPN " + vpn + ".";
    e.faseError = 1;
    return "ERROR";
  }
  e.reanudar = reanudar;
  e.pf = {
    va: va, vpn: vpn, escritura: escritura ? 1 : 0, tipo: tipo,
    pfn: elec.pfn, victima: elec.victima, dirty: elec.dirty
  };
  e.banner = "PAGE FAULT VPN " + vpn;
  e.evento = e.banner + (elec.victima < 0 ? " marco libre " + elec.pfn : " víctima VPN " + elec.victima + " marco " + elec.pfn);
  e.reclasificar = "PF1";
  e.ultimaVA = va;
  e.ultimaPA = "";
  return elec.dirty ? "PF2" : "PF3";
}

function simPasoPF2(e) {
  var vpn = e.pf.victima;
  var pfn = e.pf.pfn;
  var i;
  for (i = 0; i < 32; i++) e.swap[vpn * 32 + i] = e.ram[pfn * 32 + i] & 255;
  e.writebacks++;
  e.evento = "PAGE FAULT write-back VPN " + vpn + " marco " + pfn;
  e.banner = e.evento;
  e.ultimaVA = e.pf.va;
  return "PF3";
}

function simPasoPF3(e) {
  var vpn = e.pf.vpn;
  var pfn = e.pf.pfn;
  var i;
  for (i = 0; i < 32; i++) e.ram[pfn * 32 + i] = e.swap[vpn * 32 + i] & 255;
  e.evento = "PAGE FAULT carga VPN " + vpn + " marco " + pfn;
  e.banner = "PAGE FAULT VPN " + vpn;
  e.ultimaVA = e.pf.va;
  e.ultimaPA = pfn * 32;
  return "PF4";
}

function simPasoPF4(e) {
  if (e.pf.victima >= 0) {
    var vieja = e.paginas[e.pf.victima];
    vieja.p = 0;
    vieja.pfn = -1;
    vieja.dirty = 0;
    vieja.ref = 0;
    vieja.orden = 0;
    vieja.uso = 0;
  }
  e.relojFifo++;
  var nueva = e.paginas[e.pf.vpn];
  nueva.p = 1;
  nueva.pfn = e.pf.pfn;
  nueva.dirty = 0;
  nueva.ref = 0;
  nueva.orden = e.relojFifo;
  nueva.uso = e.relojFifo;
  nueva.fija = 0;
  simInvalidarMarco(e, e.pf.pfn);
  e.fallos++;
  if (!e.registroFallos) e.registroFallos = [];
  e.registroFallos.push(e.pf.vpn);
  e.banner = "PAGE FAULT VPN " + e.pf.vpn + " PFN " + e.pf.pfn;
  e.evento = e.banner;
  e.ultimaVA = e.pf.va;
  var sigue = e.reanudar;
  return sigue;
}

function simLeerVisible(e, va) {
  var t = simTraducir(e, va);
  if (t.fallo) return e.swap[(va >> 5) * 32 + (va & 31)] & 255;
  return e.ram[t.pa] & 255;
}

function simEditarDireccion(e, va, valor) {
  va = va & 0x1FF;
  valor = valor & 255;
  if ((va >> 5) === 15) {
    var paIO = 0xE0 + (va & 31);
    e.ram[paIO] = valor;
    return { ok: true, donde: "E/S", pa: paIO };
  }
  var t = simTraducir(e, va);
  if (t.fallo) {
    e.swap[(va >> 5) * 32 + (va & 31)] = valor;
    return { ok: true, donde: "swap", pa: "" };
  }
  e.ram[t.pa] = valor;
  simInvalidarMarco(e, t.pfn);
  return { ok: true, donde: "RAM", pa: t.pa };
}
