; Migrated from Programas!A
; Load AX/BX from 80H/81H, add, jump on carry, and write the result.
start:
  LD AX, [80H]
  LD BX, [81H]
  ADD AX, BX
  JC end
  ST [80H], BX
  ST [80H], AX
  JMP start
end:
  HLT