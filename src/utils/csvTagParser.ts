import { ModbusTag, RegisterType, SimPattern, TagDatabaseStats } from "../types";

export interface ParseCsvResult {
  tags: ModbusTag[];
  stats: TagDatabaseStats;
  errors: string[];
}

/**
 * Parses raw CSV text into a standard CSV array of rows and cells,
 * properly respecting double quotes and line breaks.
 */
function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = "";
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Returns human-readable name, word size, and register bank for a data type code (1-14).
 */
export function getDataTypeInfo(code: number): {
  name: string;
  wordSize: number;
  defaultBank: RegisterType;
} {
  switch (code) {
    case 1:
      return { name: "Input (16-Bit Signed)", wordSize: 1, defaultBank: "inputRegisters" };
    case 2:
      return { name: "Input (32-Bit Signed)", wordSize: 2, defaultBank: "inputRegisters" };
    case 3:
      return { name: "Input (16-Bit Unsigned)", wordSize: 1, defaultBank: "inputRegisters" };
    case 4:
      return { name: "Input (32-Bit Unsigned)", wordSize: 2, defaultBank: "inputRegisters" };
    case 5:
      return { name: "Input (32-Bit Floating)", wordSize: 2, defaultBank: "inputRegisters" };
    case 6:
      return { name: "Input (64-Bit Floating)", wordSize: 4, defaultBank: "inputRegisters" };
    case 7:
      return { name: "Output (16-Bit Signed)", wordSize: 1, defaultBank: "holdingRegisters" };
    case 8:
      return { name: "Output (32-Bit Signed)", wordSize: 2, defaultBank: "holdingRegisters" };
    case 9:
      return { name: "Output (16-Bit Unsigned)", wordSize: 1, defaultBank: "holdingRegisters" };
    case 10:
      return { name: "Output (32-Bit Unsigned)", wordSize: 2, defaultBank: "holdingRegisters" };
    case 11:
      return { name: "Output (32-Bit Floating)", wordSize: 2, defaultBank: "holdingRegisters" };
    case 12:
      return { name: "Output (64-Bit Floating)", wordSize: 4, defaultBank: "holdingRegisters" };
    case 13:
      return { name: "Input (Discrete)", wordSize: 1, defaultBank: "inputRegisters" };
    case 14:
      return { name: "Output (Discrete)", wordSize: 1, defaultBank: "holdingRegisters" };
    default:
      return { name: `Custom Type (${code})`, wordSize: 1, defaultBank: "holdingRegisters" };
  }
}

/**
 * Format address ranges in short hyphenated format
 * e.g., 1 word -> "0001", 2 words -> "0001-2", "0015-16", 4 words -> "0001-4", "0005-8", "0009-12"
 */
export function formatModbusAddrRange(modbusAddress: number, wordSize: number): string {
  const startNum = modbusAddress + 1;
  const paddedStart = startNum.toString().padStart(4, "0");
  if (wordSize <= 1) return paddedStart;
  const endNum = startNum + wordSize - 1;
  const suffix = startNum < 10 && endNum < 10 ? endNum.toString() : endNum.toString();
  return `${paddedStart}-${suffix}`;
}

export function formatElementRange(element: string, wordSize: number): string {
  if (wordSize <= 1 || !element) return element;
  if (element.includes("-")) return element;
  const match = element.match(/^(%WW)?(\d+)$/i);
  if (match) {
    const prefix = match[1] || "%WW";
    const startNum = parseInt(match[2], 10);
    const endNum = startNum + wordSize - 1;
    const paddedStart = startNum.toString().padStart(4, "0");
    const suffix = startNum < 10 && endNum < 10 ? endNum.toString() : endNum.toString();
    return `${prefix}${paddedStart}-${suffix}`;
  }
  return element;
}

