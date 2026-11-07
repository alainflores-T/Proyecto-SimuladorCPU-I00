; Migrated from Programas!R
; If AX equals [10H], store FFH; otherwise store 00H. Two HLT exits.
  MOV AX, 0AH
  LD BX, [10H]
  CMP AX, BX
  JZ equal
  ST [30H], 00H
  HLT
equal:
  ST [30H], FFH
  HLT