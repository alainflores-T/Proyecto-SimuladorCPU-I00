; Migrated from Programas!H
; Add 03H four times into AX. BX is the counter.
  MOV AX, 00H
  MOV BX, 04H
loop:
  ADD AX, 03H
  DEC BX
  JNZ loop
  ST [20H], AX
  HLT