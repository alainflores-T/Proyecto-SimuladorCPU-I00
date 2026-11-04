
  // Config.gs - Mapeo de coordenadas según tu diseño visual
const SHEET_NAME = "Hoja 1";
// --- Configuración de la Hoja de Historial/Log ---
const LOG_SHEET_NAME = "LOG"; // Asegúrate de que el nombre coincida exactamente con la pestaña creada
// Celdas de Registros (Columna Decimal, Hex o Binario según preferencia)
const REG_PC   = "C16";  // Ajusta según la celda real de tu tabla PC
const REG_IR   = "C17";  
const REG_MAR  = "C18";  
const REG_MDR  = "C19";  
const REG_AX   = "C20";  
const REG_BX   = "C21";  
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
