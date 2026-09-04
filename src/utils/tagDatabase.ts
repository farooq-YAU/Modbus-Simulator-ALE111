import { ModbusTag, RegisterType } from "../types";
import { FACTORY_ALE111_TAGS } from "./factoryTagData";

const STORAGE_KEY = "modbus_tag_database";

/**
 * Loads Tag Database from localStorage.
 * Falls back to default Yokogawa ALE111 factory tags if empty.
 */
export function loadTagDatabase(): ModbusTag[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn("Failed to read tag database from localStorage", e);
  }

  // Fallback to factory defaults
  saveTagDatabase(FACTORY_ALE111_TAGS);
  return FACTORY_ALE111_TAGS;
}

/**
 * Saves current Tag Database to localStorage.
 */
export function saveTagDatabase(tags: ModbusTag[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
  } catch (e) {
    console.error("Failed to save tag database to localStorage", e);
  }
}

/**
 * Resets Tag Database to original factory defaults.
 */
export function resetFactoryTagDatabase(): ModbusTag[] {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Failed to clear localStorage tag database", e);
  }
  saveTagDatabase(FACTORY_ALE111_TAGS);
  return FACTORY_ALE111_TAGS;
}

function reverse16Bits(n: number): number {
  let res = 0;
  for (let i = 0; i < 16; i++) {
    res = (res << 1) | ((n >> i) & 1);
  }
  return res & 0xffff;
}

/**
 * Helper to encode float32 / float64 / int32 into 16-bit register word array
 */
export function encodeTagValueToWords(tag: ModbusTag, overrideValue?: number): number[] {
  const v = overrideValue !== undefined ? Number(overrideValue) : (Number(tag.value) || 0);
  const isSwapped = tag.reverseSwap === 2;

  if (tag.dataTypeCode === 5 || tag.dataTypeCode === 11) {
    // 32-bit Float (2 words)
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, v, false);
    const w0 = view.getUint16(0, false);
    const w1 = view.getUint16(2, false);
    return isSwapped ? [w1, w0] : [w0, w1];
  } else if (tag.dataTypeCode === 2 || tag.dataTypeCode === 4 || tag.dataTypeCode === 8 || tag.dataTypeCode === 10) {
    // 32-bit Int/DWord (2 words)
    const view = new DataView(new ArrayBuffer(4));
    if (tag.dataTypeCode === 2 || tag.dataTypeCode === 8) view.setInt32(0, v, false);
    else view.setUint32(0, v, false);
    const w0 = view.getUint16(0, false);
    const w1 = view.getUint16(2, false);
    return isSwapped ? [w1, w0] : [w0, w1];
  } else if (tag.dataTypeCode === 6 || tag.dataTypeCode === 12) {
    // 64-bit Float (4 words)
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, v, false);
    return [
      view.getUint16(0, false),
      view.getUint16(2, false),
      view.getUint16(4, false),
      view.getUint16(6, false),
    ];
  } else if (tag.dataTypeCode === 13 || tag.dataTypeCode === 14) {
    // 16-bit Status / Command Discrete Register (Bit swap if reverseSwap === 1)
    const raw = (v || 0) & 0xffff;
    return [tag.reverseSwap === 1 ? reverse16Bits(raw) : raw];
  } else if (tag.dataTypeCode === 1 || tag.dataTypeCode === 7) {
    // 16-bit Signed Int
    let intVal = Math.max(-32768, Math.min(32767, Math.round(v)));
    if (intVal < 0) intVal += 65536;
    return [intVal & 0xffff];
  } else {
    // 16-bit Int/Word
    return [Math.round(v) & 0xffff];
  }
}

/**
 * Helper to decode 16-bit register word array into tag value (float32 / float64 / int32 / int16 etc)
 */
