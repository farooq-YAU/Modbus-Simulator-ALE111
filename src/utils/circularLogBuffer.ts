/**
 * src/utils/circularLogBuffer.ts
 *
 * Fixed-capacity Circular (Ring) Buffer for Modbus transmission and telemetry logs.
 * Prevents memory leaks and V8 garbage collection stalls by:
 * 1. Pre-allocating a fixed array of max entries (e.g. 100 entries).
 * 2. Overwriting oldest entries in O(1) time without re-allocating arrays.
 * 3. Truncating raw packet bytes to 32 bytes max in fresh tiny Uint8Arrays to release
 *    large WebSocket frame ArrayBuffers immediately.
 * 4. Assigning unique monotonic IDs to allow React to reuse DOM elements.
 */

import { LogEntry } from "../types";

let globalLogCounter = 0;

export class CircularLogBuffer {
  private buffer: (LogEntry | null)[];
  private readonly capacity: number;
  private head: number = 0; // index of the oldest item
  private count: number = 0; // current number of stored items

  constructor(capacity: number = 100) {
    this.capacity = Math.max(10, Math.min(capacity, 500));
    this.buffer = new Array(this.capacity).fill(null);
  }

  /**
   * Appends a log entry into the circular buffer.
   * If the buffer is full, the oldest entry is overwritten in O(1).
   */
  public push(entry: Omit<LogEntry, "id"> & { id?: string }): LogEntry {
    // Truncate rawBytes to 32 bytes max and copy into a detached Uint8Array
    let safeBytes: Uint8Array = new Uint8Array(0);
    if (entry.rawBytes && entry.rawBytes.length > 0) {
      const len = Math.min(entry.rawBytes.length, 32);
      safeBytes = new Uint8Array(len);
      safeBytes.set(entry.rawBytes.subarray(0, len));
    }

    const logItem: LogEntry = {
      id: entry.id || `log_${++globalLogCounter}`,
      timestamp: entry.timestamp || new Date().toLocaleTimeString(),
      serverId: entry.serverId || "system",
      direction: entry.direction,
      rawBytes: safeBytes,
      desc: entry.desc
    };

    if (this.count < this.capacity) {
      // Still filling up buffer
      const insertIdx = (this.head + this.count) % this.capacity;
      this.buffer[insertIdx] = logItem;
      this.count++;
    } else {
      // Buffer full: overwrite oldest element at head and advance head
      this.buffer[this.head] = logItem;
      this.head = (this.head + 1) % this.capacity;
    }

    return logItem;
  }

  /**
   * Returns a snapshot array of all active log entries ordered from oldest to newest.
   */
  public toArray(): LogEntry[] {
    const result: LogEntry[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head + i) % this.capacity;
      result[i] = this.buffer[idx]!;
    }
    return result;
  }

  /**
   * Clears all stored entries in the circular buffer.
   */
  public clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }

  public get size(): number {
    return this.count;
  }

  public get maxCapacity(): number {
    return this.capacity;
  }
}
