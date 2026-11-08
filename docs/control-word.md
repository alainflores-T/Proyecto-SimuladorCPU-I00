# Palabra de control

Vector de 23 bits. El bit más significativo es `En_PC`. El HEX lo calcula `hexDeLista` en `src/Microcodigo.gs`; esta tabla usa esa misma función.

Orden: En_PC, Ld_MAR, Mem_R, Mem_W, Ld_MDR, En_MDR, Ld_IR, En_ALU, Ld_AX, En_AX, Ld_BX, En_BX, Ld_CX, En_CX, Ld_DX, En_DX, Ld_PC, En_IR, En_MAR, INC_PC, IO, En_KBD, Ld_LCD.

| Fase / instrucción | Descripción | Señales activas | HEX |
| --- | --- | --- | --- |
| FETCH_1 | PC → MAR | En_PC, Ld_MAR | 600000H |
| FETCH_2 | RAM → MDR (lectura) | Mem_R, Ld_MDR, En_MAR | 140010H |
| FETCH_3a | MDR → IR | En_MDR, Ld_IR | 030000H |
| FETCH_3b | PC + 1 | En_ALU, Ld_PC, INC_PC | 008048H |
| DECODE | Decodificar IR | (ninguna) | 000000H |
| MOV (reg) | Origen → destino (ej. MOV AX, BX) | En_BX, Ld_AX | 004800H |
| MOV (imm) | Inmediato IR → destino | En_IR, Ld_AX | 004020H |
| ALU | Resultado ALU → destino | En_ALU, Ld_AX | 00C000H |
| CMP | ALU publica el resultado | En_ALU | 008000H |
| JMP / Jcc tomado | Dirección IR → PC | En_IR, Ld_PC | 000060H |
| Jcc no tomado | No hay transferencia | (ninguna) | 000000H |
| LD T1 | Dirección (IR) → MAR | En_IR, Ld_MAR | 200020H |
| LD T2 | RAM → MDR | Mem_R, Ld_MDR, En_MAR | 140010H |
| LD T3 | MDR → registro (ej. AX) | En_MDR, Ld_AX | 024000H |
| ST T1 | Dirección (IR) → MAR | En_IR, Ld_MAR | 200020H |
| ST T2 | Dato (ej. AX) → MDR | En_AX, Ld_MDR | 042000H |
| ST T3 | MDR → RAM | Mem_W, En_MDR, En_MAR | 0A0010H |
| IN | Teclado → registro (ej. AX) | IO, En_KBD, Ld_AX | 004006H |
| OUT | Registro (ej. AX) → LCD | IO, Mem_W, En_AX, Ld_LCD | 082005H |
| NOP / HLT | Sin transferencias | (ninguna) | 000000H |

`En_MAR` se enciende en lecturas y escrituras porque MAR conduce el bus de direcciones. `IN` enciende `IO` y `En_KBD`. `OUT` enciende `IO` y `Ld_LCD`. Si el registro no es AX, el panel en vivo usa el `En_*` / `Ld_*` de ese registro; las filas de la tabla son el ejemplo AX.

Dos `En=1` en el mismo bus no escriben el destino. La CPU queda en `HALT`. `recuperarContencion` suelta los buses a `ZZ` y vuelve a `READY` sin repetir la transferencia.
