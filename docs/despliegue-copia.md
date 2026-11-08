# Despliegue a una copia (la hoja original no se tocó)

La hoja enlazada abajo es la que ya documentaba el repositorio. Esta rama no la modificó ni desplegó el Apps Script.

Hoja: https://docs.google.com/spreadsheets/d/1RnR5stD-B3N6SorOEXixn78WR9USc9oh7loojdVo1MI/edit?usp=sharing

Proyecto de script que el README anterior citaba (no verificado contra este SHA): https://script.google.com/home/projects/14Z9zSg63sOpY7e9bKD3cAHff-_WMHwkqPyQpdqSdh2pGYiVscZlmhNvP/edit

## Pasos en una copia

1. Archivo → Hacer una copia de la hoja.
2. Extensiones → Apps Script. Sustituir los `.gs` por los de `src/` de esta rama. Añadir `Panel.html` con el nombre `Panel` (el archivo `src/Panel.html`).
3. Recargar la hoja. `onOpen` solo crea menús.
4. Menú Simulador → Preparar hojas. No borra una hoja ajena: si `Swap` o `TablaPaginas` existen y no son de este módulo, el instalador se detiene y lo dice.
5. Menú Catalog → Initialize directory. Elegir el programa en `Directory!B1`.
6. Simulador → Cargar programa seleccionado. Eso escribe el swap, elige FIFO, instala la RAM de E/S y vacía los marcos.
7. Para el eco, escribir ocho caracteres con el menú Keyboard → Send key antes de RUN, o encolarlos desde el panel cuando exista ese control en la copia.
8. Abrir el panel. RUN pide lotes de 16 micro-pasos. PAUSE se ve en el lote siguiente. RESET no borra marcos. CLEAR vacía la RAM y la presencia; el swap del último LOAD se queda.

## Pendiente manual en esa copia

- Confirmar que el panel abre y que los colores de HIT/MISS coinciden con el log.
- Cronometrar un RUN completo de los tres programas con el retardo visible (`MOTOR_PULSO_MS` por defecto 40).
- La defensa oral (I3, I4) no está hecha.
