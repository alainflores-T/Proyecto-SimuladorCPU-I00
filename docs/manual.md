# Instalación y uso

Volver a [README.md](../README.md). Arquitectura: [arquitectura.md](arquitectura.md).

La hoja principal es la copia <https://docs.google.com/spreadsheets/d/1CKb2nxVO2tstUjwY1s5clJ1ME9Di0lNIpk8voLzeS20/edit>. El proyecto de script de esa copia es `1yTRwU6iB3LEfVmbfgtJ4zxun26nDwDUNQB5t3nJ_WPCnoJQD6WwEQvzD`. No despliegue una aplicación web.

## Archivos

Pegue estos diez archivos en el proyecto de la copia, con el mismo nombre:

| Archivo | Papel |
| --- | --- |
| `Estado.gs` | Imagen única: registros, RAM, swap, tabla, caché, traza. |
| `Cache.gs` | L1I, L1D y L2. |
| `Memoria.gs` | Traducción, FIFO y fallo de página. |
| `ES.gs` | Cola de 8 y LCD de 8. |
| `CPU.gs` | Un micro-paso por llamada. |
| `Ensamblador.gs` | Catálogo P1, P2 y P3, y el ensamblador. |
| `Main.gs` | Menú, panel, teclado y diálogo. |
| `Pruebas.gs` | Veinte casos. |
| `Laboratorio.html` | Diálogo auxiliar. |
| `appsscript.json` | Zona `America/La_Paz` y los dos ámbitos de abajo. |

Ámbitos, y ningún otro:

- `https://www.googleapis.com/auth/spreadsheets.currentonly`
- `https://www.googleapis.com/auth/script.container.ui`

## Primera vez

1. Abra Extensiones, Apps Script, en la copia. No use el proyecto de una hoja original.
2. Sustituya o cree los diez archivos. Guarde.
3. En el editor elija `simPrepararEstaCopia` y pulse Ejecutar. Acepte el consentimiento de la hoja y, si sale, el de la interfaz del contenedor.
4. Si el editor de Programas no coincide con el programa que ya está en la CPU, ejecute `simAlinearEditorAlEstado`. No ejecute Load para eso.
5. Recargue la hoja. El menú Simulador aparece al abrirla.
6. El laboratorio se abre desde el menú de la hoja: Simulador, Laboratorio visual. No es una página web. Si el consentimiento del diálogo no salió en el paso 3, ejecute una vez `simAbrirLab` desde el editor de esa misma copia y acepte. Esa función solo abre el diálogo.

`simPrepararEstaCopia` vuelve a pintar PANEL, PERIFERICOS y TRACE. Si `_ESTADO` ya tiene la marca `SIM-ESTADO-v1`, no borra la imagen. También puede volver a instalar la protección de hoja que alguien hubiera quitado a mano. Compartir el archivo con otra persona es otro permiso: no equivale a esa protección, y las dos personas mueven la misma CPU.

`simAlinearEditorAlEstado` lee el identificador guardado (`P1`, `P2` o `P3`) y reescribe la fuente y el listado desde el catálogo. No escribe `_ESTADO`. Si el identificador no es uno de esos tres, deja el editor como está.

## Controles

En el panel, las casillas son los controles que de verdad disparan el motor:

| Control | Efecto |
| --- | --- |
| STEP | Un micro-paso. No es una instrucción completa. |
| RUN | Varios micro-pasos, en lotes, hasta `HLT`, `ERROR`, la pausa o el tope de tiempo. |
| LOAD | Carga el demo elegido en Cargar. Sustituye la imagen de la CPU y copia ese demo al editor y al listado. |
| PAUSE | Pone la pausa en la hoja. Durante un Run largo de la hoja, este Stop no quedó validado. |
| RESET | Vuelve a F1 con PC 0 y conserva el programa y el swap. |
| Cargar | Solo elige P1, P2 o P3. No carga hasta LOAD. |
| En CPU | Muestra el programa guardado en `_ESTADO`. |
| DELAY | Pausa del diálogo HTML, en milisegundos. |

El menú repite Step, Run, Stop, Reset, Cargar selector, Alinear editor al programa en CPU, Ensamblar, Cargar editor, Teclear, Limpiar cola, Editar memoria, Correr pruebas en memoria y Laboratorio visual.

Cargar editor ensambla lo que haya escrito en Programas y lo mete en el swap. No es lo mismo que LOAD de un demo. Preparar la copia no reescribe esa fuente.

## Teclado y LCD

La pestaña PERIFERICOS tiene filas QWERTY, Espacio y Borrar. Cada tecla es una celda. La casilla de debajo también encola. Ocho posiciones en `F0`–`F7`. La novena no entra. Borrar saca la última tecla que aún no se leyó.

`IN` con la cola vacía entrega `00` y no mueve la cabeza. No espera una tecla. Por eso, en P2, `HOLA` se escribe antes de Run.

El LCD ocupa `F8`–`FF`, ocho caracteres. Un noveno `OUT` no pasa de `FF`. Esas direcciones no pasan por la caché.

## Laboratorio HTML

Es una vista del mismo `_ESTADO`. Step pide un micro-paso, lo dibuja y espera. Pause no pide el siguiente. En la copia se probó esa pausa durante 5 segundos sin un avance tardío, y también la reanudación y Reset. No use esa prueba como evidencia del Stop de la hoja durante Run.

## Qué no hacer si quiere conservar el P3 ya medido

No pulse LOAD, Reset ni Run. LOAD vuelve a cargar el demo desde cero. Para revisar el estado que ya está en `HLT`, mire el panel. Para alinear solo el texto de Programas, use `simAlinearEditorAlEstado`.
