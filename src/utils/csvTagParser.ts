import type { Tag } from "../types";
import { bankFromDigit } from "./tagDatabase";

const wordsByType: Record<number, number> = { 1: 1, 2: 2, 3: 1, 4: 2, 5: 2, 6: 4, 7: 1, 8: 2, 9: 1, 10: 2, 11: 2, 12: 4, 13: 1, 14: 1 };
const names: Record<number, string> = { 1: "Int16 Input", 2: "Int32 Input", 3: "UInt16 Input", 4: "UInt32 Input", 5: "Float32 Input", 6: "Float64 Input", 7: "Int16 Output", 8: "Int32 Output", 9: "UInt16 Output", 10: "UInt32 Output", 11: "Float32 Output", 12: "Float64 Output", 13: "Discrete Input", 14: "Discrete Output" };

function cells(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { values.push(value.trim()); value = ""; continue; }
    value += character;
  }
  values.push(value.trim());
  return values;
}

const isNumeric = (value: string) => /^\d+$/.test(value);
const isModbus = (value: string) => /MODBUS/i.test(value);

interface DeviceDefinition {
  serverId: string; ipAddress?: string; isRtu: boolean; nsp: string; deviceAddress: string; updateMode: string;
  regBank: Tag["regBank"]; modbusAddress: number; dataTypeCode: number; dataTypeName: string; wordSize: number;
  reverseSwap: number; programName: string; station: string; port: string; buffer: string; size: string; scan: string;
}

export function parseCsv(source: string): { tags: Tag[]; errors: string[] } {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 5) return { tags: [], errors: ["CSV must contain four metadata rows and a header row."] };
  const headers = cells(lines[4]);
  const column = (name: string) => headers.findIndex(header => header.toLowerCase() === name.toLowerCase());
  const required = ["@Element", "Buffer", "Program Name", "Size", "Port", "IP Address", "Station", "Device&Address", "Data Type", "Reverse", "Scan", "Service Comment", "Label"];
  const missing = required.filter(name => column(name) < 0);
  if (missing.length) return { tags: [], errors: [`Missing columns: ${missing.join(", ")}`] };

  const get = (row: string[], name: string) => row[column(name)] || "";
  const tags: Tag[] = [];
  const hostPorts = new Map<string, number>();
  let nextPort = 5020;
  let activeProgram = "";
  let activeBuffer = "";
  let activeModbusBuffer = false;
  let current: DeviceDefinition | undefined;

  lines.slice(5).forEach((line, rowIndex) => {
    if (!line.trim()) return;
    const row = cells(line);
    const buffer = get(row, "Buffer");
    const program = get(row, "Program Name");
    if (isNumeric(buffer)) {
      activeBuffer = buffer;
      activeProgram = program;
      activeModbusBuffer = isModbus(program);
      current = undefined;
    } else if (buffer === "*" && program) {
      activeProgram = program;
    }
    if (!activeModbusBuffer) return;

    const programName = program || activeProgram;
    const device = get(row, "Device&Address");
    if (device && device !== "*") {
      const match = device.match(/^([A-Z])([0134])(\d{4})$/i);
      if (!match) { current = undefined; return; }
      const typeCode = Number(get(row, "Data Type")) || 1;
      const ip = get(row, "IP Address");
      const isRtu = !ip;
      const port = get(row, "Port") || "1";
      let assignedPort = hostPorts.get(ip);
      if (assignedPort === undefined && !isRtu) { assignedPort = nextPort; nextPort += 1; hostPorts.set(ip, assignedPort); }
      const serverId = isRtu ? `RTU-${programName}-${port}` : `${ip}:${assignedPort}`;
      const address = Number(match[3]);
      const wordSize = wordsByType[typeCode] || 1;
      current = {
        serverId, ipAddress: ip || undefined, isRtu,
        nsp: `${programName.replace(/^K1-/, "").replace(/[^0-9-].*$/, "")}-${Number(port)}`,
        deviceAddress: device, updateMode: match[1].toUpperCase(), regBank: bankFromDigit(match[2]),
        modbusAddress: address, dataTypeCode: typeCode, dataTypeName: names[typeCode] || "UInt16", wordSize,
        reverseSwap: Number(get(row, "Reverse")) || 3, programName, station: get(row, "Station"), port,
        buffer: activeBuffer, size: get(row, "Size"), scan: get(row, "Scan"),
      };
      const element = get(row, "@Element") || `%WW${String(address).padStart(4, "0")}`;
      tags.push({ ...current, id: `${serverId}-${element}-${rowIndex}`, label: get(row, "Label") || `TAG_${rowIndex + 1}`, comment: get(row, "Service Comment"), element, value: typeCode >= 13 ? 1 : 100, simMode: "constant" });
      return;
    }
    if (device === "*" && current) return;
  });
  return { tags, errors: [] };
}

export function formatRange(value: number, words: number): string {
  const start = String(value).padStart(4, "0");
  return words > 1 ? `${start}-${String(value + words - 1).padStart(4, "0").slice(-2)}` : start;
}

export function sortTags(tags: Tag[]): Tag[] {
  return [...tags].sort((a, b) => a.serverId.localeCompare(b.serverId, undefined, { numeric: true }) || a.modbusAddress - b.modbusAddress);
}