export function formatDeviceAddrRange(devAddr: string, wordSize: number): string {
  if (wordSize <= 1 || !devAddr || devAddr.includes("-")) return devAddr;
  const match = devAddr.match(/^([A-Z]{1,2}[0134]?)(\d{1,5})$/i);
  if (match) {
    const prefix = match[1];
    const startNum = parseInt(match[2], 10);
    const endNum = startNum + wordSize - 1;
    const startNumStr = match[2];
    const suffix = startNum < 10 && endNum < 10 ? endNum.toString() : endNum.toString();
    return `${prefix}${startNumStr}-${suffix}`;
  }
  return devAddr;
}

export function extractNsp(programName?: string, port?: string): string {
  let n = "";
  let s = "";
  let p = "1";
  if (port) {
    const pDigits = port.replace(/\D/g, "");
    if (pDigits) {
      p = parseInt(pDigits, 10).toString();
    }
  }

  if (programName) {
    // Pattern: K1-N-Sxx... e.g. K1-1-S01FMODBUS or K1-2-S03
    const match = programName.match(/K1-(\d+)-S(\d+)/i);
    if (match) {
      n = parseInt(match[1], 10).toString();
      s = parseInt(match[2], 10).toString();
    } else {
      const parts = programName.split("-");
      if (parts.length >= 3) {
        const nPart = parts[1].replace(/\D/g, "");
        const sPart = parts[2].replace(/\D/g, "");
        if (nPart) n = parseInt(nPart, 10).toString();
        if (sPart) s = parseInt(sPart, 10).toString();
      }
    }
  }

  if (!n) n = "1";
  if (!s) s = "1";
  return `${n}-${s}-${p}`;
}

export function parseHardwareAddressOffset(element?: string): number {
  if (!element) return 0;
  const match = element.match(/\d+/);
  if (match) {
    return parseInt(match[0], 10);
  }
  return 0;
}

/**
 * Standardized Sorting Hierarchy for Modbus Tables (Section 3 & User Rule in AGENTS.md):
 * Modbus TCP: 1) Server IP Address, 2) Hardware Addr (base numerical integer offset)
 * Modbus RTU: 1) N-S-P, 2) Hardware Addr (base numerical integer offset)
 * Global / ALL: 1) Server IP / N-S-P, 2) Hardware Addr (base numerical integer offset)
 */
export function sortModbusTags(tags: ModbusTag[]): ModbusTag[] {
  return [...tags].sort((a, b) => {
    const aIsRtu = a.isRtu || a.serverId?.startsWith("RTU") || a.serverId?.startsWith("COM") || !a.ipAddress;
    const bIsRtu = b.isRtu || b.serverId?.startsWith("RTU") || b.serverId?.startsWith("COM") || !b.ipAddress;

    const aEndpoint = aIsRtu
      ? (a.nsp || extractNsp(a.programName, a.port))
      : (a.ipAddress || (a.serverId ? a.serverId.split(":")[0] : ""));
    const bEndpoint = bIsRtu
      ? (b.nsp || extractNsp(b.programName, b.port))
      : (b.ipAddress || (b.serverId ? b.serverId.split(":")[0] : ""));

    const endpointCmp = aEndpoint.localeCompare(bEndpoint, undefined, { numeric: true });
    if (endpointCmp !== 0) return endpointCmp;

    const aHw = parseHardwareAddressOffset(a.element) || (a.modbusAddress + 1);
    const bHw = parseHardwareAddressOffset(b.element) || (b.modbusAddress + 1);
    if (aHw !== bHw) return aHw - bHw;

    return a.modbusAddress - b.modbusAddress;
  });
}

/**
 * Core Yokogawa CENTUM VP Modbus Configuration CSV File Parser
 * Adheres strictly to Section 4 in AGENTS.md
 */
