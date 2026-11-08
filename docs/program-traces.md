# Expected traces for the three catalog programs

These are static results and expected control-flow traces, not spreadsheet measurements. No CPU run, cache counters, page-fault log or dirty write-back was observed.

Page size is 32 bytes. VPN = address >> 5. A first access to an absent page causes a page fault. A later access can fault again if that page was evicted. Cache misses and page faults are different events.

The loader stores numeric machine bytes, while the current CPU fetch/decode path does not yet execute that byte stream correctly. The traces below describe the intended instruction semantics, not a successful loaded-program execution.

## Program 1 — arithmetic-ax-dx

Static assembly result:

- Assembly succeeds.
- 8 instructions in the listing.
- 20 emitted bytes.
- Code occupies VPN 0.

Expected final registers under the intended instruction semantics:
AX=0CH, BX=04H, CX=00H, DX=04H, ZF=1.

There are four setup instructions, three iterations of ADD/DEC/JNZ, and one HLT: 4 + 9 + 1 = 14 dynamic instructions.

| Steps | Instructions | Expected paging behavior | Cache |
|---|---|---|---|
| 1–4 | MOV AX, MOV BX, MOV CX, MOV DX | First code fetch faults if VPN 0 starts absent | Not measured |
| 5–13 | ADD AX, DX / DEC CX / JNZ loop, three iterations | No additional page is required | Not measured |
| 14 | HLT | VPN 0 remains sufficient | Not measured |

The third JNZ is not taken. No data-page access or dirty store is required by this program.

## Program 2 — keyboard-lcd-echo

Static assembly result:

- Assembly succeeds.
- 6 instructions in the listing.
- 14 emitted bytes.
- Code occupies VPN 0.

The source executes MOV CX, 08H, eight iterations of IN/OUT/DEC/JNZ, and HLT. This is 1 + 32 + 1 = 34 dynamic instructions, not 26.

| Steps | Instructions | Expected paging behavior | Cache |
|---|---|---|---|
| 1 | MOV CX, 08H | First code fetch faults if VPN 0 starts absent | Not measured |
| 2–33 | IN, OUT, DEC, JNZ, eight iterations | No additional program-data VPN is required | Not measured |
| 34 | HLT | VPN 0 remains sufficient | Not measured |

The source does not stop on Enter (0DH) or on an empty-input value (00H). When peripheral access is allowed, an empty IN returns 00H without advancing the queue pointers. If the I/O guard rejects access, that is not a successful empty read.

No LCD output was observed. The current personal physical-I/O opt-in is not a protected virtual-memory reservation. This document does not claim that the echo can run safely with paging enabled.

## Program 3 — scattered-access

Static assembly result:

- Assembly succeeds.
- 10 instructions in the listing.
- 40 emitted bytes, including code and data.
- Image size is 481 bytes because the image is sparse.
- 9 distinct VPNs: 0, 2, 3, 5, 7, 9, 11, 14, 15.

Code is in VPN 0. The other eight VPNs contain data.

| Order | Instruction | Data VPN | Intended effect |
|---|---|---|---|
| 1 | LD AX, [40H] | 2 | Read data |
| 2 | LD BX, [A0H] | 5 | Read data |
| 3 | ADD AX, BX | None | Update AX |
| 4 | ST [120H], AX | 9 | Write data and mark the resident page dirty |
| 5 | ST [1C0H], BX | 14 | Write data and mark the resident page dirty |
| 6 | LD CX, [60H] | 3 | Read data |
| 7 | ST [E0H], CX | 7 | Write data and mark the resident page dirty |
| 8 | LD DX, [160H] | 11 | Read data |
| 9 | ST [1E0H], DX | 15 | Write data and mark the resident page dirty |
| 10 | HLT | None | Stop |

The assembler emits these store bytes:

| Instruction | Bytes | VPN |
|---|---|---|
| ST [120H], AX | 08 01 20 00 | 9 |
| ST [1C0H], BX | 08 01 C0 01 | 14 |
| ST [E0H], CX | 08 E0 02 | 7 |
| ST [1E0H], DX | 08 01 E0 03 | 15 |

If all pages start absent, the intended execution needs at least nine first-touch page faults: one for code VPN 0 and eight for the distinct data VPNs. Additional faults are possible if an evicted page is accessed again, including the code page. Nine distinct VPNs do not establish an exact total fault count.

With eight available pageable frames, reaching all nine VPNs requires at least one replacement. The selected victim depends on the replacement policy and actual access history. A clean victim does not require dirty write-back.

Four store instructions do not prove that a dirty page was evicted. No victim, Swap write-back, cache hit count or cache miss count is claimed as measured.

## Pending spreadsheet verification

- [ ] Execute the programs after machine-byte fetch/decode is supported.
- [ ] Record actual registers and instruction counts.
- [ ] Record page faults and replacement victims.
- [ ] Record cache hits and misses separately.
- [ ] Verify a dirty victim is written back to Swap.
- [ ] Verify keyboard/LCD access under a protected memory map before combining I/O with paging.