# ISA

Volver a [arquitectura.md](arquitectura.md).

Todas las instrucciones ocupan 2 bytes. El fetch siempre lee los dos.

Byte 0: opcode de 5 bits en las posiciones 7 a 3, registro destino en los bits 2 y 1, y el bit 8 de la dirección en el bit 0.

Byte 1: inmediato, parte baja de la dirección, o registro fuente en los dos bits bajos.

`b0 = (opcode << 3) | (registro << 1) | A8`. Registros: AX 0, BX 1, CX 2, DX 3.

| Mnemónico | Opcode | Forma | Banderas |
| --- | --- | --- | --- |
| NOP | 0 | `NOP` | no |
| HLT | 1 | `HLT` | no |
| MOV inmediato | 2 | `MOV reg, imm` | no |
| MOV registro | 3 | `MOV reg, reg` | no |
| LD | 4 | `LD reg, [dir]` | no |
| ST | 5 | `ST [dir], reg` | no |
| ADD inmediato | 6 | `ADD reg, imm` | ZF, CF, SF |
| ADD registro | 7 | `ADD reg, reg` | ZF, CF, SF |
| SUB inmediato | 8 | `SUB reg, imm` | ZF, CF, SF |
| SUB registro | 9 | `SUB reg, reg` | ZF, CF, SF |
| AND inmediato | 10 | `AND reg, imm` | ZF, SF. CF no cambia |
| AND registro | 11 | `AND reg, reg` | ZF, SF. CF no cambia |
| OR inmediato | 12 | `OR reg, imm` | ZF, SF. CF no cambia |
| OR registro | 13 | `OR reg, reg` | ZF, SF. CF no cambia |
| CMP inmediato | 14 | `CMP reg, imm` | ZF, CF, SF. No escribe el registro |
| CMP registro | 15 | `CMP reg, reg` | ZF, CF, SF. No escribe el registro |
| INC | 16 | `INC reg` | ZF, CF, SF |
| DEC | 17 | `DEC reg` | ZF, CF, SF |
| JMP | 18 | `JMP dir` | no |
| JZ | 19 | `JZ dir` | no |
| JNZ | 20 | `JNZ dir` | no |
| JC | 21 | `JC dir` | no |
| IN | 22 | `IN reg, [KBD]` | no |
| OUT | 23 | `OUT [LCD], reg` | no |

No hay `JS`. CF de una resta es 1 si el resultado es negativo antes de quedarse en 8 bits. SF es el bit 7 del resultado. ZF es el resultado en cero. MOV no toca las banderas.

`LD`, `ST`, los saltos y `DB` rechazan la ventana `1E0`–`1FF`. Esa ventana es la E/S de la VPN 15. Para el teclado y el LCD se usan `IN` y `OUT`.

Ejemplo medido en el listado de P3: `LD AX, [40H]` queda `20 40`. Opcode 4, registro 0 y dirección `040` dan el byte alto `20` y el bajo `40`. `HLT` queda `08 00`, que es el IR `0800` al final de P3.

Un borrador anterior de este archivo describía opcodes de un byte, instrucciones de hasta 4 bytes y la bandera JS. Eso no es este motor.
