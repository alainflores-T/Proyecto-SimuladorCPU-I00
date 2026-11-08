
  // Config.gs - Mapeo de coordenadas según tu diseño visual
const SHEET_NAME = "Hoja 1";
// --- Configuración de la Hoja de Historial/Log ---
const LOG_SHEET_NAME = "LOG"; // Asegúrate de que el nombre coincida exactamente con la pestaña creada
// Celdas de Registros (Columna Decimal, Hex o Binario según preferencia)
const REG_PC   = "C16";  // Ajusta según la celda real de tu tabla PC
const REG_IR   = "C17";
const REG_IR_MAQ = "E17"; // IR en código máquina  
const REG_MAR  = "C18";  
const REG_MDR  = "C19";  
const REG_AX   = "C20";  
const REG_BX   = "C21"; 
/* . */
const REG_CX   = "C22";
const REG_DX   = "C23";

// Mapa de registros de propósito general: nombre -> celda
const REGISTROS_GENERALES = { "AX": REG_AX, "BX": REG_BX, "CX": REG_CX, "DX": REG_DX };

// --- Configuración de la Pila de Instrucciones ---
const STACK_START_ROW = 3; // Fila 3
const STACK_COL = 9;       // Columna I (9)

// Celdas de Flags
const FLAG_ZF  = "G39";  
const FLAG_CF  = "H39";  
const FLAG_SF  = "I39";  

// Celdas de Logs y Estados
//const LOG_MICRO_OPS = "O30"; // Registro de Micro-operaciones
//const LOG_CONSOLE = "E2";
const CPU_STATE     = "B2";  // Estado actual (Fetch, Decode, etc.)

// Matriz de RAM (Inicio en 00H, Fin en F0H)
const RAM_START_ROW = 8; // Fila donde empieza la celda 00H
const RAM_START_COL = 15; // Columna donde empieza la dirección +0

// --- Celdas visuales de la ALU ---
const ALU_OP1 = "B31"; // Celda del Operador 1
const ALU_OP2 = "F31"; // Celda del Operador 2
const ALU_SYM = "H34"; // Celda del Símbolo de Operación
const ALU_RES = "D45"; // Celda del Resultado

// --- Configuración del Log en celdas independientes ---
// Ejemplo: Usar la columna F (6) desde la fila 3 hasta la 20
/*const LOG_COL = 15;         
const LOG_START_ROW = 30;   
const LOG_END_ROW = 45;*/

// --- Panel de buses (Hoja 1, al lado de los registros) ---
// Si J15:K26 ya tiene algo, avísame y movemos el panel.
const BUS_INT_VAL    = "K16"; // valor del bus interno
const BUS_INT_DRIVER = "K17"; // quién conduce el bus interno

const BUS_EXT_ADDR   = "K19"; // Address bus (HEX)
const BUS_EXT_DATA   = "K20"; // Data bus (HEX o ZZ)
const BUS_EXT_DRIVER = "K21"; // quién conduce el bus de datos

const BUS_CTRL_RD    = "K23"; // Read  0/1
const BUS_CTRL_WR    = "K24"; // Write 0/1
const BUS_CTRL_CLK   = "K25"; // Clock 0/1
const BUS_CTRL_IO    = "K26"; // IO    0/1

const BUS_ALTA_Z     = "ZZ";
// --- Panel de buffers tri-state (debajo de los buses) ---
const BUF_HEADER_ROW = 28;
const BUF_START_ROW  = 29;
const BUF_NAME_COL   = 10; // J
const BUF_EN_COL     = 11; // K
const BUF_LD_COL     = 12; // L
const BUF_EST_COL    = 13; // M
const BUF_COMPONENTES = ["PC","IR","MAR","MDR","AX","BX","CX","DX","ALU","RAM","KBD","LCD"];
const BUF_BUS_INTERNO   = ["PC","IR","MAR","MDR","AX","BX","CX","DX","ALU"];
const BUF_BUS_DATOS     = ["MDR","RAM","KBD","LCD"];
const BUF_BUS_DIRECCION = ["MAR"];
// --- Palabra de control (#32) ---
var SENALES_CONTROL = [
  "En_PC", "Ld_MAR", "Mem_R", "Mem_W", "Ld_MDR", "En_MDR", "Ld_IR",
  "En_ALU", "Ld_AX", "En_AX", "Ld_BX", "En_BX", "Ld_CX", "En_CX",
  "Ld_DX", "En_DX", "Ld_PC", "En_IR", "En_MAR", "INC_PC", "IO",
  "En_KBD", "Ld_LCD"
];

var CW_PANEL_TITLE_CELL = "J42";
var CW_HEX_LABEL_CELL = "J43";
var CW_HEX_VALUE_CELL = "K43";
var CW_BITS_START_ROW = 44;
var CW_COL_IZQ_NOM = 10; // J
var CW_COL_IZQ_VAL = 11; // K
var CW_COL_DER_NOM = 12; // L
var CW_COL_DER_VAL = 13; // M
var CW_COLOR_HEADER = "#7E57C2";
var CW_COLOR_ACTIVO = "#C8E6C9";
var CW_COLOR_INACTIVO = "#EEEEEE";
var MICROCODIGO_SHEET_NAME = "Microcodigo";

// Los 256 B siguen siendo 8 marcos paginables de 32 B.
// Teclado (8 B) y vídeo del LCD (8 B) no se recortan de esos marcos:
// viven en una RAM de E/S aparte (POLITICA_ES). RESERVA_ES null significa
// «no hay hueco dentro de O8:AD23». Ver docs/decision-es-vm.md.
var POLITICA_ES = {
  nombre: "ram-dedicada-16",
  tecladoBytes: 8,
  lcdBytes: 8,
  ramPaginable: 256,
  marcos: 8,
  bytesPorMarco: 32,
  solapaMarcos: false
};

const RESERVA_ES = null;

// Propuesta NO activa. No está asignada a RESERVA_ES.
// F0H-F7H y F8H-FFH caerían en el marco 7, que dejaría de ser
// 32 bytes paginables. Con aceptarMarcoNoPaginable en false,
// el instalador la rechaza. No copiarla a RESERVA_ES sin acuerdo.
const PROPUESTA_RESERVA_ES_NO_ACTIVA = {
  teclado: { inicio: 0xF0, bytes: 8 },
  lcd: { inicio: 0xF8, bytes: 8 },
  aceptarMarcoNoPaginable: false
};
