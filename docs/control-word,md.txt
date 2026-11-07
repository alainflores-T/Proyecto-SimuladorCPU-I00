# Palabra de control

Vector de 23 bits que la unidad de control emite en cada micro-paso.
El bit más significativo es `En_PC`. Valor HEX de 6 dígitos + sufijo `H`.

Orden: En_PC, Ld_MAR, Mem_R, Mem_W, Ld_MDR, En_MDR, Ld_IR, En_ALU, Ld_AX, En_AX, Ld_BX, En_BX, Ld_CX, En_CX, Ld_DX, En_DX, Ld_PC, En_IR, En_MAR, INC_PC, IO, En_KBD, Ld_LCD.

| Fase / instrucción | Descripción | Señales activas | HEX |
| --- | --- | --- | --- |
| FETCH_1 | PC → MAR | En_PC, Ld_MAR | 600000H |
| FETCH_2 | RAM → MDR (lectura) | Mem_R, Ld_MDR, En_MAR | 140010H |
| FETCH_3a | MDR → IR | En_MDR, Ld_IR | 030000H |
| FETCH_3b | PC + 1 | En_ALU, Ld_PC, INC_PC | 008048H |
| DECODE | Decodificar IR | (ninguna) | 000000H |
| MOV (reg) | Origen → destino (ej. MOV AX, BX) | En_BX, Ld_AX | 002200H |
| MOV (imm) | Inmediato IR → destino (ej. MOV AX, imm) | En_IR, Ld_AX | 002004H |
| ALU | Resultado ALU → destino (ej. AX) | En_ALU, Ld_AX | 00A000H |
| CMP | ALU publica el resultado | En_ALU | 008000H |
| JMP / Jcc tomado | Dirección IR → PC | En_IR, Ld_PC | 000014H |
| Jcc no tomado | No hay transferencia | (ninguna) | 000000H |
| LD T1 | Dirección (IR) → MAR | En_IR, Ld_MAR | 200004H |
| LD T2 | RAM → MDR | Mem_R, Ld_MDR, En_MAR | 140010H |
| LD T3 | MDR → registro (ej. AX) | En_MDR, Ld_AX | 022000H |
| ST T1 | Dirección (IR) → MAR | En_IR, Ld_MAR | 200004H |
| ST T2 | Dato (ej. AX) → MDR | En_AX, Ld_MDR | 041000H |
| ST T3 | MDR → RAM (escritura) | Mem_W, En_MDR, En_MAR | 0A0010H |
| NOP / HLT | Sin transferencias | (ninguna) | 000000H |

`En_MAR` se enciende en lecturas y escrituras porque MAR conduce el bus de direcciones (además de `Mem_R` o `Mem_W`). `En_KBD` y `Ld_LCD` quedan en 0 hasta el I/O (#33–#35).