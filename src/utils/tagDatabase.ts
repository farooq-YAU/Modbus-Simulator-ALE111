import type { MemoryState, RegisterBank, Tag } from "../types";
const KEY = "modbus_tag_database";
export function loadTags(): Tag[] { try { const value = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
export function saveTags(tags: Tag[]): void { localStorage.setItem(KEY, JSON.stringify(tags)); }
export function createMemory(): MemoryState { return { coils: new Array(10000).fill(false), discreteInputs: new Array(10000).fill(false), holdingRegisters: new Array(10000).fill(0), inputRegisters: new Array(10000).fill(0) }; }
export function bankFromDigit(digit: string): RegisterBank { return ({ "0": "coils", "1": "discreteInputs", "3": "inputRegisters", "4": "holdingRegisters" } as Record<string, RegisterBank>)[digit] || "holdingRegisters"; }
