# Guía de defensa

Volver a [README.md](../README.md). Cifras: [program-traces.md](program-traces.md). Límites: [matriz.md](matriz.md). Diagramas: [arquitectura.md](arquitectura.md).

La copia que se enseña es <https://docs.google.com/spreadsheets/d/1CKb2nxVO2tstUjwY1s5clJ1ME9Di0lNIpk8voLzeS20/edit>. Si esa copia sigue en el P3 de la validación, se puede mostrar sin volver a ejecutar. Load, Reset y Run sustituyen esa imagen.

## Versión de 8 minutos

1. Un minuto. La hoja es el simulador. El diálogo HTML es una vista del mismo estado. Una instrucción son 2 bytes. Step es un micro-paso.
2. Dos minutos. Señalar registros a la izquierda, ALU debajo, RAM a la derecha. Marcos 0 a 6 paginables y marco 7 fijo para teclado y LCD. Un emisor por bus.
3. Tres minutos. P1 ya cargado o, si piden verlo nacer, Load de P1 y Run. Leer PC `010`, AX `0C`, BX `04`, CX `00`, DX `04`, ZF 1. `0C` es 4 por 3.
4. Dos minutos. P3 en `HLT`: 141 micro-pasos, 11 fallos de página, un write-back de la VPN 9 en el marco 3. AX `0A` es la última carga, no la suma. El rótulo de último fallo es histórico.

## Versión de 12 minutos

Se añade lo siguiente, sin cambiar el orden.

- Después de la geometría, un minuto para el ciclo F1 a F6, Decode y Execute, y el desvío PF1, PF2 si la víctima está sucia, PF3 y PF4. Diagrama en [arquitectura.md](arquitectura.md).
- P2 completo, unos dos minutos. Load de P2. Antes de Run, en PERIFERICOS, las teclas H, O, L y A. La cola debe mostrar 72, 79, 76 y 65. Run. La cola queda vacía y el LCD `48 4F 4C 41 00 00 00 00`. Decir que las otras cuatro lecturas devuelven `00` porque la cola no espera.
- Medio minuto de caché de P3: L1I 19 y 3, L1D 0 y 9, L2 0 y 12. 3 más 9 son 12. Las direcciones `E0` a `FF` no entran en esas tasas.
- Medio minuto de límites: Stop de la hoja durante Run no se validó. La traza guarda 200 micro-pasos, no 80. El panel no copia el diálogo al píxel.

Si el tiempo se acaba en P1, se cita el P3 con la tabla de [program-traces.md](program-traces.md) y no se relanza.

## Pasos, si hay que ejecutar

Parta de una copia preparada. No hace falta una aplicación web.

P1. En el panel, Cargar = P1. LOAD. Run. Espere `HLT`. Lea PC `010`, AX `0C`, BX `04`, CX `00`, DX `04` y ZF 1. L1I puede mostrar 26 aciertos y 2 fallos.

P2. Cargar = P2. LOAD. No pulse Run todavía. Abra PERIFERICOS y pulse H, O, L, A. La cola debe ser 72, 79, 76, 65 y la cuenta 4. Si se equivoca, Borrar quita la última. Vuelva al panel y pulse Run. Al terminar, la cuenta es 0 y el LCD muestra H, O, L, A y cuatro posiciones vacías. En hexadecimal de la RAM: `48 4F 4C 41 00 00 00 00`.

P3. Cargar = P3. LOAD. Run. Espere `HLT`. Lea PC `016`, AX `0A`, BX `02`, CX `03`, DX `04`, MAR `015`, IR `0800` y banderas en 0. El contador de pasos queda en 141. La lista de fallos es 0, 2, 5, 9, 14, 3, 7, 11, 0, 12, 4. Write-backs: 1. Caché como en la versión de 12 minutos.

LOAD borra la imagen anterior. Si el tribunal solo quiere ver el P3 ya medido, no lo pulse.

## Preguntas

**¿Por qué AX de P3 no es 3?** Porque `LD AX, [80H]` se ejecuta después de la suma. En `80H` está `0A`. BX, CX y DX conservan 02, 03 y 04.

**¿Por qué IR es 0800 y PC es 016?** `HLT` se codifica `08 00`. El fetch ya sumó los dos bytes, así que PC queda en `016` y MAR se queda en `015`, la dirección del byte bajo.

**¿El fallo de página es un error?** No. `HLT` es el fin normal. El fallo es el camino PF1 a PF4 cuando la página no está. El texto «Último fallo» permanece después del `HLT`.

**¿Por qué solo siete marcos si la RAM tiene ocho?** El octavo es el marco 7, reservado a la VPN 15. El teclado y el LCD viven ahí y no se desalojan. El fuente dice que con eso no se afirma la nota plena de memoria y caché. Esta guía no pone una nota.

**¿Por qué IN no se bloquea?** La cola vacía entrega `00` y no mueve la cabeza. Por eso `HOLA` entra antes de Run. Las cuatro vueltas que sobran escriben ceros en el LCD.

**¿Step ejecuta una instrucción?** No. Ejecuta la fase actual: F1, F2, un PF3, y así. Una instrucción de dos bytes son varios Step, y más si hay fallo de página.

**¿Probaron Stop?** El Stop de la hoja mientras Run sigue en marcha no quedó validado. Pause, reanudar y Reset sí se probaron en el laboratorio HTML: la pausa no pidió otro paso durante 5 segundos. Son controles distintos.

**¿La traza es de 80?** No. `SIM_TRAZA_MAX` es 200. El panel muestra 12. P3 usó 141 y cupo en la traza.

**¿Por qué la hoja no se ve como el diagrama HTML?** El panel es la interfaz que se califica en la hoja. Cabe en unos 750 px de 1280 y la memoria virtual se lee haciendo scroll. El diálogo es auxiliar. No hay selector HEX/DEC/BIN.

**¿G5 y 1E0?** `20 40` es el texto del primer `LD` de P3. `1E0` es una etiqueta de fila. Si Sheets las guarda como fecha o como número, hay que reescribirlas con formato de texto. Preparar y alinear el editor hacen eso. No cambian la imagen si se usan las funciones indicadas en el [manual](manual.md).

**¿Pueden usarla dos personas?** Pueden abrir el mismo archivo. Ven la misma `_ESTADO`. El paso usa el candado del documento. No hay otra cola ni otra CPU. Quitar la protección de la hoja, como se hizo en la copia, no crea ese aislamiento. Volver a ejecutar `simPrepararEstaCopia` puede reinstalar la protección.

**¿Hace falta publicar una web?** No. Los ámbitos son la hoja actual y la interfaz del contenedor. El laboratorio se abre desde el menú de la hoja.

## Glosario

| Término | Sentido en este simulador |
| --- | --- |
| Micro-paso | Una fase: F1, F2, PF3, Decode, y las demás. |
| HLT | Fin normal. La fase queda `HALT`. |
| Fallo de página | La VPN no está en un marco. No es la fase `ERROR`. |
| Write-back | PF2 copia 32 bytes del marco víctima al swap porque estaba sucio. |
| FIFO | Sale la página presente con menor `orden`. |
| Marco 7 | VPN 15 fija. Teclado `F0`–`F7` y LCD `F8`–`FF`. |
| BYPASS | Acceso a `E0`–`FF`. No suma acierto ni fallo de caché. |
| Step | Un micro-paso desde el panel o el diálogo. |
| Load | Sustituye la CPU por el demo elegido y alinea editor y listado. |
| Alinear editor | Copia el catálogo del programa ya guardado. No toca la CPU. |
| En CPU | El identificador guardado en el estado, no el texto suelto del editor. |
