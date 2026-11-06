; Programa: cmp-doble-hlt
; ID: 5
; Si AX==[10H] escribe FFH; si no, 00H. Dos salidas HLT.
; Migrado de Programas!R

  MOV AX, 0AH
  LD BX, [10H]
  CMP AX, BX
  JZ iguales
  ST [30H], 00H
  HLT
iguales:
  ST [30H], FFH
  HLT
