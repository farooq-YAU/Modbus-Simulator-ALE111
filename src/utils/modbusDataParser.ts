/**
 * src/utils/modbusDataParser.ts
 * 
 * Binary-to-Value Decoder utility for multi-byte Modbus values.
 * Parses raw 16-bit registers and transforms them into standard numeric representations,
 * supporting single/multiple integer forms, single-precision (Float32), double-precision (Float64),
 * and custom word/byte swapping layouts.
 */
import { DataType } from "../types";

export interface ProcessedDataItem {
  address: number;
  value: number;
  raw: number;
  span: number;
  words: number[];
}

export function getProcessedModbusData(
  data: number[],
  dataType: DataType,
  startAddress: number,
  isBit: boolean
): ProcessedDataItem[] {
  if (isBit) {
    return data.map((val, idx) => ({
      address: startAddress + idx,
      value: val,
      raw: val,
      span: 1,
      words: [],
    }));
  }

  const processed: ProcessedDataItem[] = [];
  if (dataType === "UInt16" || dataType === "Int16" || dataType === "Bits") {
    for (let i = 0; i < data.length; i++) {
      let val = data[i];
      if (dataType === "Int16" && val > 32767) val -= 65536;
      processed.push({
        address: startAddress + i,
        value: val,
        raw: data[i],
        span: 1,
        words: [data[i]],
      });
    }
  } else if (dataType === "Float64" || dataType === "Float64Swapped") {
    for (let i = 0; i < data.length; i += 4) {
      if (i + 3 >= data.length) {
        processed.push({
          address: startAddress + i,
          value: data[i],
          raw: data[i],
          span: 1,
          words: [data[i]],
        });
        break;
      }
      const w1 = data[i], w2 = data[i + 1], w3 = data[i + 2], w4 = data[i + 3];
      const view = new DataView(new ArrayBuffer(8));
      if (dataType === "Float64") {
        view.setUint16(0, w1, false);
        view.setUint16(2, w2, false);
        view.setUint16(4, w3, false);
        view.setUint16(6, w4, false);
      } else {
        view.setUint16(0, w4, false);
        view.setUint16(2, w3, false);
        view.setUint16(4, w2, false);
        view.setUint16(6, w1, false);
      }
      processed.push({
        address: startAddress + i,
        value: view.getFloat64(0, false),
        raw: (w1 << 16) | w2,
        span: 4,
        words: [w1, w2, w3, w4],
      });
    }
  } else {
    for (let i = 0; i < data.length; i += 2) {
      if (i + 1 >= data.length) {
        processed.push({
          address: startAddress + i,
          value: data[i],
          raw: data[i],
          span: 1,
          words: [data[i]],
        });
        break;
      }
      const word1 = data[i];
      const word2 = data[i + 1];
      const uint32 = (word1 << 16) | word2;
      let finalVal: number;
      if (dataType.startsWith("Float32")) {
        const view = new DataView(new ArrayBuffer(4));
        if (dataType === "Float32") {
          view.setUint16(0, word1, false);
          view.setUint16(2, word2, false);
        } else {
          view.setUint16(0, word2, false);
          view.setUint16(2, word1, false);
        }
        finalVal = view.getFloat32(0, false);
      } else {
        const view = new DataView(new ArrayBuffer(4));
        view.setUint16(0, word1, false);
        view.setUint16(2, word2, false);
        if (dataType === "Int32") finalVal = view.getInt32(0, false);
        else finalVal = view.getUint32(0, false);
      }

      processed.push({
        address: startAddress + i,
        value: finalVal,
        raw: uint32,
        span: 2,
        words: [word1, word2],
      });
    }
  }
  return processed;
}
