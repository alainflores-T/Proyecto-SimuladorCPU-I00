; Program: carry-memory
; ID: 1
; Loads AX/BX from 80H/81H, adds, branches on carry; writes the result.
; Migrated from Programas!A (loose columns in the original Excel)

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
