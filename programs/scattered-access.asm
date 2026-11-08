; Program 3. Touch 9 virtual pages of 32 bytes. Four ST instructions are dirty writes.
; Pages: 0 (code), 2, 3, 5, 7, 9, 11, 14, 15. More than the 8 physical frames.
; assemble() does not raise faults. The CPU does, once this image is loaded
; with virtual memory, FIFO and the cache turned on.
  LD AX, [40H]         ; read page 2
  LD BX, [A0H]         ; read page 5
  ADD AX, BX           ; AX = byte[40H] + byte[A0H]. No memory access
  ST [120H], AX        ; dirty write, page 9
  ST [1C0H], BX        ; dirty write, page 14
  LD CX, [60H]         ; read page 3
  ST [E0H], CX         ; dirty write, page 7
  LD DX, [160H]        ; read page 11
  ST [1E0H], DX        ; dirty write, page 15
  HLT                  ; stop. Code itself occupies page 0
ORG 40H                ; page 2
  DB 01H               ; initial byte read by LD AX
ORG 60H                ; page 3
  DB 03H               ; initial byte read by LD CX
ORG A0H                ; page 5
  DB 02H               ; initial byte read by LD BX
ORG E0H                ; page 7
  DB 05H               ; byte overwritten by ST [E0H]
ORG 120H               ; page 9
  DB 06H               ; byte overwritten by ST [120H]
ORG 160H               ; page 11
  DB 04H               ; initial byte read by LD DX
ORG 1C0H               ; page 14
  DB 07H               ; byte overwritten by ST [1C0H]
ORG 1E0H               ; page 15
  DB 08H               ; byte overwritten by ST [1E0H]