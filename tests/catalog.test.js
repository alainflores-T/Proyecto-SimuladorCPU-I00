const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createTestContext } = require("./load-gs");

const ctx = createTestContext();

describe("program catalog", () => {
  it("counts instructions, bytes, and pages (32 B)", () => {
    const c = ctx.catalogCountSource([
      "MOV AX, 00H",
      "INC AX",
      "HLT"
    ]);
    // MOV=3, INC=2, HLT=1 → 6 bytes, 3 instructions, 1 page
    assert.equal(c.instructions, 3);
    assert.equal(c.bytes, 6);
    assert.equal(c.pages, 1);
    assert.equal(c.errors.length, 0);
  });

  it("migrates at least 3 default programs from columns A/H/K/O/R", () => {
    const entries = ctx.catalogDefaultMigratedPrograms();
    assert.ok(entries.length >= 3);
    assert.ok(entries.length >= 5, "all 5 columns are migrated");
    const names = entries.map((e) => e.name);
    assert.ok(names.includes("carry-memory"));
    assert.ok(names.includes("accumulator-loop"));
    assert.ok(names.includes("counter-five"));
    for (const e of entries) {
      assert.ok(e.instructions >= 1, e.name);
      assert.ok(e.bytes >= 1, e.name);
      assert.ok(e.pages >= 1, e.name);
      assert.ok(e.source.length >= 2, e.name);
    }
  });

  it("exports .asm text with a header", () => {
    const e = ctx.catalogCreateEntry(9, "demo", "desc", ["NOP", "HLT"], "Draft");
    const text = ctx.catalogExportAsm(e);
    assert.match(text, /Program: demo/);
    assert.match(text, /NOP/);
    assert.match(text, /HLT/);
  });

  it("serializes rows with Directory headers", () => {
    const entries = ctx.catalogDefaultMigratedPrograms().slice(0, 3);
    const rows = ctx.catalogEntriesToRows(entries);
    assert.equal(JSON.stringify(rows[0]), JSON.stringify(["ID", "Name", "Description", "# instr", "Bytes", "Pages", "Status"]));
    assert.equal(rows.length, 4);
  });

  it("pages = ceil when the program is dense from 0", () => {
    // 33 NOPs → 33 bytes → 2 pages
    const lines = [];
    for (let i = 0; i < 33; i++) lines.push("NOP");
    const c = ctx.catalogCountSource(lines);
    assert.equal(c.bytes, 33);
    assert.equal(c.pages, 2);
  });
});
