import React, { useRef, useEffect, useState } from "react";
import { LogEntry } from "../types";
import { Trash2, ShieldCheck, Play, Square, Timer, Activity, AlertCircle } from "lucide-react";

interface TerminalLogsProps {
  logs: LogEntry[];
  onClearLogs?: () => void;
  loggingActive?: boolean;
  loggingRemainingSeconds?: number;
  loggingDurationMinutes?: number;
  onStartLogging?: (minutes?: number) => void;
  onStopLogging?: () => void;
  onSetLoggingDurationMinutes?: (minutes: number) => void;
}

export default function TerminalLogs({
  logs,
  onClearLogs,
  loggingActive = false,
  loggingRemainingSeconds = 0,
  loggingDurationMinutes = 5,
  onStartLogging,
  onStopLogging,
  onSetLoggingDurationMinutes
}: TerminalLogsProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(loggingDurationMinutes || 5);

  // Sync selectedDuration if loggingDurationMinutes changes
  useEffect(() => {
    if (loggingDurationMinutes) {
      setSelectedDuration(loggingDurationMinutes);
    }
  }, [loggingDurationMinutes]);

  // Auto-scroll when logs change
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const handleStart = (mins?: number) => {
    const duration = mins || selectedDuration;
    if (onSetLoggingDurationMinutes) {
      onSetLoggingDurationMinutes(duration);
    }
    if (onStartLogging) {
      onStartLogging(duration);
    }
  };

  // Color-coded byte map rendering logic
  const getVisualBytes = (bytes: Uint8Array) => {
    return Array.from(bytes).map((b, i) => {
      let colorClass = "bg-neutral-800 text-neutral-400";
      
      // Simple coloring based on typical Modbus RTU/TCP layout
      if (i === 0) colorClass = "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"; // ID
      else if (i === 1) colorClass = "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"; // Func
      else if (i >= bytes.length - 2 && bytes.length > 3) colorClass = "bg-amber-500/20 text-amber-400 border border-amber-500/30"; // CRC / Checksum

      return (
        <span
          key={i}
          className={`inline-block px-1 rounded text-[10px] font-mono mr-0.5 ${colorClass}`}
        >
          {b.toString(16).padStart(2, "0").toUpperCase()}
        </span>
      );
    });
  };

  const formatRemaining = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="bg-[#111] rounded-2xl flex flex-col h-full relative" id="serial-terminal">
      {/* Header Bar */}
      <div className="border-b border-neutral-800 bg-neutral-900/40 px-4 py-3 flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-white">Live Transmission Terminal (RX/TX)</h3>
            <span className="flex items-center gap-1 text-[10px] font-mono text-cyan-400/90 bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              Circular Ring Buffer (100 Max)
            </span>
            {loggingActive ? (
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-300 bg-emerald-950/50 border border-emerald-700/50 px-2 py-0.5 rounded-full font-semibold shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                </span>
                Capturing ({formatRemaining(loggingRemainingSeconds)})
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 bg-neutral-800/60 border border-neutral-700/60 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
                Logging Disabled (Standby)
              </span>
            )}
          </div>
          <p className="text-[11px] text-neutral-400 mt-0.5">Parsed Modbus telemetry and activity logs (O(1) memory protected)</p>
        </div>

        {/* Logging Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {loggingActive ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs text-neutral-300 font-mono bg-neutral-950 border border-neutral-800 px-2.5 py-1 rounded-lg">
                <Timer className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-stops in: <strong className="text-emerald-400 font-semibold">{formatRemaining(loggingRemainingSeconds)}</strong></span>
              </div>
              {onStopLogging && (
                <button
                  type="button"
                  onClick={onStopLogging}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-red-600/90 hover:bg-red-500 text-white rounded-lg transition-colors cursor-pointer shadow"
                  title="Stop packet logging immediately"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Stop Logging</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-neutral-950 border border-neutral-800 rounded-lg p-1">
              <div className="flex items-center gap-1 pl-1.5 text-xs text-neutral-400">
                <Timer className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px]">Timer:</span>
                <select
                  value={selectedDuration}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSelectedDuration(val);
                    if (onSetLoggingDurationMinutes) {
                      onSetLoggingDurationMinutes(val);
                    }
                  }}
                  className="bg-neutral-900 border border-neutral-700 text-neutral-200 text-xs rounded px-1.5 py-0.5 focus:outline-none focus:border-indigo-500 font-mono cursor-pointer"
                  title="Set duration after which telemetry logging automatically stops"
                >
                  <option value={1}>1 min</option>
                  <option value={2}>2 min</option>
                  <option value={5}>5 min (Default)</option>
                  <option value={10}>10 min</option>
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>60 min</option>
                </select>
              </div>

              {onStartLogging && (
                <button
                  type="button"
                  onClick={() => handleStart()}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors cursor-pointer shadow"
                  title={`Start logging Modbus packets for ${selectedDuration} minutes`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Start Logging</span>
                </button>
              )}
            </div>
          )}

          {onClearLogs && logs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-400 hover:text-red-400 hover:bg-red-500/10 border border-neutral-800 hover:border-red-500/30 rounded-lg transition-colors cursor-pointer"
              title="Clear all recorded logs from buffer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Logs</span>
            </button>
          )}
        </div>
      </div>

      {/* Terminal View */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#050505]"
        ref={terminalRef}
      >
        {/* Informational Banner when Logging is Inactive */}
        {!loggingActive && (
          <div className="bg-gradient-to-r from-neutral-900/80 to-neutral-900/40 border border-neutral-800 rounded-xl p-3.5 mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mt-0.5">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                  Logging Disabled on Startup for Peak Stability & Zero Memory Overhead
                </h4>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  To eliminate memory growth and background overhead, packet capturing is off by default. Select a duration and start logging whenever you wish to inspect frames.
                </p>
              </div>
            </div>
            {onStartLogging && (
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={() => handleStart(1)}
                  className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] font-semibold rounded-lg border border-neutral-700 transition-colors cursor-pointer"
                >
                  Quick 1m
                </button>
                <button
                  type="button"
                  onClick={() => handleStart(5)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg shadow transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Play className="w-2.5 h-2.5 fill-current" />
                  <span>Start 5m</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active Capture Banner */}
        {loggingActive && (
          <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg px-3 py-2 text-xs flex items-center justify-between text-emerald-300 font-mono">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]" />
              <span>Live capture active — auto-stopping in <strong>{formatRemaining(loggingRemainingSeconds)}</strong></span>
            </div>
            {onStopLogging && (
              <button
                type="button"
                onClick={onStopLogging}
                className="text-[11px] text-red-300 hover:text-white bg-red-950/60 hover:bg-red-800/60 px-2 py-0.5 rounded border border-red-700/50 transition-colors cursor-pointer"
              >
                Stop Now
              </button>
            )}
          </div>
        )}

        {logs.length === 0 ? (
          <div className="text-center text-neutral-500 text-xs italic py-8">
            {loggingActive
              ? "Waiting for incoming/outgoing Modbus packets..."
              : "No transmission logs recorded yet. Start logging above to record packet telemetry."}
          </div>
        ) : (
          logs.map((log, idx) => (
            <div key={log.id || `${log.timestamp}_${idx}`} className="flex flex-col mb-2 bg-[#111] border border-neutral-800 rounded p-2 text-xs shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-neutral-500 font-mono text-[10px]">[{log.timestamp}]</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-widest ${
                    log.direction === "tx"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : log.direction === "rx"
                      ? "bg-indigo-500/20 text-indigo-400"
                      : log.direction === "error"
                      ? "bg-red-500/20 text-red-400"
                      : "bg-neutral-700/50 text-neutral-300"
                  }`}
                >
                  {log.direction}
                </span>
                <span className="text-neutral-300 truncate font-semibold">{log.desc}</span>
              </div>
              {log.rawBytes && log.rawBytes.length > 0 && (
                <div className="pl-[68px] flex flex-wrap gap-1 mt-1">
                  {getVisualBytes(log.rawBytes)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
