; Program: cmp-double-hlt
; ID: 5
; If AX==[10H] writes FFH; otherwise 00H. Two HLT exits.
; Migrated from Programas!R

  MOV AX, 0AH
  LD BX, [10H]
  CMP AX, BX
  JZ equal
  ST [30H], 00H
  HLT
equal:
  ST [30H], FFH
  HLT
