# Arquitectura

Volver a [README.md](../README.md). Manual: [manual.md](manual.md). ISA: [ISA.md](ISA.md). Palabra de control: [control-word.md](control-word.md).

La imagen vive en la hoja oculta `_ESTADO`. PANEL, Programas, PERIFERICOS y TRACE leen o escriben esa imagen. No hay una segunda RAM. El diálogo `Laboratorio.html` pide el mismo estado por `simLabPaso` y `simLabEstado`.

Fuente del diagrama: [diagramas/arquitectura.mmd](diagramas/arquitectura.mmd).

```mermaid
flowchart LR
  subgraph hoja [Hoja de calculo]
    PANEL[PANEL]
    PROG[Programas]
    PERI[PERIFERICOS]
    TRACE[TRACE 200]
  end
  subgraph estado [Unica imagen]
    EST[_ESTADO]
  end
  subgraph cpu [CPU]
    REG[PC MAR MDR IR AX BX CX DX]
    ALU[ALU y banderas]
    UC[Unidad de control]
  end
  subgraph mem [Memoria]
    MMU[MMU]
    RAM[RAM 256 B]
    SWAP[Swap 512 B]
    TABLA[16 paginas de 32 B]
  end
  subgraph cache [Cache fisica]
    L1I[L1I 8 B]
    L1D[L1D 8 B]
    L2[L2 4 x 8 B]
  end
  subgraph es [Marco 7 fijo]
    FIFO[FIFO F0-F7]
    LCD[LCD F8-FF]
  end
  PANEL --> EST
  PROG --> EST
  PERI --> EST
  TRACE --> EST
  EST --> REG
  REG --> ALU
  UC --> REG
  REG --> MMU
  MMU --> L1I
  MMU --> L1D
  L1I --> L2
  L1D --> L2
  L2 --> RAM
  RAM <--> SWAP
  TABLA --> MMU
  MMU --> FIFO
  MMU --> LCD
```

## Ciclo

Cada llamada a `simMicroPaso` ejecuta la fase actual y deja la siguiente. Fetch lee dos bytes. El alto entra en F2 y el bajo en F5. PC aumenta en cada una de esas lecturas. Decode no mueve registros. Execute depende del opcode. `HLT` pasa a `HALT` y ahí se queda.

Si la VPN no está presente, ese paso se anota como PF1 y elige marco. La víctima sucia pasa por PF2 antes de PF3. PF4 actualiza la tabla, invalida las líneas de caché de ese marco y reanuda F2, F5 o EX, según dónde se cortó el acceso.

Fuente: [diagramas/ciclo.mmd](diagramas/ciclo.mmd).

```mermaid
flowchart TD
  F1["F1: PC a MAR"] --> F2["F2: lee el byte alto y PC mas 1"]
  F2 -->|pagina presente| F3["F3: MDR a IR alto"]
  F3 --> F4["F4: PC a MAR"]
  F4 --> F5["F5: lee el byte bajo y PC mas 1"]
  F5 -->|pagina presente| F6["F6: MDR a IR bajo"]
  F6 --> DEC["DECODE"]
  DEC --> EX["EX"]
  EX -->|instruccion comun| F1
  EX -->|HLT| HALT["HALT fin normal"]
  F2 -->|ausente| PF1["PF1: elige marco"]
  F5 -->|ausente| PF1
  EX -->|LD o ST ausente| PF1
  PF1 -->|victima sucia| PF2["PF2: 32 B de RAM a swap"]
  PF1 -->|marco libre o victima limpia| PF3["PF3: 32 B de swap a RAM"]
  PF2 --> PF3
  PF3 --> PF4["PF4: tabla, invalida cache y reanuda"]
  PF4 -->|reanuda fetch| F2
  PF4 -->|reanuda fetch| F5
  PF4 -->|reanuda dato| EX
```

## Traducción y reemplazo

La dirección virtual tiene 9 bits. La VPN son los bits 8 a 5 y el desplazamiento los bits 4 a 0. La dirección física es `PFN * 32 + desplazamiento`, de 8 bits. Hay 16 páginas. Los marcos 0 a 6 se reemplazan. El marco 7 pertenece a la VPN 15, está siempre presente y no puede ser víctima. Un fallo pedido sobre la VPN 15 termina en `ERROR`.

La política guardada con los programas es FIFO: sale la página con menor `orden`. El código también sabe elegir por `uso` si la política es `LRU`. Esa política no es la de P1, P2 ni P3, y no se midió en la hoja.

En el P3 medido hubo 11 fallos, en este orden de VPN: 0, 2, 5, 9, 14, 3, 7, 11, 0, 12, 4. Los siete primeros ocupan los marcos 0 a 6. Los cuatro siguientes reemplazan. El único write-back fue la VPN 9, sucia, al salir del marco 3 cuando entró la VPN 4. El rótulo «Último fallo» se queda en el último evento. No significa que la CPU siga en fallo: P3 termina en `HLT`.

Fuente: [diagramas/paginacion.mmd](diagramas/paginacion.mmd).

