; Programa: contador-cinco
; ID: 3
; Incrementa AX hasta 5 y lo guarda en 20H.
; Migrado de Programas!K

  MOV AX, 00H
loop:
  INC AX
  CMP AX, 05H
  JNZ loop
  ST [20H], AX
  HLT
