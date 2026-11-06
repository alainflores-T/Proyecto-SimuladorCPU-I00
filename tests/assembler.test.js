const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { createTestContext } = require("./load-gs");

const ctx = createTestContext();
const programsDir = path.join(__dirname, "..", "programs");

describe("ensamblador de dos pasadas", () => {
  it("ensambla MOV/ADD inmediatos con flag +10H", () => {
    const res = ctx.ensamblar("MOV AX, 05H\nADD BX, 03H\nHLT\n");
    assert.equal(res.ok, true, res.errors.join("; "));
    // MOV imm = 11, AX=00, 05
    assert.equal(res.listing[0].hex, "11 00 05");
    // ADD imm = 12, BX=01, 03
    assert.equal(res.listing[1].hex, "12 01 03");
    assert.equal(res.listing[2].hex, "FF");
  });

  it("ensambla LD/ST y saltos con etiquetas", () => {
    const src = [
      "inicio:",
      "  LD AX, [80H]",
      "  ADD AX, BX",
      "  JC fin",
      "  JMP inicio",
      "fin:",
      "  HLT"
    ].join("\n");
    const res = ctx.ensamblar(src);
    assert.equal(res.ok, true, res.errors.join("; "));
    assert.equal(res.symbols.INICIO, 0);
    assert.ok(typeof res.symbols.FIN === "number");
    const conBytes = res.listing.filter((e) => e.bytes && e.bytes.length);
    assert.equal(conBytes[0].hex, "07 00 80"); // LD AX,[80H]
    assert.equal(conBytes[1].hex, "02 00 01"); // ADD AX,BX
  });

  it("soporta ORG y DB", () => {
    const res = ctx.ensamblar("ORG 10H\nDB 01H, 02H, 03H\nHLT\n");
    assert.equal(res.ok, true, res.errors.join("; "));
    assert.equal(res.image[0x10], 0x01);
    assert.equal(res.image[0x11], 0x02);
    assert.equal(res.image[0x12], 0x03);
    assert.equal(res.image[0x13], 0xFF);
  });

  it("ensambla IN/OUT con puertos", () => {
    const res = ctx.ensamblar("IN AX, [KBD]\nOUT [LCD], AX\nHLT\n");
    assert.equal(res.ok, true, res.errors.join("; "));
    assert.equal(res.listing[0].hex, "20 00 00");
    assert.equal(res.listing[1].hex, "21 01 00");
  });

  it("reporta errores con número de línea", () => {
    const res = ctx.ensamblar("MOV AX, 01H\nFOO BX, CX\nHLT\n");
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => /Línea 2/i.test(e)));
  });

  it("genera listing Address | HEX | Source", () => {
    const res = ctx.ensamblar("NOP\nHLT\n");
    const text = ctx.formatearListing(res);
    assert.match(text, /Address\s*\|\s*HEX/);
    assert.match(text, /00H/);
    assert.match(text, /NOP/);
  });

  for (const file of fs.readdirSync(programsDir).filter((f) => f.endsWith(".asm"))) {
    it("ensambla programs/" + file + " sin errores", () => {
      const src = fs.readFileSync(path.join(programsDir, file), "utf8");
      const res = ctx.ensamblar(src);
      assert.equal(res.ok, true, file + ": " + res.errors.join("; "));
      assert.ok(res.size > 0);
      assert.ok(res.pages >= 1);
    });
  }
});

describe("desensamblador e ida-y-vuelta", () => {
  it("desensambla bytes exactos de MOV imm", () => {
    const d = ctx.desensamblarInstruccion([0x11, 0x00, 0x05]);
    assert.equal(d.ok, true);
    assert.equal(d.mnemonic, "MOV");
    assert.match(d.text, /MOV AX,\s*05H/);
  });

  it("ida y vuelta en programa con etiquetas", () => {
    const src = [
      "  MOV AX, 00H",
      "  MOV BX, 04H",
      "bucle:",
      "  ADD AX, 03H",
      "  DEC BX",
      "  JNZ bucle",
      "  ST [20H], AX",
      "  HLT"
    ].join("\n");
    const r = ctx.pruebaIdaYVuelta(src);
    assert.equal(r.ok, true, JSON.stringify(r.mismatches, null, 2));
  });

  for (const file of ["acumulador-bucle.asm", "contador-cinco.asm", "cmp-store.asm", "carry-memoria.asm", "cmp-doble-hlt.asm", "io-demo.asm"]) {
    it("ida y vuelta programs/" + file, () => {
      const src = fs.readFileSync(path.join(programsDir, file), "utf8");
      const r = ctx.pruebaIdaYVuelta(src);
      assert.equal(r.ok, true, file + " " + JSON.stringify(r.mismatches || r.assembleErrors, null, 2));
    });
  }
});
