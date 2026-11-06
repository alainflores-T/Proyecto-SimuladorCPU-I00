# Pruebas Node (ensamblador y catálogo)

Apps Script no trae runner de tests. Estas pruebas cargan los `.gs` con `vm`
(solo la lógica pura; las funciones que llaman a `SpreadsheetApp` no se ejecutan).

## Cómo correrlas

```bash
npm test
```

Requiere Node >= 18.

## Qué cubren

- Ensamblado de los programas en `/programs/*.asm` sin errores
- Listing Address | HEX | Source
- Ida y vuelta ensamblar → desensamblar → re-ensamblar (mismos bytes)
- Directivas `ORG` / `DB` y puertos IN/OUT
- Contador del catálogo (#instr, bytes, páginas = ceil/toques de 32 B)
- Migración por defecto de las 5 columnas A/H/K/O/R

## En tu copia de la Sheet

1. Copia el proyecto Apps Script (no hagas `clasp push` sobre el proyecto compartido).
2. Añade `Assembler.gs`, `Disassembler.gs`, `Catalog.gs`.
3. Ejecuta `catalogInicializarDirectorio` y `ensamblarYMostrarListing`.
