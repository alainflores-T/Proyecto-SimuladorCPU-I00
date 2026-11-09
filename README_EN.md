# CPU simulator

Validated Google Sheets copy. The engine is branch `cursor/visual-lab-9a2-a0e8` at `9ab18d4`. The spreadsheet is the main interface. The HTML dialog is auxiliary.

Sheet: <https://docs.google.com/spreadsheets/d/1CKb2nxVO2tstUjwY1s5clJ1ME9Di0lNIpk8voLzeS20/edit>

Apps Script project of that copy: `1yTRwU6iB3LEfVmbfgtJ4zxun26nDwDUNQB5t3nJ_WPCnoJQD6WwEQvzD`.

The original spreadsheets are left untouched. This file describes the copy above.

Spanish: [README.md](README.md). The long manual, architecture notes and defense guide are in Spanish.

## What it runs

Fixed 2-byte ISA. Registers PC, MAR, MDR, IR, AX, BX, CX and DX. Flags ZF, CF and SF. 256-byte RAM, 512-byte swap, 32-byte pages. Frames 0 through 6 are pageable. Frame 7 is VPN 15 and is never replaced: the keyboard lives at `F0`–`F7` and the LCD at `F8`–`FF`. Cache is L1I 8 bytes, L1D 8 bytes and a direct-mapped L2 of 4 lines of 8, with physical tags. One driver per bus. Two drivers set the phase to `ERROR`.

`STEP` advances one micro-step, not one instruction. `HLT` is a normal end. A page fault is the normal path when the VPN is not in RAM.

## Install

No web app. The manifest has only these two scopes:

- `https://www.googleapis.com/auth/spreadsheets.currentonly`
- `https://www.googleapis.com/auth/script.container.ui`

In that copy's project, eight `.gs` files plus `Laboratorio.html` and `appsscript.json`:

`Estado.gs`, `Cache.gs`, `Memoria.gs`, `ES.gs`, `CPU.gs`, `Ensamblador.gs`, `Main.gs`, `Pruebas.gs`, `Laboratorio.html`, `appsscript.json`.

Buttons, keyboard and the functions that do not reset the CPU: [docs/manual.md](docs/manual.md).

## Results already measured on that copy

Twenty local tests and the same twenty on Google: 0 failures.

| Program | Observed end |
| --- | --- |
| P1 | `HLT`, PC `010`, AX `0C`, BX `04`, CX `00`, DX `04`, ZF 1. L1I: 26 hits and 2 misses. |
| P2 | Eight `IN` and eight `OUT`. Type `HOLA` before Run. The queue goes from `[72, 79, 76, 65]` to empty. The LCD is `48 4F 4C 41 00 00 00 00`. An empty queue returns `00` and does not wait. |
| P3 | `HLT`, PC `016`, AX `0A`, BX `02`, CX `03`, DX `04`, MAR `015`, IR `0800`, flags 0. 141 micro-steps, 11 page faults `[0, 2, 5, 9, 14, 3, 7, 11, 0, 12, 4]`, one write-back of VPN 9 from frame 3. L1I 19/3 (86.4%), L1D 0 hits and 9 misses (5 loads and 4 stores), L2 0/12. |

After fix `9ab18d4`, the 3569 values read from `_ESTADO` were unchanged (hash `e78adc84` … `860daa`). The P3 listing shows `20 40` in `Programas!G5`, and the label `1E0` is still text in `PANEL!G53`.

P3 leaves AX at `0A` because the last load is `LD AX, [80H]`. The earlier sum is overwritten by that load.

## Limits that matter

- Sheet Stop during Run is not validated. Two earlier attempts finished before it could be observed. Pause, resume and Reset were tested in the HTML lab and stayed still for 5 seconds. That is a different control.
- The stored trace is 200 micro-steps (`SIM_TRAZA_MAX` in `Estado.gs`). It is not 80. The panel shows the last 12.
- The native panel uses about 750 px of a 1280 px width, and virtual memory needs scrolling. It does not reproduce the HTML dialog.
- There is no HEX/DEC/BIN switch.
- People using the copy removed protections by hand. `simPrepararEstaCopia` can put them back. Sharing the file is not that protection: everyone sees the same CPU.
- The source does not claim a full memory-and-cache mark. There are 8 physical frames and only 7 are pageable.

## More

- [Install and use](docs/manual.md) (Spanish)
- [Architecture](docs/arquitectura.md) (Spanish)
- [ISA](docs/ISA.md) (Spanish)
- [Control word](docs/control-word.md) (Spanish)
- [P1, P2 and P3 results](docs/program-traces.md) (Spanish)
- [Evidence and limits](docs/matriz.md) (Spanish)
- [Defense guide](docs/GUIA_DEFENSA.md) (Spanish)
- Loose diagrams: [docs/diagramas](docs/diagramas)
