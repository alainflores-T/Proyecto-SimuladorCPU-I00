; Demo IN/OUT + ORG/DB (para el ensamblador)
; No viene del Excel; sirve de prueba de directivas y puertos.

ORG 00H
  IN AX, [KBD]
  OUT [LCD], AX
  JMP dato
ORG 100H
dato:
  DB 01H, 02H, 03H
  HLT
