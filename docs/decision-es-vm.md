# E/S dentro de los 256 B

La RAM física son 256 bytes: 8 marcos de 32. No hay memoria extra.

El marco 7 (E0H–FFH) no puede guardar una página de 32 B y también la E/S. Queda fuera del reemplazo.

| Direcciones | Uso |
| --- | --- |
| 00H–DFH | Marcos 0–6, los únicos elegibles para páginas |
| E0H–EFH | Relleno del marco 7. Está en la matriz. No es página ni otra RAM |
| F0H–F7H | Cola de teclado, 8 B, visible con `readPhysical` |
| F8H–FFH | Vídeo del LCD, 8 B |

`IN` y `OUT` leen y escriben esas celdas por el bus de datos. Una dirección virtual 000H–1FFH no se traduce al marco 7. LOAD, el page-in, el write-back y RESET no modifican F0H–FFH. La caché no guarda esa ventana.

Contadores: 8 marcos físicos, 7 elegibles, 1 reservado.

