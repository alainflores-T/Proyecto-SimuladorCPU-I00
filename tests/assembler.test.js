const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { createTestContext } = require("./load-gs");

const ctx = createTestContext();
const programsDir = path.join(__dirname, "..", "programs");

describe("two-pass assembler", () => {
  it("assembles MOV/ADD immediates with the +10H flag", () => {
    const res = ctx.assemble("MOV AX, 05H\nADD BX, 03H\nHLT\n");
    assert.equal(res.ok, true, res.errors.join("; "));
    // MOV imm = 11, AX=00, 05
    assert.equal(res.listing[0].hex, "11 00 05");
    // ADD imm = 12, BX=01, 03
    assert.equal(res.listing[1].hex, "12 01 03");
    assert.equal(res.listing[2].hex, "FF");
  });

  it("assembles LD/ST and jumps with labels", () => {
    const src = [
      "start:",
      "  LD AX, [80H]",
      "  ADD AX, BX",
      "  JC end",
      "  JMP start",
      "end:",
      "  HLT"
    ].join("\n");
    const res = ctx.assemble(src);
    assert.equal(res.ok, true, res.errors.join("; "));
    assert.equal(res.symbols.START, 0);
    assert.ok(typeof res.symbols.END === "number");
    const withBytes = res.listing.filter((e) => e.bytes && e.bytes.length);
    assert.equal(withBytes[0].hex, "07 00 80"); // LD AX,[80H]
    assert.equal(withBytes[1].hex, "02 00 01"); // ADD AX,BX
  });

  it("supports ORG and DB", () => {
    const res = ctx.assemble("ORG 10H\nDB 01H, 02H, 03H\nHLT\n");
    assert.equal(res.ok, true, res.errors.join("; "));
    assert.equal(res.image[0x10], 0x01);
    assert.equal(res.image[0x11], 0x02);
    assert.equal(res.image[0x12], 0x03);
    assert.equal(res.image[0x13], 0xFF);
  });

  it("assembles IN/OUT with ports", () => {
    const res = ctx.assemble("IN AX, [KBD]\nOUT [LCD], AX\nHLT\n");
    assert.equal(res.ok, true, res.errors.join("; "));
    assert.equal(res.listing[0].hex, "20 00 00");
    assert.equal(res.listing[1].hex, "21 01 00");
  });

  it("reports errors with a line number", () => {
    const res = ctx.assemble("MOV AX, 01H\nFOO BX, CX\nHLT\n");
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => /Line 2/i.test(e)));
  });

  it("builds an Address | HEX | Source listing", () => {
    const res = ctx.assemble("NOP\nHLT\n");
    const text = ctx.formatListing(res);
    assert.match(text, /Address\s*\|\s*HEX/);
    assert.match(text, /00H/);
    assert.match(text, /NOP/);
  });

  for (const file of fs.readdirSync(programsDir).filter((f) => f.endsWith(".asm"))) {
    it("assembles programs/" + file + " with no errors", () => {
      const src = fs.readFileSync(path.join(programsDir, file), "utf8");
      const res = ctx.assemble(src);
      assert.equal(res.ok, true, file + ": " + res.errors.join("; "));
      assert.ok(res.size > 0);
      assert.ok(res.pages >= 1);
    });
  }
});

describe("disassembler and round trip", () => {
  it("disassembles the exact bytes of MOV imm", () => {
    const d = ctx.disassembleInstruction([0x11, 0x00, 0x05]);
    assert.equal(d.ok, true);
    assert.equal(d.mnemonic, "MOV");
    assert.match(d.text, /MOV AX,\s*05H/);
  });

  it("round-trips a program with labels", () => {
    const src = [
      "  MOV AX, 00H",
      "  MOV BX, 04H",
      "loop:",
      "  ADD AX, 03H",
      "  DEC BX",
      "  JNZ loop",
      "  ST [20H], AX",
      "  HLT"
    ].join("\n");
    const r = ctx.roundTripTest(src);
    assert.equal(r.ok, true, JSON.stringify(r.mismatches, null, 2));
  });

  for (const file of ["accumulator-loop.asm", "count-to-five.asm", "cmp-store.asm", "carry-memory.asm", "cmp-double-hlt.asm", "io-demo.asm"]) {
    it("round-trips programs/" + file, () => {
      const src = fs.readFileSync(path.join(programsDir, file), "utf8");
      const r = ctx.roundTripTest(src);
      assert.equal(r.ok, true, file + " " + JSON.stringify(r.mismatches || r.assembleErrors, null, 2));
    });
  }
});
