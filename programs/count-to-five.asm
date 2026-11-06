; Program: count-to-five
; ID: 3
; Increments AX up to 5 and stores it at 20H.
; Migrated from Programas!K

  MOV AX, 00H
loop:
  INC AX
  CMP AX, 05H
  JNZ loop
  ST [20H], AX
  HLT
