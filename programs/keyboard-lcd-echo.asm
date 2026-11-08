; Program 2. Eight IN [KBD] / OUT [LCD] pairs, then HLT.
; The queue and the LCD live in dedicated 8-byte I/O RAM, not in a page frame.
; An empty IN returns 00H and does not move the queue.
; Expected LCD, when eight bytes were queued first: those eight bytes in order.
  MOV CX, 08H          ; eight positions on the 8x1 LCD
echo:
  IN AX, [KBD]         ; read one byte from the keyboard port
  OUT [LCD], AX        ; send that byte to the LCD port
  DEC CX               ; one position filled
  JNZ echo             ; stop after 8 transfers, not on Enter
  HLT                  ; stop. LCD holds the eight bytes that were queued