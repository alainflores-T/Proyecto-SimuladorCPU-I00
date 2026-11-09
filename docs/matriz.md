# Evidencia y límites

Volver a [README.md](../README.md). No es una rúbrica ni una nota.

| Tema | Qué se observó | Dónde | Límite |
| --- | --- | --- | --- |
| Veinte casos | 0 fallos en local y en Google. | `Pruebas.gs` y la corrida en la copia. | No cubren el Stop de la hoja durante Run. |
| P1 | `HLT`, PC `010`, AX `0C`, BX `04`, CX `00`, DX `04`, ZF 1. L1I 26/2. | Hoja, después de Load y Run. | No se archivó aquí el detalle de L1D ni de L2 de P1. |
| P2 | Ocho `IN` y ocho `OUT`. `HOLA` antes de Run. Cola 72 79 76 65 y luego vacía. LCD `48 4F 4C 41` y cuatro ceros. Borrar funciona. Cola vacía devuelve `00`. | Hoja, pestaña PERIFERICOS y RAM `F0`–`FF`. | Hay que teclear antes de Run. `IN` no espera. |
| P3 | `HLT`, PC `016`, AX `0A`, BX `02`, CX `03`, DX `04`, MAR `015`, IR `0800`, banderas 0, 141 pasos, 11 fallos en el orden indicado, un write-back. | Hoja, antes y después de `9ab18d4`. | El rótulo de último fallo se queda en VPN 4, marco 3. Es histórico. |
| Estado tras `9ab18d4` | 3569 celdas de `_ESTADO`, diferencia 0. Hash `e78adc84` … `860daa`. | Lectura de la copia. | El hash no se recalcula en este documento. |
| Listado y etiqueta | `G5` es el texto `20 40`. `G53` es el texto `1E0`. | Copia después de alinear y de preparar. | Un valor viejo puede seguir siendo fecha o número hasta que se reescriba con formato de texto. |
| Marcos | 8 físicos, 7 paginables, marco 7 fijo. | `Memoria.gs`. El propio catálogo de P3 dice que no se afirma la nota plena. | Este archivo no convierte esa frase en una calificación. |
| Traza | Tope 200 micro-pasos en código y en la pestaña TRACE. El panel muestra 12. | `SIM_TRAZA_MAX`. | No es un tope de 80. |
| Stop de la hoja | No observado durante un Run. Dos intentos acabaron antes. | Uso de la copia. | Pause del diálogo HTML sí se observó quieta 5 segundos. No sustituye esta prueba. |
| Step | Un micro-paso. | `simMicroPaso`. | Una instrucción de dos bytes son varios Step. |
| Panel | Unos 750 px útiles dentro de 1280, con scroll para la VM. | La copia. | No es el diálogo HTML y no tiene conmutador HEX/DEC/BIN. |
| Protecciones | El código de preparar las reinstala. En la copia se quitaron a mano después. | `simProteger_`. | No se prometen protecciones activas. Compartir el archivo no es esa protección. |
| Varias personas | Una sola imagen en `_ESTADO`, con un candado de documento alrededor del paso. | `simConCandado_`. | No hay un protocolo de concurrencia aparte de ese candado. |
| Ámbitos | Hoja actual e interfaz del contenedor. | `appsscript.json`. | No hay aplicación web. |
