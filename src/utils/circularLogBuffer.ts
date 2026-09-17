import type { LogEntry } from "../types";

export class CircularLogBuffer {
  private readonly entries: Array<LogEntry | undefined> = new Array(100);
  private cursor = 0;
  private length = 0;

  push(entry: LogEntry): void {
    this.entries[this.cursor] = { ...entry, rawBytes: entry.rawBytes.slice(0, 32) };
    this.cursor = (this.cursor + 1) % this.entries.length;
    this.length = Math.min(this.length + 1, this.entries.length);
  }

  values(): LogEntry[] {
    const start = this.length === this.entries.length ? this.cursor : 0;
    return Array.from({ length: this.length }, (_, index) => this.entries[(start + index) % this.entries.length]!).reverse();
  }
}
