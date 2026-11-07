; Program 2. Eight IN [KBD] / OUT [LCD] pairs, then HLT.
; The CPU on develop has no IN or OUT case in faseExecute.
; Issues #33, #34 and #35 are not implemented, so there is no empty-queue
; value and no Enter key code to test. This file does not invent one.
; Expected LCD text cannot be produced until those issues exist.
  MOV CX, 08H          ; eight positions on the 8x1 LCD
echo:
  IN AX, [KBD]         ; read one byte from the keyboard port
  OUT [LCD], AX        ; send that byte to the LCD port
  DEC CX               ; one position filled
  JNZ echo             ; stop after 8 transfers, not on Enter
  HLT                  ; stop. LCD contents are not defined yet