// Cache.gs — L1I 1×8, L1D 1×8, L2 directa 4×8.
// Etiquetas físicas, después de la MMU.
// Write-through y write-allocate. Sin dirty de línea.
// L2 solo cuenta demanda (fallo de L1). El write-through con acierto
// de L1D actualiza L2 en un contador de mantenimiento, fuera de la tasa.

function simCacheEsIO(pa) {
  return pa >= 0xE0 && pa <= 0xFF;
}

function simContarL1(e, nivel, hit, escritura) {
  if (nivel === "I") {
    if (hit) e.cont.l1iH++;
    else e.cont.l1iM++;
    e.cacheNota = hit ? "L1I HIT" : "L1I MISS";
    return;
  }
  if (escritura) {
    if (hit) e.cont.l1dWH++;
    else e.cont.l1dWM++;
  } else if (hit) e.cont.l1dRH++;
  else e.cont.l1dRM++;
  e.cacheNota = hit ? "L1D HIT" : "L1D MISS";
}

function simContarL2(e, hit) {
  if (hit) e.cont.l2H++;
  else e.cont.l2M++;
  e.cacheNota = e.cacheNota + (hit ? " L2 HIT" : " L2 MISS");
}

function simCopiarLinea(dst, src, base, tag) {
  dst.v = 1;
  dst.tag = tag;
  dst.base = base;
  var i;
  for (i = 0; i < 8; i++) dst.b[i] = src[i];
}

function simLlenarDesdeRam(e, linea, base, tag) {
  var bytes = [];
  var i;
  for (i = 0; i < 8; i++) bytes.push(e.ram[base + i] & 255);
  simCopiarLinea(linea, bytes, base, tag);
  return bytes;
}

function simInvalidarLinea(linea) {
  linea.v = 0;
  linea.tag = 0;
  linea.base = -1;
  var i;
  for (i = 0; i < 8; i++) linea.b[i] = 0;
}

function simInvalidarMarco(e, pfn) {
  var inicio = pfn * 32;
  var fin = inicio + 32;
  function toca(linea) {
    return linea.v && linea.base >= inicio && linea.base < fin;
  }
  if (toca(e.l1i)) simInvalidarLinea(e.l1i);
  if (toca(e.l1d)) simInvalidarLinea(e.l1d);
  var i;
  for (i = 0; i < 4; i++) if (toca(e.l2[i])) simInvalidarLinea(e.l2[i]);
}

function simInvalidarTodo(e) {
  simInvalidarLinea(e.l1i);
  simInvalidarLinea(e.l1d);
  var i;
  for (i = 0; i < 4; i++) simInvalidarLinea(e.l2[i]);
}

function simInvalidarOtraL1(e, base) {
  if (e.l1i.v && e.l1i.base === base) simInvalidarLinea(e.l1i);
}

function simCacheLeer(e, pa, tipo) {
  pa = pa & 255;
  if (simCacheEsIO(pa)) {
    e.cacheNota = "BYPASS";
    return e.ram[pa] & 255;
  }
  var base = pa & ~7;
  var off = pa & 7;
  var l1 = tipo === "I" ? e.l1i : e.l1d;
  if (l1.v && l1.base === base) {
    simContarL1(e, tipo, true, false);
    return l1.b[off] & 255;
  }
  simContarL1(e, tipo, false, false);
  var idx = (pa >> 3) & 3;
  var tag = pa >> 5;
  var l2 = e.l2[idx];
  var hitL2 = l2.v && l2.base === base && l2.tag === tag;
  var bytes;
  if (hitL2) {
    simContarL2(e, true);
    bytes = l2.b.slice();
  } else {
    simContarL2(e, false);
    bytes = simLlenarDesdeRam(e, l2, base, tag);
  }
  simCopiarLinea(l1, bytes, base, base >> 3);
  return l1.b[off] & 255;
}

function simCacheEscribir(e, pa, valor) {
  pa = pa & 255;
  valor = valor & 255;
  if (simCacheEsIO(pa)) {
    e.ram[pa] = valor;
    e.cacheNota = "BYPASS";
    return valor;
  }
  var base = pa & ~7;
  var off = pa & 7;
  var idx = (pa >> 3) & 3;
  var tag = pa >> 5;
  var l2 = e.l2[idx];
  if (e.l1d.v && e.l1d.base === base) {
    simContarL1(e, "D", true, true);
    e.l1d.b[off] = valor;
    e.ram[pa] = valor;
    if (l2.v && l2.base === base && l2.tag === tag) {
      l2.b[off] = valor;
      e.cont.mant++;
      e.cacheNota = e.cacheNota + " MANT";
    }
    simInvalidarOtraL1(e, base);
    return valor;
  }
  simContarL1(e, "D", false, true);
  var hitL2 = l2.v && l2.base === base && l2.tag === tag;
  if (!hitL2) {
    simContarL2(e, false);
    simLlenarDesdeRam(e, l2, base, tag);
  } else simContarL2(e, true);
  l2.b[off] = valor;
  e.ram[pa] = valor;
  simCopiarLinea(e.l1d, l2.b, base, base >> 3);
  simInvalidarOtraL1(e, base);
  return valor;
}
