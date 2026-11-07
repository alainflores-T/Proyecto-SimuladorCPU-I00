; Mandatory program 1. AX = BX * CX by repeated addition. DX keeps BX.
  MOV AX, 00H
  MOV BX, 04H
  MOV CX, 03H
  MOV DX, BX
loop:
  ADD AX, DX
  DEC CX
  JNZ loop
  HLT