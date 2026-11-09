# P1, P2 y P3

Volver a [README.md](../README.md). Defensa: [GUIA_DEFENSA.md](GUIA_DEFENSA.md).

Cifras leídas en la copia después de Load y Run, y conservadas tras `9ab18d4` en el caso de P3. No son una predicción de un borrador viejo. Ese borrador decía que el fetch no ejecutaba la imagen. La copia validada sí la ejecuta: las veinte pruebas dieron 0 fallos y los tres programas llegaron a `HLT`.

## P1

`AX = BX * CX` por sumas. DX conserva BX. Al terminar: PC `010`, AX `0C`, BX `04`, CX `00`, DX `04`, ZF 1. L1I: 26 aciertos y 2 fallos. `0C` es 12, que es 4 por 3. PC `010` es 16 en decimal: ocho instrucciones de 2 bytes.

## P2

`MOV CX, 08H` y ocho vueltas de `IN` / `OUT` / `DEC` / `JNZ`. Hay que encolar `HOLA` antes de Run. La cola muestra 72, 79, 76 y 65, que son H, O, L y A. Después del Run la cola queda vacía y el LCD queda `48 4F 4C 41 00 00 00 00`. Las cuatro lecturas que sobran, porque el lazo pide ocho bytes y solo había cuatro, devuelven `00` sin esperar y sin mover la cabeza. Borrar, usado antes de consumir la cola, saca la última tecla.

## P3

Once accesos a páginas distintas, sin usar la VPN 15. Datos: `40` vale 01, `A0` vale 02, `60` vale 03, `160` vale 04, `80` vale 0A. La suma `01+02` se guarda, y después `LD AX, [80H]` deja AX en `0A`. BX queda `02`, CX `03` y DX `04`.

Fin: `HLT`, PC `016`, MAR `015`, IR `0800`, banderas en 0. 141 micro-pasos. Fallos de página, en orden: 0, 2, 5, 9, 14, 3, 7, 11, 0, 12, 4. Un write-back: VPN 9, marco 3. Caché: L1I 19 y 3 (86,4 %), L1D 0 y 9, L2 0 y 12.

`IR 0800` es el `HLT` (`08 00`). MAR `015` es la dirección del byte bajo de esa instrucción. PC ya avanzó a `016` durante el fetch. No es un registro a medias.

El primer renglón del listado, `LD AX, [40H]`, es el texto `20 40` en `Programas!G5`. La etiqueta de fila `1E0` del mapa de la memoria virtual es el texto `1E0`, no el número 1.
