# Simulador de CPU

Copia validada en Google Sheets. El motor es el de la rama `cursor/visual-lab-9a2-a0e8`, punta `9ab18d4`. La hoja es la interfaz principal. El diálogo HTML es auxiliar.

Hoja: <https://docs.google.com/spreadsheets/d/1CKb2nxVO2tstUjwY1s5clJ1ME9Di0lNIpk8voLzeS20/edit>

Proyecto de Apps Script de esa copia: `1yTRwU6iB3LEfVmbfgtJ4zxun26nDwDUNQB5t3nJ_WPCnoJQD6WwEQvzD`.

Los originales no se modifican. Esta documentación describe la copia de arriba.

Inglés: [README_EN.md](README_EN.md).

## Qué ejecuta

ISA fija de 2 bytes. Registros PC, MAR, MDR, IR, AX, BX, CX y DX. Banderas ZF, CF y SF. RAM de 256 bytes, swap de 512, páginas de 32. Marcos 0 a 6 paginables. El marco 7 es la VPN 15 y no se reemplaza: ahí están el teclado `F0`–`F7` y el LCD `F8`–`FF`. Caché L1I de 8 bytes, L1D de 8 y L2 directa de 4 líneas de 8, con etiquetas físicas. Un emisor por bus. Dos emisores dejan la fase en `ERROR`.

`STEP` avanza un micro-paso, no una instrucción. `HLT` es el fin normal. Un fallo de página es el camino normal cuando la VPN no está en RAM.

## Instalación

No hace falta una aplicación web. El manifiesto solo lleva estos dos ámbitos:

- `https://www.googleapis.com/auth/spreadsheets.currentonly`
- `https://www.googleapis.com/auth/script.container.ui`

En el proyecto de la copia, ocho archivos `.gs` más `Laboratorio.html` y `appsscript.json`:

`Estado.gs`, `Cache.gs`, `Memoria.gs`, `ES.gs`, `CPU.gs`, `Ensamblador.gs`, `Main.gs`, `Pruebas.gs`, `Laboratorio.html`, `appsscript.json`.

Detalle de botones, teclado y funciones que no reinician la CPU: [docs/manual.md](docs/manual.md).

## Resultados ya medidos en esa copia

Veinte pruebas locales y las mismas veinte en Google: 0 fallos.

| Programa | Fin observado |
| --- | --- |
| P1 | `HLT`, PC `010`, AX `0C`, BX `04`, CX `00`, DX `04`, ZF 1. L1I: 26 aciertos y 2 fallos. |
| P2 | Ocho `IN` y ocho `OUT`. `HOLA` se teclea antes de Run. La cola pasa de `[72, 79, 76, 65]` a vacía. El LCD queda `48 4F 4C 41 00 00 00 00`. Una cola vacía devuelve `00` y no espera. |
| P3 | `HLT`, PC `016`, AX `0A`, BX `02`, CX `03`, DX `04`, MAR `015`, IR `0800`, banderas en 0. 141 micro-pasos, 11 fallos de página `[0, 2, 5, 9, 14, 3, 7, 11, 0, 12, 4]`, un write-back de la VPN 9 en el marco 3. L1I 19/3 (86,4 %), L1D 0 aciertos y 9 fallos (5 lecturas y 4 escrituras), L2 0/12. |

Después del ajuste `9ab18d4`, los 3569 valores leídos de `_ESTADO` no cambiaron (hash `e78adc84` … `860daa`). El listado de P3 muestra `20 40` en `Programas!G5` y la etiqueta `1E0` sigue siendo texto en `PANEL!G53`.

AX de P3 termina en `0A` porque la última carga es `LD AX, [80H]`. La suma anterior queda tapada por esa carga.

## Límites que sí importan

- Stop de la hoja durante un Run no está validado. Dos intentos anteriores terminaron antes de observarlo. Pause, reanudación y Reset sí se probaron en el laboratorio HTML, quieto durante 5 segundos. No es el mismo control.
- La traza guardada es de 200 micro-pasos (`SIM_TRAZA_MAX` en `Estado.gs`). No es 80. El panel muestra los 12 últimos.
- El panel nativo ocupa unos 750 px de un ancho de 1280 y la memoria virtual se ve con scroll. No reproduce el diálogo HTML.
- No hay conmutador HEX/DEC/BIN.
- Quienes usan la copia quitaron protecciones a mano. `simPrepararEstaCopia` puede volver a ponerlas. Compartir el archivo no es lo mismo que esa protección: todas las personas ven la misma CPU.
- El fuente no afirma la nota plena de memoria y caché. Hay 8 marcos físicos y solo 7 paginables.

## Más

- [Manual de instalación y uso](docs/manual.md)
- [Arquitectura](docs/arquitectura.md)
- [ISA](docs/ISA.md)
- [Palabra de control](docs/control-word.md)
- [Resultados de P1, P2 y P3](docs/program-traces.md)
- [Matriz de evidencia y límites](docs/matriz.md)
- [Guía de defensa](docs/GUIA_DEFENSA.md)
- Diagramas sueltos: [docs/diagramas](docs/diagramas)
