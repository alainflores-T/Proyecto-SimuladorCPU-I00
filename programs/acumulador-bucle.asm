; Programa: acumulador-bucle
; ID: 2
; Suma 03H cuatro veces en AX usando DEC/JNZ; guarda en 20H.
; Migrado de Programas!H

  MOV AX, 00H
  MOV BX, 04H
bucle:
  ADD AX, 03H
  DEC BX
  JNZ bucle
  ST [20H], AX
  HLT