export function parseModbusCsvConfig(csvText: string): ParseCsvResult {
  const errors: string[] = [];
  const rawRows = parseCsvRows(csvText);

  if (rawRows.length < 5) {
    return {
      tags: [],
      stats: { buffersCount: 0, blocksCount: 0, tagsCount: 0, gapWords: 0 },
      errors: ["CSV file must have at least 5 lines (4 header lines + 1 column header row)."],
    };
  }

  // Header row is Line 5 (index 4)
  const headerRow = rawRows[4].map(col => col.toLowerCase().trim());
  const getColIndex = (names: string[]): number => {
    return headerRow.findIndex(h => names.some(n => h === n || h.includes(n)));
  };

  const elemIdx = getColIndex(["@element", "element"]);
  const bufferIdx = getColIndex(["buffer"]);
  const programIdx = getColIndex(["program name", "programname", "program"]);
  const sizeIdx = getColIndex(["size"]);
  const portIdx = getColIndex(["port"]);
  const ipIdx = getColIndex(["ip address", "ipaddress", "ip"]);
  const stationIdx = getColIndex(["station"]);
  const devAddrIdx = getColIndex(["device&address", "device address", "deviceaddress", "device"]);
  const dataTypeIdx = getColIndex(["data type", "datatype", "type"]);
  const reverseIdx = getColIndex(["reverse"]);
  const scanIdx = getColIndex(["scan"]);
  const commentIdx = getColIndex(["service comment", "comment", "servicecomment"]);
  const labelIdx = getColIndex(["label", "tag"]);

  const getCell = (row: string[], idx: number): string => (idx >= 0 && idx < row.length ? row[idx] : "");

  let currentBuffer = "";
  let currentBlockSize = "";
  let currentProgramName = "";
  let isCurrentBufferModbus = true;
  let currentPort = "";
  let currentIpAddress = "";
  let currentStation = "";

  let currentRegBank: RegisterType = "holdingRegisters";
  let currentModbusAddress = 0;
  let currentUpdateMode = "A";
  let currentDataTypeCode = 3;
  let currentReverseVal = 2;

  let buffersCount = 0;
  let blocksCount = 0;
  let gapWords = 0;

  // Track unique Modbus TCP slaves and assign a distinct WebSocket port (5020, 5021, 5022...)
  // to each slave so multiple instances of websocat can run simultaneously without port collision.
  const tcpServerPortMap = new Map<string, number>();
  let nextTcpPort = 5020;

  const tags: ModbusTag[] = [];

  // Data rows start from line 6 (index 5)
  for (let rowIndex = 5; rowIndex < rawRows.length; rowIndex++) {
    const row = rawRows[rowIndex];
    if (!row || row.length === 0 || row.every(c => c === "")) continue;

    const bufferCell = getCell(row, bufferIdx);
    const programCell = getCell(row, programIdx);
    const sizeCell = getCell(row, sizeIdx);
    const portCell = getCell(row, portIdx);
    const ipCell = getCell(row, ipIdx);
    const stationCell = getCell(row, stationIdx);
    const elemCell = getCell(row, elemIdx);
    const devAddrCell = getCell(row, devAddrIdx);
    const dataTypeCell = getCell(row, dataTypeIdx);
    const reverseCell = getCell(row, reverseIdx);
    const scanCell = getCell(row, scanIdx);
    const commentCell = getCell(row, commentIdx);
    const labelCell = getCell(row, labelIdx);

    // Track Buffer hierarchy and protocol filter (Section 4.1 & 4.2 in AGENTS.md)
    if (bufferCell && bufferCell !== "*") {
      currentBuffer = bufferCell;
      if (programCell && programCell !== "*") {
        currentProgramName = programCell;
      }
      const progUpper = (programCell && programCell !== "*" ? programCell : currentProgramName).toUpperCase();
      // Only import buffers configured for Modbus protocols (FMODBUS or containing MODBUS, or blank)
      isCurrentBufferModbus = !progUpper || progUpper.includes("MODBUS") || progUpper.includes("FMODBUS");
      if (isCurrentBufferModbus) {
        buffersCount++;
      }
    }

    // Skip entire buffer if it belongs to a non-Modbus protocol (e.g., PROFINET, ETHERNET/IP)
    if (!isCurrentBufferModbus) {
      continue;
    }

    // Track Block Hierarchy
    if (sizeCell && sizeCell !== "*") {
      currentBlockSize = sizeCell;
      blocksCount++;
    }

    if (programCell && programCell !== "*") currentProgramName = programCell;
    if (portCell && portCell !== "*") currentPort = portCell;
    if (ipCell && ipCell !== "*") currentIpAddress = ipCell;
    if (stationCell && stationCell !== "*") currentStation = stationCell;

    // Check for explicit Data Type or inherit from device definition header
    if (dataTypeCell && dataTypeCell !== "*") {
      const parsedType = parseInt(dataTypeCell, 10);
      if (!isNaN(parsedType) && parsedType >= 1 && parsedType <= 14) {
        currentDataTypeCode = parsedType;
      }
    }

    const dataTypeCode = currentDataTypeCode;
    const typeInfo = getDataTypeInfo(dataTypeCode);

    // Check for explicit Reverse swap or inherit
    if (reverseCell && reverseCell !== "*") {
      const parsedRev = parseInt(reverseCell, 10);
      if (!isNaN(parsedRev)) {
        currentReverseVal = parsedRev;
      }
    }

    let reverseVal = currentReverseVal;
    if (isNaN(reverseVal)) {
      if (dataTypeCode === 13 || dataTypeCode === 14) {
        reverseVal = 2; // Standard order (no swap) for discrete
      } else if (typeInfo.wordSize === 2) {
        reverseVal = 3; // Standard order / no swap (ABCD) for 32-bit
      } else {
        reverseVal = 2;
      }
    } else {
      if ((dataTypeCode === 2 || dataTypeCode === 4 || dataTypeCode === 5 || dataTypeCode === 8 || dataTypeCode === 10 || dataTypeCode === 11) && reverseVal === 1) {
        // Code 1 is not used for 32-bit types; default to 3 (standard order ABCD)
        reverseVal = 3;
      }
    }

    // Parse Device&Address e.g. AD40001, FD30005, A40001, 40001
    if (devAddrCell && devAddrCell !== "*") {
      const match = devAddrCell.match(/^([A-Z]{1,2})?([0134])?(\d{1,5})$/i);
      if (match) {
        currentUpdateMode = match[1] ? match[1][0].toUpperCase() : "A";
        const bankChar = match[2];
        const addrNum = parseInt(match[3], 10);

        if (bankChar === "0") currentRegBank = "coils";
        else if (bankChar === "1") currentRegBank = "discreteInputs";
        else if (bankChar === "3") currentRegBank = "inputRegisters";
        else if (bankChar === "4") currentRegBank = "holdingRegisters";
        else currentRegBank = typeInfo.defaultBank;

        // Extract decimal offset (e.g. 40001 -> address offset 0)
        if (addrNum >= 40000) currentModbusAddress = addrNum - 40001;
        else if (addrNum >= 30000) currentModbusAddress = addrNum - 30001;
        else if (addrNum >= 10000) currentModbusAddress = addrNum - 10001;
        else if (addrNum >= 1) currentModbusAddress = addrNum - 1;
        else currentModbusAddress = addrNum;

        if (currentModbusAddress < 0) currentModbusAddress = 0;
      } else {
        const digits = devAddrCell.replace(/\D/g, "");
        if (digits) {
          const num = parseInt(digits, 10);
          currentModbusAddress = num > 40000 ? num - 40001 : num > 30000 ? num - 30001 : num > 0 ? num - 1 : 0;
        }
      }
    }

    // Check for empty Gap Rows
    const isGapRow = (!devAddrCell || devAddrCell === "") && !commentCell && !labelCell;
    if (isGapRow) {
      gapWords += 1;
      currentModbusAddress += 1;
      continue;
    }

    // Initial default value calculation
    let initialVal = 100.0;
    if (dataTypeCode === 13 || dataTypeCode === 14) initialVal = 1;
    else if (dataTypeCode === 1 || dataTypeCode === 3 || dataTypeCode === 7 || dataTypeCode === 9) initialVal = 50;

    const cleanLabel = labelCell ? labelCell.replace(/^%%/, '').trim() : '';
    const label = cleanLabel || `TAG_${currentModbusAddress + 1}`;
    
    const isRtu = !currentIpAddress || currentIpAddress.trim() === "";
    const nsp = extractNsp(currentProgramName, currentPort);

    // Modbus TCP: Assign distinct WebSocket ports for each modbus slave endpoint
    // so multiple instances of websocat can run simultaneously without port conflict.
    let serverId: string;
    if (isRtu) {
      serverId = `RTU-${nsp}`;
    } else {
      const cleanIp = currentIpAddress.trim();
      let host = cleanIp;
      let explicitPort: number | null = null;
      if (cleanIp.includes(":")) {
        const parts = cleanIp.split(":");
        host = parts[0];
        const p = parseInt(parts[1], 10);
        if (!isNaN(p) && p > 0) explicitPort = p;
      }

      let port: number;
      if (tcpServerPortMap.has(host)) {
        port = tcpServerPortMap.get(host)!;
      } else {
        if (explicitPort !== null && !Array.from(tcpServerPortMap.values()).includes(explicitPort)) {
          port = explicitPort;
        } else {
          while (Array.from(tcpServerPortMap.values()).includes(nextTcpPort)) {
            nextTcpPort++;
          }
          port = nextTcpPort++;
        }
        tcpServerPortMap.set(host, port);
      }
      serverId = `${host}:${port}`;
    }

    const defaultBankChar = currentRegBank === "holdingRegisters" ? "4" : currentRegBank === "inputRegisters" ? "3" : currentRegBank === "discreteInputs" ? "1" : "0";
    const rawDevAddr = devAddrCell && devAddrCell !== "*" ? devAddrCell : `${currentUpdateMode}${defaultBankChar}${(currentModbusAddress + 1).toString().padStart(4, "0")}`;
    const formattedDevAddr = formatDeviceAddrRange(rawDevAddr, typeInfo.wordSize);
    
    const rawElem = elemCell && elemCell !== "*" ? elemCell : `%WW${(tags.length + 1).toString().padStart(4, "0")}`;
    const formattedElem = formatElementRange(rawElem, typeInfo.wordSize);

    const tagId = `tag_${serverId}_${currentRegBank}_${currentModbusAddress}_${tags.length + 1}`;

    const tag: ModbusTag = {
      id: tagId,
      serverId,
      label,
      comment: commentCell || "Imported Modbus Signal",
      element: formattedElem,
      deviceAddress: formattedDevAddr,
      updateMode: currentUpdateMode,
      regBank: currentRegBank,
      modbusAddress: currentModbusAddress,
      dataTypeCode,
      dataTypeName: typeInfo.name,
      wordSize: typeInfo.wordSize,
      reverseSwap: reverseVal,
      value: initialVal,
      simMode: "constant",
      programName: currentProgramName,
      ipAddress: currentIpAddress,
      station: currentStation,
      port: currentPort,
      buffer: currentBuffer,
      size: currentBlockSize,
      scan: scanCell || "1s",
      nsp,
      isRtu,
    };

    tags.push(tag);

    // Combine multi-word continuation rows if present in CSV
    if (typeInfo.wordSize > 1) {
      let continuationRowsToSkip = typeInfo.wordSize - 1;
      while (continuationRowsToSkip > 0 && rowIndex + 1 < rawRows.length) {
        const nextRow = rawRows[rowIndex + 1];
        if (!nextRow || nextRow.length === 0 || nextRow.every(c => c === "")) {
          rowIndex++;
          continue;
        }
        const nextDevAddr = getCell(nextRow, devAddrIdx);
        const nextLabel = getCell(nextRow, labelIdx);
        const nextComment = getCell(nextRow, commentIdx);

        // If next row is a continuation row (marked with * or empty and no new explicit label/comment)
        const isContinuationRow = (nextDevAddr === "*" || !nextDevAddr) && 
                                  (nextLabel === "*" || !nextLabel) && 
                                  (nextComment === "*" || !nextComment);
        if (isContinuationRow) {
          rowIndex++;
          continuationRowsToSkip--;
        } else {
          break;
        }
      }
    }

    // Advance address offset for next element line
    currentModbusAddress += typeInfo.wordSize;
  }

  return {
    tags,
    stats: {
      buffersCount,
      blocksCount,
      tagsCount: tags.length,
      gapWords,
    },
    errors,
  };
}
