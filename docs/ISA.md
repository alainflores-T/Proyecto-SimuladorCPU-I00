# Instruction Set Architecture (ISA)

CPU de 8 bits con cuatro registros generales (AX, BX, CX, DX) y banderas ZF, CF, SF.

| Mnemónico | Formato | Opcode | Bytes | Banderas | Micro-operaciones |
| --- | --- | --- | --- | --- | --- |
| NOP | NOP | 00 | 1 | - | - |
| MOV | MOV reg, reg / MOV reg, imm | 01 / 11 | 3 | ZF, SF | reg <- src |
| ADD | ADD reg, reg / imm | 02 / 12 | 3 | ZF, CF, SF | reg <- reg + src |
| SUB | SUB reg, reg / imm | 03 / 13 | 3 | ZF, CF (borrow), SF | reg <- reg - src |
| INC | INC reg | 04 | 2 | ZF, CF, SF | reg <- reg + 1 |
| DEC | DEC reg | 05 | 2 | ZF, CF, SF | reg <- reg - 1 |
| CMP | CMP reg, reg / imm | 06 / 16 | 3 | ZF, CF, SF | reg - src (el resultado no se guarda) |
| LD | LD reg, [addr] | 07 | 3-4 | - | MAR <- addr; MDR <- M[MAR]; reg <- MDR |
| ST | ST [addr], reg / imm | 08 / 18 | 3-4 | - | MAR <- addr; MDR <- src; M[MAR] <- MDR |
| JMP | JMP addr | 09 | 2-3 | - | PC <- addr |
| JZ | JZ addr | 0A | 2-3 | - | si ZF=1: PC <- addr |
| JNZ | JNZ addr | 0B | 2-3 | - | si ZF=0: PC <- addr |
| JC | JC addr | 0C | 2-3 | - | si CF=1: PC <- addr |
| JS | JS addr | 0D | 2-3 | - | si SF=1: PC <- addr |
| AND | AND reg, reg / imm | 0E / 1E | 3 | ZF, SF | reg <- reg AND src |
| OR | OR reg, reg / imm | 0F / 1F | 3 | ZF, SF | reg <- reg OR src |
| IN | IN reg, [KBD] | 20 | 3 | - | reg <- cola de teclado |
| OUT | OUT [LCD], reg | 21 | 3 | - | LCD <- reg |
| HLT | HLT | FF | 1 | - | stop |

**Codificación:** opcode + operandos. Se suma 10H al opcode cuando el origen es inmediato.

**Registros:** AX=00, BX=01, CX=02, DX=03. **Puertos:** KBD=00, LCD=01. Esos puertos no son direcciones de los marcos.

**Direcciones:** virtuales de 9 bits, 000H–1FFH (512 B). Por encima de FFH ocupan 2 bytes.

**Memoria:** 8 marcos físicos de 32 B (256 B). La cola de teclado (8 B) y el vídeo del LCD (8 B) están en una RAM de E/S aparte. Ver `docs/decision-es-vm.md`.