export function decodeTagValueFromWords(tag: ModbusTag, words: number[]): number {
  if (!words || words.length === 0) return 0;
  const isSwapped = tag.reverseSwap === 2;

  if (tag.dataTypeCode === 5 || tag.dataTypeCode === 11) {
    // 32-bit Float (2 words)
    const w0 = words[0] || 0;
    const w1 = words[1] || 0;
    const firstWord = isSwapped ? w1 : w0;
    const secondWord = isSwapped ? w0 : w1;
    const view = new DataView(new ArrayBuffer(4));
    view.setUint16(0, firstWord, false);
    view.setUint16(2, secondWord, false);
    const floatVal = view.getFloat32(0, false);
    return isNaN(floatVal) ? 0 : parseFloat(floatVal.toFixed(4));
  } else if (tag.dataTypeCode === 2 || tag.dataTypeCode === 8) {
    // 32-bit Signed Int (2 words)
    const w0 = words[0] || 0;
    const w1 = words[1] || 0;
    const firstWord = isSwapped ? w1 : w0;
    const secondWord = isSwapped ? w0 : w1;
    const view = new DataView(new ArrayBuffer(4));
    view.setUint16(0, firstWord, false);
    view.setUint16(2, secondWord, false);
    return view.getInt32(0, false);
  } else if (tag.dataTypeCode === 4 || tag.dataTypeCode === 10) {
    // 32-bit Unsigned DWord (2 words)
    const w0 = words[0] || 0;
    const w1 = words[1] || 0;
    const firstWord = isSwapped ? w1 : w0;
    const secondWord = isSwapped ? w0 : w1;
    const view = new DataView(new ArrayBuffer(4));
    view.setUint16(0, firstWord, false);
    view.setUint16(2, secondWord, false);
    return view.getUint32(0, false);
  } else if (tag.dataTypeCode === 6 || tag.dataTypeCode === 12) {
    // 64-bit Float (4 words)
    const view = new DataView(new ArrayBuffer(8));
    view.setUint16(0, words[0] || 0, false);
    view.setUint16(2, words[1] || 0, false);
    view.setUint16(4, words[2] || 0, false);
    view.setUint16(6, words[3] || 0, false);
    const floatVal = view.getFloat64(0, false);
    return isNaN(floatVal) ? 0 : parseFloat(floatVal.toFixed(4));
  } else if (tag.dataTypeCode === 13 || tag.dataTypeCode === 14) {
    // 16-bit Status / Command Discrete Register (Bit swap if reverseSwap === 1)
    const raw = (words[0] || 0) & 0xffff;
    return tag.reverseSwap === 1 ? reverse16Bits(raw) : raw;
  } else if (tag.dataTypeCode === 1 || tag.dataTypeCode === 7) {
    // 16-bit Signed Int (1 word)
    let val = (words[0] || 0) & 0xffff;
    if (val > 32767) val -= 65536;
    return val;
  } else {
    // 16-bit Unsigned / Default (1 word)
    return (words[0] || 0) & 0xffff;
  }
}

/**
 * Synchronizes Tag Database values directly into local Modbus register memory arrays
 * so the Modbus TCP Server / RTU Server simulator serves them synchronously.
 */
export function applyTagsToModbusMemory(
  tags: ModbusTag[],
  db: {
    coils: boolean[];
    discreteInputs: boolean[];
    holdingRegisters: number[];
    inputRegisters: number[];
  }
): void {
  tags.forEach(tag => {
    const addr = tag.modbusAddress;
    if (addr < 0 || addr >= 10000) return;

    if (tag.regBank === "coils") {
      db.coils[addr] = Boolean(tag.value);
    } else if (tag.regBank === "discreteInputs") {
      db.discreteInputs[addr] = Boolean(tag.value);
    } else {
      const words = encodeTagValueToWords(tag);
      const regArray = tag.regBank === "holdingRegisters" ? db.holdingRegisters : db.inputRegisters;
      words.forEach((w, offset) => {
        if (addr + offset < regArray.length) {
          regArray[addr + offset] = w;
        }
      });
    }
  });
}
