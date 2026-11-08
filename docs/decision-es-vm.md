# Decisión: E/S y ocho marcos paginables

Fecha de la decisión: 2026-11-08. Rama `cursor/integracion-correccion-d381`.

## Requisito

La rúbrica pide a la vez:

- RAM física de 256 B en 8 marcos de 32 B, todos paginables.
- 16 páginas virtuales de 32 B (512 B) y swap.
- Cola de teclado de 8 B y vídeo de LCD de 8 B, en RAM, con `IN`/`OUT` por los buses.

Reservar F0H–FFH dentro de los 256 B parte el marco 7. Quedarían 7 marcos de 32 B y un marco recortado. Eso no cumple las dos exigencias a la vez. `RESERVA_ES` sigue en `null` para no etiquetar celdas de O8:AD23 como E/S.

## Política `ram-dedicada-16`

`POLITICA_ES` en `src/Config.gs`:

- 256 B paginables, 8 marcos, 32 B cada uno, `solapaMarcos: false`.
- 16 B adicionales de RAM de E/S: bytes 0–7 cola, bytes 8–15 vídeo.
- Esa RAM vive en `PropertiesService` (`ES_RAM_v1`) y se muestra en la hoja `Perifericos`.
- `IN` conduce el bus de datos con `En_KBD`. `OUT` lo conduce con el registro y carga `Ld_LCD`.
- La caché no guarda esos 16 B. No son direcciones físicas 0..255.
- Un programa paginado y la cola pueden estar activos en la misma sesión.

## Limitación real

Los 16 B no están dentro del arreglo de 256 B. Un `ST` a una dirección virtual no escribe el LCD: eso lo hace `OUT`. El opt-in viejo que usaba F0H/F8H y apagaba la memoria virtual se conserva como adaptador (`ioEnablePersonalOptIn`) y el cargador lo sigue rechazando. Con `POLITICA_ES` ese opt-in no bloquea el `LOAD`.

## Prueba de coexistencia

`tests/run-motor.js` carga el programa de 9 páginas con la MMU encendida, encola 8 bytes y comprueba que `readPhysical(0xF0)` no es el primer byte de la cola. Al terminar el disperso hay 8 páginas presentes. Un acceso posterior a páginas nuevas produce `write-back` de un marco sucio. Eso corre el motor de `develop` con servicios de Google simulados. No se ejecutó en la hoja original.
