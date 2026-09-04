/**
 * src/types.ts
 * 
 * Shared TypeScript type definitions and interfaces.
 * Standardizes definitions for Modbus register categories, operating application modes,
 * data evaluation type models (e.g. Int32, Float32, Float64), logger configurations, and
 * WebUSB adapter vendor profile profiles.
 */
export type RegisterType =
  | "coils"
  | "discreteInputs"
  | "holdingRegisters"
  | "inputRegisters"
  | "tagDatabase"
  | "settings";

export type ServerMode = "tcp" | "rtu";

export interface ModbusServerInstance {
  id: string; // e.g. "172.31.28.103:5020" or "COM3"
  mode: ServerMode;
  host?: string;
  port?: number;
  wsHost?: string;
  comPort?: string;
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
}

export type DataType =
  | "UInt16"
  | "Int16"
  | "UInt32"
  | "Int32"
  | "Float32"
  | "Float32Swapped"
  | "Float64"
  | "Float64Swapped"
  | "Bits";

export interface LogEntry {
  id?: string;
  timestamp: string;
  serverId: string; // which server this log belongs to
  direction: "tx" | "rx" | "info" | "error";
  rawBytes: Uint8Array;
  desc: string;
}

export type SimPattern = 'constant' | 'sine' | 'ramp' | 'noise';

export interface GeneratorConfig {
  mode: SimPattern | 'none' | 'random' | 'sawtooth' | 'toggle';
  regBank?: RegisterType;
  address?: number;
  dataTypeCode?: number;
  wordSize?: number;
  reverseSwap?: number;
  min: number;
  max: number;
  baseline?: number;
  currentVal?: number;
  currentSawtooth?: number;
  phase?: number;
}

export interface ModbusTag {
  id: string;
  serverId: string;         // Matches ModbusServerInstance.id
  label: string;            // CENTUM VP Tag name identifier
  comment: string;          // Service Comment
  element: string;          // Hardware word memory address (e.g. %WW0001)
  deviceAddress: string;    // Device&Address e.g. AD40001
  updateMode: string;       // A, B, C, X, Y, Z
  regBank: RegisterType;    // coils, discreteInputs, holdingRegisters, inputRegisters
  modbusAddress: number;    // decimal 0..65535
  dataTypeCode: number;     // 1..14
  dataTypeName: string;     // Integer Input, Float Output, etc.
  wordSize: number;         // 1, 2, or 4 words
  reverseSwap: number;      // 1, 2, 3
  value: number;            // Current numeric value or boolean flag (0/1)
  simMode: SimPattern;      // constant, sine, ramp, noise
  programName?: string;     // Station Identifier e.g. K1-1-1MOD
  ipAddress?: string;       // 172.31.28.103
  station?: string;         // Station number
  port?: string;            // Subsystem communication port
  buffer?: string;          // Buffer length in words
  size?: string;            // Block size in words
  scan?: string;            // Scan rate
  nsp?: string;             // Node-Slot-Port identifier e.g. 1-1-1
  isRtu?: boolean;          // True if Modbus RTU / Serial instance
}

export interface TagDatabaseStats {
  buffersCount: number;
  blocksCount: number;
  tagsCount: number;
  gapWords: number;
}

