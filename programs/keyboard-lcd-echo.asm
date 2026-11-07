; Mandatory program 2. Echo 8 keystrokes from KBD to LCD.
; The ISA has no empty-queue or Enter code yet (keyboard is issue #33).
  MOV CX, 08H
echo:
  IN AX, [KBD]
  OUT [LCD], AX
  DEC CX
  JNZ echo
  HLT