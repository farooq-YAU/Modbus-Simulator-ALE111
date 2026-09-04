/**
 * src/utils/modbusTcpSimulator.ts
 * 
 * Virtual Modbus TCP loopback bridge and device simulator.
 * Parses incoming standard TCP requests (Modbus Application Protocol header + function payload),
 * routes reads/writes onto the reactive local memory state model (coils, registers), and assembles 
 * conforming MBAP responses to emulate a concrete remote industrial server.
 */
export interface ModbusDatabaseRef {
  coils: boolean[];
  discreteInputs: boolean[];
  holdingRegisters: number[];
  inputRegisters: number[];
}

export function parseTcpResponseAndWriteLocal(
  buffer: Uint8Array,
  db: ModbusDatabaseRef,
  startAddress: number,
  count: number
): boolean {
  const func = buffer[7];
  if (func === 3 || func === 4) {
    const byteCount = buffer[8];
    const words = byteCount / 2;
    for (let i = 0; i < words; i++) {
      const val = (buffer[9 + i * 2] << 8) | buffer[10 + i * 2];
      if (func === 3) db.holdingRegisters[startAddress + i] = val;
      if (func === 4) db.inputRegisters[startAddress + i] = val;
    }
    return true;
  } else if (func === 1 || func === 2) {
    for (let i = 0; i < count; i++) {
      const byteIdx = Math.floor(i / 8);
      const bitIdx = i % 8;
      const bitVal = (buffer[9 + byteIdx] & (1 << bitIdx)) !== 0;
      if (func === 1) db.coils[startAddress + i] = bitVal;
      if (func === 2) db.discreteInputs[startAddress + i] = bitVal;
    }
    return true;
  }
  return false;
}

export function simulateTcpRequest(
  buffer: Uint8Array,
  db: ModbusDatabaseRef
): { resBuffer: Uint8Array; databaseChanged: boolean } {
  // const transId = (buffer[0] << 8) | buffer[1];
  const uid = buffer[6];
  const func = buffer[7];

  let responsePayload: number[] = [];
  let databaseChanged = false;

  if (func === 1 || func === 2) {
    const addr = (buffer[8] << 8) | buffer[9];
    const qty = (buffer[10] << 8) | buffer[11];
    const byteCount = Math.ceil(qty / 8);
    responsePayload.push(func, byteCount);

    let currentByte = 0;
    for (let i = 0; i < qty; i++) {
      let bit = false;
      if (func === 1) bit = db.coils[addr + i] || false;
      if (func === 2) bit = db.discreteInputs[addr + i] || false;
      if (bit) currentByte |= 1 << (i % 8);
      if (i % 8 === 7 || i === qty - 1) {
        responsePayload.push(currentByte);
        currentByte = 0;
      }
    }
  } else if (func === 3 || func === 4) {
    const addr = (buffer[8] << 8) | buffer[9];
    const qty = (buffer[10] << 8) | buffer[11];
    const byteCount = qty * 2;
    responsePayload.push(func, byteCount);
    for (let i = 0; i < qty; i++) {
      let val = 0;
      if (func === 3) val = db.holdingRegisters[addr + i] || 0;
      if (func === 4) val = db.inputRegisters[addr + i] || 0;
      responsePayload.push((val >> 8) & 0xff, val & 0xff);
    }
  } else if (func === 5) {
    const addr = (buffer[8] << 8) | buffer[9];
    const val = (buffer[10] << 8) | buffer[11];
    db.coils[addr] = val === 0xff00;
    responsePayload.push(func, buffer[8], buffer[9], buffer[10], buffer[11]);
    databaseChanged = true;
  } else if (func === 6) {
    const addr = (buffer[8] << 8) | buffer[9];
    const val = (buffer[10] << 8) | buffer[11];
    db.holdingRegisters[addr] = val;
    responsePayload.push(func, buffer[8], buffer[9], buffer[10], buffer[11]);
    databaseChanged = true;
  } else if (func === 15) {
    const addr = (buffer[8] << 8) | buffer[9];
    const qty = (buffer[10] << 8) | buffer[11];
    for (let i = 0; i < qty; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      const bitValue = (buffer[13 + byteIndex] & (1 << bitIndex)) !== 0;
      db.coils[addr + i] = bitValue;
    }
    responsePayload.push(func, buffer[8], buffer[9], buffer[10], buffer[11]);
    databaseChanged = true;
  } else if (func === 16) {
    const addr = (buffer[8] << 8) | buffer[9];
    const qty = (buffer[10] << 8) | buffer[11];
    for (let i = 0; i < qty; i++) {
      const val = (buffer[13 + i * 2] << 8) | buffer[14 + i * 2];
      db.holdingRegisters[addr + i] = val;
    }
    responsePayload.push(func, buffer[8], buffer[9], buffer[10], buffer[11]);
    databaseChanged = true;
  } else {
    responsePayload.push(func | 0x80, 0x01);
  }

  const resLength = responsePayload.length + 1;
  const resBuffer = new Uint8Array(6 + 1 + responsePayload.length);

  // Header MBAP details matching the request Transaction ID, Protocol ID
  resBuffer[0] = buffer[0];
  resBuffer[1] = buffer[1];
  resBuffer[2] = 0;
  resBuffer[3] = 0;
  resBuffer[4] = (resLength >> 8) & 0xff;
  resBuffer[5] = resLength & 0xff;
  resBuffer[6] = uid;

  for (let i = 0; i < responsePayload.length; i++) {
    resBuffer[7 + i] = responsePayload[i];
  }

  return { resBuffer, databaseChanged };
}
