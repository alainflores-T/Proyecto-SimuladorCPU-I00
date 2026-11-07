; Program 1. AX = BX * CX by repeated addition. DX keeps the original BX.
; Expected after HLT, if the CPU runs this text: AX=0CH, BX=04H, CX=00H, DX=04H, ZF=1.
; No memory operand, so this program alone cannot raise a page fault or a cache miss.
  MOV AX, 00H          ; AX = 0, the product
  MOV BX, 04H          ; BX = 4, the multiplicand
  MOV CX, 03H          ; CX = 3, the loop counter
  MOV DX, BX           ; DX = 4, a copy of BX that the loop does not change
loop:
  ADD AX, DX           ; AX = AX + DX
  DEC CX               ; CX = CX - 1. ZF becomes 1 when CX reaches 0
  JNZ loop             ; repeat while CX is not 0
  HLT                  ; stop. AX should be 0CH