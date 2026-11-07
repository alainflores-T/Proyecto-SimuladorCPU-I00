; Migrated from Programas!K
; Increment AX until 5 and store it at 20H.
  MOV AX, 00H
loop:
  INC AX
  CMP AX, 05H
  JNZ loop
  ST [20H], AX
  HLT