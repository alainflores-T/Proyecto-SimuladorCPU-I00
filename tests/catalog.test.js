const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./load-gs");

const ctx = createTestContext();

describe("catálogo de programas", () => {
  it("cuenta instrucciones, bytes y páginas (32 B)", () => {
    const c = ctx.catalogContarFuente([
      "MOV AX, 00H",
      "INC AX",
      "HLT"
    ]);
    // MOV=3, INC=2, HLT=1 → 6 bytes, 3 instr, 1 página
    assert.equal(c.instructions, 3);
    assert.equal(c.bytes, 6);
    assert.equal(c.pages, 1);
    assert.equal(c.errors.length, 0);
  });

  it("migra al menos 3 programas por defecto desde columnas A/H/K/O/R", () => {
    const entradas = ctx.catalogProgramasMigradosPorDefecto();
    assert.ok(entradas.length >= 3);
    assert.ok(entradas.length >= 5, "se migran las 5 columnas");
    const nombres = entradas.map((e) => e.nombre);
    assert.ok(nombres.includes("carry-memoria"));
    assert.ok(nombres.includes("acumulador-bucle"));
    assert.ok(nombres.includes("contador-cinco"));
    for (const e of entradas) {
      assert.ok(e.instructions >= 1, e.nombre);
      assert.ok(e.bytes >= 1, e.nombre);
      assert.ok(e.pages >= 1, e.nombre);
      assert.ok(e.source.length >= 2, e.nombre);
    }
  });

  it("exporta texto .asm con cabecera", () => {
    const e = ctx.catalogCrearEntrada(9, "demo", "desc", ["NOP", "HLT"], "Borrador");
    const text = ctx.catalogExportarAsm(e);
    assert.match(text, /Programa: demo/);
    assert.match(text, /NOP/);
    assert.match(text, /HLT/);
  });

  it("serializa filas con encabezados del Directorio", () => {
    const entradas = ctx.catalogProgramasMigradosPorDefecto().slice(0, 3);
    const filas = ctx.catalogEntradasAFilas(entradas);
    assert.equal(JSON.stringify(filas[0]), JSON.stringify(["ID", "Nombre", "Descripción", "# instr", "Bytes", "Páginas", "Estado"]));
    assert.equal(filas.length, 4);
  });

  it("páginas = ceil cuando el programa es denso desde 0", () => {
    // 33 NOPs → 33 bytes → 2 páginas
    const lineas = [];
    for (let i = 0; i < 33; i++) lineas.push("NOP");
    const c = ctx.catalogContarFuente(lineas);
    assert.equal(c.bytes, 33);
    assert.equal(c.pages, 2);
  });
});
