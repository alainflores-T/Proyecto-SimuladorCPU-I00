; Program: cmp-store
; ID: 4
; Compares AX=03H with BX=08H and stores AX at 20H.
; Migrated from Programas!O

  MOV AX, 03H
  MOV BX, 08H
  CMP AX, BX
  ST [20H], AX
  HLT
