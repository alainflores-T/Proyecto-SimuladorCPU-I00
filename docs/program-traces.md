# Expected traces for the three catalog programs

These tables are the expected story for a later CPU that has paging (#25) and caches (#27–#29). They were not measured. `assemble()` does not execute instructions, does not raise `PageFault`, and does not count hits or misses.

Page size is 32 bytes. VPN = address >> 5. A page fault is expected only the first time a VPN is touched. A later read of a page already filled would be a hit only after #25 and the cache issues exist. Until then every fault and hit cell below is an estimate, not a result.

## Program 1 — arithmetic-ax-dx

Expected register result if the text is executed: AX=0CH, BX=04H, CX=00H, DX=04H, ZF=1.

| Step | Instruction | Memory | Page fault | Cache |
|---|---|---|---|---|
| 1 | MOV AX, 00H | none | no | no |
| 2 | MOV BX, 04H | none | no | no |
| 3 | MOV CX, 03H | none | no | no |
| 4 | MOV DX, BX | none | no | no |
| 5 | ADD AX, DX | none | no | no |
| 6 | DEC CX | none | no | no |
| 7 | JNZ loop | none | no | no |
| 8–13 | ADD / DEC / JNZ, two more times | none | no | no |
| 14 | HLT | none | no | no |

No distinct data page. Approximate faults: 0. Approximate misses: 0.

## Program 2 — keyboard-lcd-echo

The CPU has no `IN` or `OUT` case. Issues #33, #34 and #35 are open. There is no empty-queue value and no Enter code in the ISA, so this program stops after 8 transfers instead of inventing one.

| Step | Instruction | I/O | Page fault | Cache |
|---|---|---|---|---|
| 1 | MOV CX, 08H | none | no | no |
| 2–25 | IN, OUT, DEC, JNZ, eight times | not executed | no | no |
| 26 | HLT | none | no | no |

LCD text: not available. Approximate faults: 0. Approximate misses: 0.

## Program 3 — scattered-access

Dirty writes are the four `ST` instructions (pages 9, 14, 7 and 15). Replacement and write-back need #25 and #26. The estimates below assume a cold cache and demand paging, which this spreadsheet does not do on FETCH yet.

| Order | Access | VPN | Kind | First touch | Later hit |
|---|---|---|---|---|---|
| 1 | LD [40H] | 2 | read | fault, miss | — |
| 2 | LD [A0H] | 5 | read | fault, miss | — |
| 3 | ADD AX, BX | — | ALU | no | no |
| 4 | ST [120H] | 9 | dirty write | fault, miss | — |
| 5 | ST [1C0H] | 14 | dirty write | fault, miss | — |
| 6 | LD [60H] | 3 | read | fault, miss | — |
| 7 | ST [E0H] | 7 | dirty write | fault, miss | — |
| 8 | LD [160H] | 11 | read | fault, miss | — |
| 9 | ST [1E0H] | 15 | dirty write | fault, miss | — |
| 10 | HLT on page 0 | 0 | code | fault if code was not preloaded | — |

Nine distinct VPNs: 0, 2, 3, 5, 7, 9, 11, 14, 15. That is more than 8 frames, so a real pager would have to replace a frame. This table does not name which frame, because #26 is not implemented. Approximate faults: 9. Approximate misses: 9. Approximate hits: 0.