; IN/OUT + ORG/DB demo (for the assembler)
; Not from the Excel sheet; exercises directives and ports.

ORG 00H
  IN AX, [KBD]
  OUT [LCD], AX
  JMP data
ORG 100H
data:
  DB 01H, 02H, 03H
  HLT
