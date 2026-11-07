; Migrated from Programas!O
; Compare AX=03H with BX=08H and store AX at 20H.
  MOV AX, 03H
  MOV BX, 08H
  CMP AX, BX
  ST [20H], AX
  HLT