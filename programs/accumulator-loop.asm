; Program: accumulator-loop
; ID: 2
; Adds 03H four times into AX using DEC/JNZ; stores the result at 20H.
; Migrated from Programas!H

  MOV AX, 00H
  MOV BX, 04H
loop:
  ADD AX, 03H
  DEC BX
  JNZ loop
  ST [20H], AX
  HLT
