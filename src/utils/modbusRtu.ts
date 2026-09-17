export function crc16Modbus(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

export function appendCrc(frame: Uint8Array): Uint8Array {
  const result = new Uint8Array(frame.length + 2);
  result.set(frame);
  const crc = crc16Modbus(frame);
  result[result.length - 2] = crc & 0xff;
  result[result.length - 1] = crc >>> 8;
  return result;
}

export function validRtuFrame(frame: Uint8Array): boolean {
  if (frame.length < 4) return false;
  const expected = crc16Modbus(frame.subarray(0, -2));
  return frame.at(-2) === (expected & 0xff) && frame.at(-1) === (expected >>> 8);
}
/**
 * src/utils/modbusRtu.ts
 * 
 * Modbus RTU frame construction, custom visual colorizers, and chip driver configuration utility.
 * Implements standard CRC-16 block checksum generation and packet validation routines,
 * assembles query/response frames byte-by-byte, and exposes dynamic hardware chip presets 
 * for WebUSB adapters (FTDI FT232R, CH340, CP2102, PL2303).
 */

// Custom CRC-16 calculation for Modbus RTU
export function calculateCRC(buffer: Uint8Array): number {
  let crc = 0xFFFF;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x0001) !== 0) {
        crc = (crc >> 1) ^ 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// Check if CRC is correct
export function verifyCRC(buffer: Uint8Array): boolean {
  if (buffer.length < 3) return false;
  const data = buffer.subarray(0, buffer.length - 2);
  const receivedCRC = (buffer[buffer.length - 1] << 8) | buffer[buffer.length - 2];
  const calculated = calculateCRC(data);
  return receivedCRC === calculated;
}

// Generate a Modbus RTU Read frame
export function makeReadFrame(slaveId: number, fCode: number, startAddress: number, count: number): Uint8Array {
  const frame = new Uint8Array(8);
  frame[0] = slaveId;
  frame[1] = fCode;
  frame[2] = (startAddress >> 8) & 0xFF;
  frame[3] = startAddress & 0xFF;
  frame[4] = (count >> 8) & 0xFF;
  frame[5] = count & 0xFF;
  
  const crc = calculateCRC(frame.subarray(0, 6));
  frame[6] = crc & 0xFF;
  frame[7] = (crc >> 8) & 0xFF;
  
  return frame;
}

// Generate a Modbus RTU Write Single frame
export function makeWriteSingleFrame(slaveId: number, fCode: number, address: number, value: number): Uint8Array {
  const frame = new Uint8Array(8);
  frame[0] = slaveId;
  frame[1] = fCode;
  frame[2] = (address >> 8) & 0xFF;
  frame[3] = address & 0xFF;
  frame[4] = (value >> 8) & 0xFF;
  frame[5] = value & 0xFF;
  
  const crc = calculateCRC(frame.subarray(0, 6));
  frame[6] = crc & 0xFF;
  frame[7] = (crc >> 8) & 0xFF;
  
  return frame;
}

// Generate a Modbus TCP Read frame
export function makeReadTcpFrame(transactionId: number, slaveId: number, fCode: number, startAddress: number, count: number): Uint8Array {
  const frame = new Uint8Array(12);
  frame[0] = (transactionId >> 8) & 0xFF;
  frame[1] = transactionId & 0xFF;
  frame[2] = 0; // Protocol ID
  frame[3] = 0; // Protocol ID
  frame[4] = 0; // Length MSB
  frame[5] = 6; // Length LSB (Unit ID + Func + Start MSB + Start LSB + Count MSB + Count LSB = 6 bytes)
  frame[6] = slaveId;
  frame[7] = fCode;
  frame[8] = (startAddress >> 8) & 0xFF;
  frame[9] = startAddress & 0xFF;
  frame[10] = (count >> 8) & 0xFF;
  frame[11] = count & 0xFF;
  return frame;
}

// Generate a Modbus TCP Write Single frame
export function makeWriteSingleTcpFrame(transactionId: number, slaveId: number, fCode: number, address: number, value: number): Uint8Array {
  const frame = new Uint8Array(12);
  frame[0] = (transactionId >> 8) & 0xFF;
  frame[1] = transactionId & 0xFF;
  frame[2] = 0; // Protocol ID
  frame[3] = 0; // Protocol ID
  frame[4] = 0; // Length MSB
  frame[5] = 6; // Length LSB
  frame[6] = slaveId;
  frame[7] = fCode;
  frame[8] = (address >> 8) & 0xFF;
  frame[9] = address & 0xFF;
  frame[10] = (value >> 8) & 0xFF;
  frame[11] = value & 0xFF;
  return frame;
}

// Generate a Modbus RTU Write Multiple frame
export function makeWriteMultipleFrame(slaveId: number, fCode: number, startAddress: number, values: number[]): Uint8Array {
  let byteCount = 0;
  let payloadBytes: number[] = [];
  if (fCode === 15) {
    const numBits = values.length;
    byteCount = Math.ceil(numBits / 8);
    let currentByte = 0;
    for (let i = 0; i < numBits; i++) {
        if (values[i] > 0) currentByte |= (1 << (i % 8));
        if (i % 8 === 7 || i === numBits - 1) {
            payloadBytes.push(currentByte);
            currentByte = 0;
        }
    }
  } else if (fCode === 16) {
    byteCount = values.length * 2;
    for (let i = 0; i < values.length; i++) {
        payloadBytes.push((values[i] >> 8) & 0xFF, values[i] & 0xFF);
    }
  }
  
  const frame = new Uint8Array(6 + 1 + payloadBytes.length + 2);
  frame[0] = slaveId;
  frame[1] = fCode;
  frame[2] = (startAddress >> 8) & 0xFF;
  frame[3] = startAddress & 0xFF;
  frame[4] = (values.length >> 8) & 0xFF;
  frame[5] = values.length & 0xFF;
  frame[6] = byteCount;
  for (let i = 0; i < payloadBytes.length; i++) {
      frame[7+i] = payloadBytes[i];
  }
  const crc = calculateCRC(frame.subarray(0, frame.length - 2));
  frame[frame.length - 2] = crc & 0xFF;
  frame[frame.length - 1] = (crc >> 8) & 0xFF;
  return frame;
}

// Generate a Modbus TCP Write Multiple frame
export function makeWriteMultipleTcpFrame(transactionId: number, slaveId: number, fCode: number, startAddress: number, values: number[]): Uint8Array {
  let byteCount = 0;
  let payloadBytes: number[] = [];
  if (fCode === 15) {
    const numBits = values.length;
    byteCount = Math.ceil(numBits / 8);
    let currentByte = 0;
    for (let i = 0; i < numBits; i++) {
        if (values[i] > 0) currentByte |= (1 << (i % 8));
        if (i % 8 === 7 || i === numBits - 1) {
            payloadBytes.push(currentByte);
            currentByte = 0;
        }
    }
  } else if (fCode === 16) {
    byteCount = values.length * 2;
    for (let i = 0; i < values.length; i++) {
        payloadBytes.push((values[i] >> 8) & 0xFF, values[i] & 0xFF);
    }
  }

  const lengthField = 1 + 6 + payloadBytes.length;
  const frame = new Uint8Array(6 + lengthField);
  frame[0] = (transactionId >> 8) & 0xFF;
  frame[1] = transactionId & 0xFF;
  frame[2] = 0; // Protocol ID
  frame[3] = 0; // Protocol ID
  frame[4] = (lengthField >> 8) & 0xFF;
  frame[5] = lengthField & 0xFF;
  frame[6] = slaveId;
  frame[7] = fCode;
  frame[8] = (startAddress >> 8) & 0xFF;
  frame[9] = startAddress & 0xFF;
  frame[10] = (values.length >> 8) & 0xFF;
  frame[11] = values.length & 0xFF;
  frame[12] = byteCount;
  for (let i = 0; i < payloadBytes.length; i++) {
      frame[13+i] = payloadBytes[i];
  }
  return frame;
}

// Parse user entered hex string into a Uint8Array
export function parseHexStr(hex: string): Uint8Array | null {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) return null;
  const result = new Uint8Array(clean.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return result;
}

// Setup chips parameters dictionary (for chip presets)
export interface UsbChipPreset {
  name: string;
  vendorId: number;
  productId?: number;
  description: string;
}

export const CHIP_PRESETS: UsbChipPreset[] = [
  { name: 'CH340 / CH341 (Generic)', vendorId: 0x1A86, description: 'Very popular cheap USB-to-RS485 converters' },
  { name: 'CP2102 / CP2104 (Silicon Labs)', vendorId: 0x10C4, description: 'High reliability, professional converters' },
  { name: 'FT232R / FT231X (FTDI)', vendorId: 0x0403, description: 'Industry standard, stable performance' },
  { name: 'PL2303 (Prolific)', vendorId: 0x067B, description: 'Common generic converters' }
];
