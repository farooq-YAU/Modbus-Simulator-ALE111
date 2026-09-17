export type RegisterBank = "coils" | "discreteInputs" | "holdingRegisters" | "inputRegisters";
export type ServerMode = "tcp" | "rtu";
export type SimMode = "constant" | "sine" | "ramp" | "noise";

export interface ServerInstance {
  id: string;
  mode: ServerMode;
  host?: string;
  port?: number;
  serialPort?: unknown;
  baudRate?: number;
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
}

export interface Tag {
  id: string;
  serverId: string;
  label: string;
  comment: string;
  element: string;
  deviceAddress: string;
  updateMode: string;
  regBank: RegisterBank;
  modbusAddress: number;
  dataTypeCode: number;
  dataTypeName: string;
  wordSize: number;
  reverseSwap: number;
  value: number;
  simMode: SimMode;
  programName?: string;
  ipAddress?: string;
  station?: string;
  port?: string;
  buffer?: string;
  size?: string;
  scan?: string;
  nsp?: string;
  isRtu?: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  serverId: string;
  direction: "tx" | "rx" | "info" | "error";
  rawBytes: number[];
  description: string;
}

export interface MemoryState {
  coils: boolean[];
  discreteInputs: boolean[];
  holdingRegisters: number[];
  inputRegisters: number[];
}
