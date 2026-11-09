# Palabra de control

Volver a [arquitectura.md](arquitectura.md).

Cada micro-paso publica 28 señales, en este orden, cada una en 0 o en 1. El panel las concatena sin espacios. El bit de la izquierda es `En_PC`.

`En_PC`, `Ld_MAR`, `Mem_R`, `Mem_W`, `Ld_MDR`, `En_MDR`, `Ld_IRH`, `Ld_IRL`, `En_ALU`, `Ld_ALU`, `Ld_AX`, `En_AX`, `Ld_BX`, `En_BX`, `Ld_CX`, `En_CX`, `Ld_DX`, `En_DX`, `Ld_PC`, `En_IR`, `En_MAR`, `INC_PC`, `IO`, `En_KBD`, `Ld_LCD`, `ALU2`, `ALU1`, `ALU0`.

Señales que el código enciende en las fases fijas:

| Fase | Señales |
| --- | --- |
| F1 y F4 | `En_PC`, `Ld_MAR`. La dirección interna sale de PC. |
| F2 y F5 | `Mem_R`, `En_MAR`, `Ld_MDR`, `INC_PC`. PC aumenta. |
| F3 | `En_MDR`, `Ld_IRH`. |
| F6 | `En_MDR`, `Ld_IRL`. |
| DECODE | Ninguna transferencia. Publica el texto de la instrucción. |

En Execute las señales dependen de la operación. La ALU usa `ALU2`, `ALU1` y `ALU0` con este código: MOV 0, ADD 1, SUB 2, AND 3, OR 4, CMP 5, INC 6, DEC 7. CMP enciende la ALU y no carga el registro destino. `IN` enciende `IO`, `Mem_R` y `En_KBD`. `OUT` enciende `IO`, `Mem_W` y `Ld_LCD`.

Un borrador anterior listaba 23 señales y un `Ld_IR` único, con códigos hexadecimales de 6 dígitos. Ese vector no es el de `SIM_SENALES`. Este archivo no repite esos hexadecimales.
