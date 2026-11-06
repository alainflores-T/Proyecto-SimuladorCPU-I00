; Programa: cmp-store
; ID: 4
; Compara AX=03H con BX=08H y almacena AX en 20H.
; Migrado de Programas!O

  MOV AX, 03H
  MOV BX, 08H
  CMP AX, BX
  ST [20H], AX
  HLT
