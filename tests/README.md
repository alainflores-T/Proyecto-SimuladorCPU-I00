# Node tests (assembler and catalog)

Apps Script has no test runner. These tests load the `.gs` files with `vm`
(pure logic only; functions that call `SpreadsheetApp` are not executed).

## How to run them

```bash
npm test
```

Requires Node >= 18.

## What they cover

- Assembly of the programs in `/programs/*.asm` with no errors
- Listing Address | HEX | Source
- Round trip assemble → disassemble → reassemble (same bytes)
- `ORG` / `DB` directives and IN/OUT ports
- Catalog counter (#instr, bytes, pages = ceil/touches of 32 B)
- Default migration of the 5 columns A/H/K/O/R

## On your copy of the Sheet

1. Copy the Apps Script project (do not `clasp push` onto the shared project).
2. Add `Assembler.gs`, `Disassembler.gs`, `Catalog.gs`.
3. Run `catalogInicializarDirectorio` and `assembleAndShowListing`.
