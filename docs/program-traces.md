# Trazas de los tres programas

## Medido el 2026-11-08

Motor de producción (`stepCPU`, MMU, caché, `IN`/`OUT`, cargador) con `SpreadsheetApp` y `PropertiesService` simulados. Comando: `node tests/run-motor.js`. No es una corrida de la hoja original.

| Programa | Resultado medido |
| --- | --- |
| Aritmética | HALT con AX=`0CH`, BX=`04H`, CX=`00H`, DX=`04H`, ZF=1, CF=0, SF=0. L1I tuvo miss y después hit. |
| Eco | Ocho `IN`/`OUT` con la memoria virtual encendida. LCD = 65,66,67,68,69,70,71,72. La cola no está en la dirección física F0H. |
| Disperso | HALT con AX=`03H`, BX=`02H`, CX=`03H`, DX=`04H`. Al parar hay 8 páginas presentes. Dirty en VPN 7, 9, 14 y 15. L1D: 8 misses y 0 hits (cada operando cae en otra línea y L1D guarda una sola). L1I: 27 hits, 5 misses, tasa 84.4. L2: 0 hits, 13 misses. El log tiene `PAGE FAULT`. Con FIFO, los dos desalojos del propio programa fueron páginas limpias (0 y 2). El write-back de un marco sucio se midió al pedir páginas de más después del HALT. |

`FETCH_3` no añade eventos de caché si `FETCH_2` ya leyó la instrucción (0 eventos nuevos en la prueba).

## Previsto, no medido en Sheets

Lo que sigue es el análisis estático anterior. No son cifras de la hoja de cálculo.

Page size is 32 bytes. VPN = address >> 5. A first access to an absent page causes a page fault. A later access can fault again if that page was evicted. Cache misses and page faults are different events.

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

The source does not stop on Enter (0DH). An empty IN returns 00H and does not move the queue. The 2026-11-08 mock run did produce the eight LCD bytes with virtual memory on. That run is not a measurement on the original spreadsheet.

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