```mermaid
flowchart TD
  VA["VA de 9 bits"] --> CORTE["VPN VA 8 a 5 y offset VA 4 a 0"]
  CORTE --> PRESENTE{"Bit P de la VPN"}
  PRESENTE -->|si| PA["PA = PFN por 32 mas offset"]
  PRESENTE -->|no y VPN distinta de 15| LIBRE{"Hay marco 0 a 6 libre"}
  PRESENTE -->|VPN 15| FIJA["Marco 7 siempre presente"]
  LIBRE -->|si| CARGA["PF3 carga la pagina"]
  LIBRE -->|no| FIFO["Victima FIFO: menor orden"]
  FIFO --> SUCIO{"Dirty"}
  SUCIO -->|si| WB["PF2 escribe 32 B en el swap"]
  SUCIO -->|no| CARGA
  WB --> CARGA
  CARGA --> TABLA["PF4 instala PFN y limpia la victima"]
  TABLA --> INV["Invalida lineas de cache de ese marco"]
  INV --> PA
  FIJA --> MMIO["F0-F7 teclado y F8-FF LCD sin cache"]
```

## Caché y buses

Hay cuatro buses de datos o dirección y las líneas RD, WR, CK e IO. Cada bus tiene un emisor. Si dos quieren escribir, el paso pasa a `ERROR` y no actualiza el destino.

L1I y L1D tienen una línea de 8 bytes. L2 es directa, índice `(PA >> 3) & 3`, etiqueta física `PA >> 5`. Se consulta después de la MMU. Escritura inmediata y asignación en fallo. La línea no tiene bit dirty. Un acierto de escritura en L1D actualiza la RAM y, si la línea de L2 coincide, también ese byte. Ese mantenimiento suma `mant` y no entra en la tasa de L2. L2 solo cuenta la demanda que llega por un fallo de L1.

Las direcciones físicas `E0`–`FF` no consultan la caché. El contador anota `BYPASS`. Al reemplazar un marco se invalidan las líneas cuya base cae en esos 32 bytes.

En el P3 medido: L1I 19 aciertos y 3 fallos (86,4 %), L1D 0 aciertos y 9 fallos (5 de `LD` y 4 de `ST`), L2 0 aciertos y 12 fallos. 3 + 9 = 12.

Fuente: [diagramas/cache-buses.mmd](diagramas/cache-buses.mmd).

```mermaid
flowchart LR
  subgraph buses [Buses un emisor]
    DI["Direccion interna 9 b"]
    DATI["Datos internos 8 b"]
    DE["Direccion fisica 8 b"]
    DATE["Datos externos 8 b"]
    CTRL["RD WR CK IO"]
  end
  CPU[CPU] --> DI
  CPU --> DATI
  DI --> MMU[MMU]
  MMU --> DE
  DE --> L1{"PA en E0-FF"}
  L1 -->|no| L1I[L1I o L1D de 8 B]
  L1I -->|miss| L2["L2 directa 4 lineas de 8 B"]
  L2 -->|miss| RAM[RAM]
  L1 -->|si| BYPASS["Sin cache: cuenta BYPASS"]
  BYPASS --> RAM
  RAM --> DATE
  DATE --> CPU
  CPU --> CTRL
```

## Teclado y LCD

La cola es circular de 8 bytes en `F0`–`F7`, con cabeza, cola y cuenta. Borrar retrocede la cola y pone ese byte en 0. `IN` lee la cabeza. Si la cuenta es 0, el registro destino recibe `00` y la cabeza no se mueve. `OUT` escribe en `F8` más el cursor, hasta 8 caracteres. El noveno `OUT` no avanza. Ninguno de los dos pasa por L1 ni por L2.

Fuente: [diagramas/es.mmd](diagramas/es.mmd).

```mermaid
flowchart TD
  TECLA["Tecla QWERTY Espacio o Borrar"] --> LLENA{"Cuenta menor que 8"}
  LLENA -->|no| RECHAZO["La novena no entra"]
  LLENA -->|si| COLA["RAM F0-F7 en la cola circular"]
  BORRAR["Borrar"] --> COLA
  COLA --> IN["IN AX KBD"]
  IN --> VACIA{"Cuenta es 0"}
  VACIA -->|si| CERO["Devuelve 00H y no mueve la cabeza"]
  VACIA -->|no| BYTE["Entrega el byte y avanza la cabeza"]
  BYTE --> AX[AX]
  CERO --> AX
  AX --> OUT["OUT LCD AX"]
  OUT --> HUECO{"Cursor menor que 8"}
  HUECO -->|si| LCD["RAM F8-FF y cursor mas 1"]
  HUECO -->|no| LLENALCD["LCD llena: no escribe"]
```

## Traza

`SIM_TRAZA_MAX` vale 200. Cada micro-paso empuja una fila y, al pasar de 200, se olvida la más vieja. La pestaña TRACE muestra esas 200 filas. El panel solo enseña los 12 últimos. P3 usó 141, así que cupo entero.

## Hoja y diálogo

El panel pone registros y ALU a la izquierda y la RAM de 16×16 a la derecha. La caché, las dos mitades de la memoria virtual y la tabla quedan más abajo: en una ventana de 1280 px de ancho se ven unos 750 px útiles y el resto pide scroll. No hay botones HEX, DEC, BIN ni INSTRU. El diálogo auxiliar dibuja cables en el hueco entre columnas. No es el diseño de la hoja, y la hoja no pretende copiarlo al píxel.
