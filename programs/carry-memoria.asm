; Programa: carry-memoria
; ID: 1
; Carga AX/BX desde 80H/81H, suma, salta si carry; escribe resultado.
; Migrado de Programas!A (columnas sueltas del Excel original)

inicio:
  LD AX, [80H]
  LD BX, [81H]
  ADD AX, BX
  JC fin
  ST [80H], BX
  ST [80H], AX
  JMP inicio
fin:
  HLT
