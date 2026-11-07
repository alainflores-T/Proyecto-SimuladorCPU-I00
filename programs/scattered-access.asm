; Mandatory program 3. Data on pages 0, 2, 3, 5, 7, 9, 11, 14 and 15.
; Page size is 32 bytes. More than 8 pages forces a later replacement.
  LD AX, [40H]
  LD BX, [A0H]
  ADD AX, BX
  ST [120H], AX
  ST [1C0H], BX
  LD CX, [60H]
  ST [E0H], CX
  LD DX, [160H]
  ST [1E0H], DX
  HLT
ORG 40H
  DB 01H
ORG 60H
  DB 03H
ORG A0H
  DB 02H
ORG E0H
  DB 05H
ORG 120H
  DB 06H
ORG 160H
  DB 04H
ORG 1C0H
  DB 07H
ORG 1E0H
  DB 08H