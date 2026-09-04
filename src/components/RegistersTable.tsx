import React, { useState, useCallback, useMemo, useRef } from "react";
import { RegisterType, DataType, ModbusTag, SimPattern, ModbusServerInstance, LogEntry } from "../types";
import { decodeTagValueFromWords } from "../utils/tagDatabase";
import { formatElementRange, formatDeviceAddrRange, formatModbusAddrRange, extractNsp, parseHardwareAddressOffset } from "../utils/csvTagParser";
import CsvTagDatabaseView from "./CsvTagDatabaseView";
import ServerSettingsView from "./ServerSettingsView";

interface RegistersTableProps {
  activeTab: RegisterType;
  setActiveTab: (tab: RegisterType) => void;
  modbusDb: {
    coils: boolean[];
    discreteInputs: boolean[];
    holdingRegisters: number[];
    inputRegisters: number[];
  };
  getDb?: (serverId: string) => {
    coils: boolean[];
    discreteInputs: boolean[];
    holdingRegisters: number[];
    inputRegisters: number[];
  };
  modbusDbTick?: number;
  tags: ModbusTag[];
  allTags: ModbusTag[];
  onUpdateTags: (tags: ModbusTag[]) => void;
  onFactoryReset: () => void;
  onUpdateTag: (tag: ModbusTag) => void;
  dataType: DataType;
  setDataType: (type: DataType) => void;
  startAddress: number;
  setStartAddress: (addr: number) => void;
  count: number;
  setCount: (cnt: number) => void;
  onManualWrite: (regType: RegisterType, address: number, val: any, tag?: ModbusTag) => void;
  loading: boolean;
  autoRefresh: boolean;
  setAutoRefresh: (arr: boolean) => void;
  // Server settings & logs props
  activeServer?: ModbusServerInstance;
  activeServerId?: string;
  servers?: ModbusServerInstance[];
  onServerSelect?: (id: string) => void;
  onConnectServer?: (id: string) => void;
  onDisconnectServer?: (id: string) => void;
  onConnectAll?: () => void;
  onDisconnectAll?: () => void;
  onAddServer?: (id: string) => void;
  logs?: LogEntry[];
  onClearLogs?: () => void;
  bridgeHost?: string;
  onBridgeHostChange?: (host: string) => void;
  onReassignServerPort?: (oldServerId: string, newPort: number) => void;
  onAutoAssignPorts?: () => void;
  loggingActive?: boolean;
  loggingRemainingSeconds?: number;
  loggingDurationMinutes?: number;
  onStartLogging?: (durationMinutes?: number) => void;
  onStopLogging?: () => void;
  onSetLoggingDurationMinutes?: (minutes: number) => void;
}

function RegisterValueInput({ 
  value, 
  isReadOnly = false, 
  onCommit, 
  id 
}: { 
  value: any; 
  isReadOnly?: boolean; 
  onCommit: (val: number) => void; 
  id?: string; 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [localText, setLocalText] = useState("");
  const [savedFlash, setSavedFlash] = useState(false);
  const isEditingRef = useRef(false);

  const displayVal = useMemo(() => {
    if (value === undefined || value === null) return "0";
    if (typeof value === "number") {
      return Number.isInteger(value) ? value.toString() : parseFloat(value.toFixed(4)).toString();
    }
    return String(value);
  }, [value]);

  const commitValue = useCallback(() => {
    if (!isEditingRef.current) return;
    isEditingRef.current = false;
    setIsEditing(false);
    const num = parseFloat(localText);
    if (!isNaN(num)) {
      onCommit(num);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 800);
    }
  }, [localText, onCommit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitValue();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      isEditingRef.current = false;
      setIsEditing(false);
      e.currentTarget.blur();
    }
  };

  return (
    <input
      id={id}
      type="number"
      step="any"
      disabled={isReadOnly}
      value={isEditing ? localText : displayVal}
      onFocus={(e) => {
        isEditingRef.current = true;
        setIsEditing(true);
        setLocalText(displayVal);
        e.target.select();
      }}
      onChange={(e) => setLocalText(e.target.value)}
      onBlur={commitValue}
      onKeyDown={handleKeyDown}
      className={`w-28 bg-[#050505] border rounded px-2 py-0.5 text-right font-mono font-bold text-xs outline-none transition-colors ${
        savedFlash 
          ? "border-emerald-400 text-emerald-300 bg-emerald-950/30"
          : isEditing
          ? "border-indigo-500 text-indigo-200 shadow-sm ring-1 ring-indigo-500/50"
          : "border-neutral-800 text-emerald-400 focus:border-indigo-500 disabled:text-neutral-500 disabled:bg-transparent"
      }`}
    />
  );
}

const REGISTER_TABS: { id: RegisterType; label: string }[] = [
  { id: "holdingRegisters", label: "Holding Registers" },
  { id: "inputRegisters", label: "Input Registers" },
  { id: "coils", label: "Coils" },
  { id: "discreteInputs", label: "Discrete Inputs" },
  { id: "tagDatabase", label: "Tag Database (CSV)" },
  { id: "settings", label: "Server Settings & Logs" },
];

export default function RegistersTable({
  activeTab,
  setActiveTab,
  modbusDb,
  getDb,
  modbusDbTick = 0,
  tags,
  allTags,
  onUpdateTags,
  onFactoryReset,
  onUpdateTag,
  dataType,
  setDataType,
  startAddress,
  setStartAddress,
  count,
  setCount,
  onManualWrite,
  loading,
  autoRefresh,
  setAutoRefresh,
  activeServer,
  activeServerId = "",
  servers = [],
  onServerSelect = () => {},
  onConnectServer = () => {},
  onDisconnectServer = () => {},
  onConnectAll,
  onDisconnectAll,
  onAddServer = () => {},
  logs = [],
  onClearLogs = () => {},
  bridgeHost,
  onBridgeHostChange,
  onReassignServerPort,
  onAutoAssignPorts,
  loggingActive,
  loggingRemainingSeconds,
  loggingDurationMinutes,
  onStartLogging,
  onStopLogging,
  onSetLoggingDurationMinutes
}: RegistersTableProps) {
  const isBit = activeTab === "coils" || activeTab === "discreteInputs";
  // In the simulator workbench, user can manually set/force values in all banks (0xxxx, 1xxxx, 3xxxx, 4xxxx)
  const isReadOnly = false;

  const isAllServers = !activeServerId || activeServerId === "ALL" || activeServerId === "all";
  const isRtuServer = activeServer?.mode === "rtu" || (activeServerId && (activeServerId.startsWith("RTU") || activeServerId.startsWith("COM")));
  const serverColHeader = isAllServers ? "Server IP / N-S-P" : isRtuServer ? "N-S-P" : "Server IP";

  const rows = useMemo(() => {
    if (activeTab === "tagDatabase" || activeTab === "settings") return [];
    
    // 1. Gather all mapped tags belonging to this active register bank
    const bankTags = tags.filter(t => t.regBank === activeTab);
    const mappedRows: any[] = [];

    bankTags.forEach(tag => {
      const sId = tag.serverId || (activeServerId === "ALL" ? "" : activeServerId);
      const sDb = (getDb && sId) ? getDb(sId) : modbusDb;
      const dbBank = (sDb as any)[activeTab] || [];
      const wordSize = isBit ? 1 : (tag.wordSize || 1);
      const addr = tag.modbusAddress;

      let value: any = dbBank[addr];
      if (!isBit) {
        const words: number[] = [];
        let allZero = true;
        for (let w = 0; w < wordSize; w++) {
          const wordVal = (dbBank as number[])[addr + w] || 0;
          if (wordVal !== 0) allZero = false;
          words.push(wordVal);
        }
        value = decodeTagValueFromWords(tag, words);
        // Only fallback to tag.value if memory is totally blank/uninitialized and tag has initial value
        if (allZero && value === 0 && tag.value !== undefined && tag.value !== 0) {
          value = tag.value;
        }
      } else {
        value = Boolean(dbBank[addr]);
      }

      mappedRows.push({
        address: addr,
        addressDisplay: formatModbusAddrRange(addr, wordSize),
        wordSize,
        value,
        tag,
        raw: dbBank[addr]
      });
    });

    // 2. Sort mapped rows according to Modbus Workbench hierarchy:
    // Modbus TCP: 1) Server IP Address, 2) Hardware Addr (numerical base offset)
    // Modbus RTU: 1) N-S-P, 2) Hardware Addr (numerical base offset)
    // Global / ALL: 1) Server IP / N-S-P, 2) Hardware Addr
    mappedRows.sort((a, b) => {
      const aTag = a.tag;
      const bTag = b.tag;

      const aIsRtu = aTag?.isRtu || aTag?.serverId?.startsWith("RTU") || aTag?.serverId?.startsWith("COM") || (aTag && !aTag.ipAddress);
      const bIsRtu = bTag?.isRtu || bTag?.serverId?.startsWith("RTU") || bTag?.serverId?.startsWith("COM") || (bTag && !bTag.ipAddress);

      const aEndpoint = aTag
        ? (aIsRtu ? (aTag.nsp || extractNsp(aTag.programName, aTag.port)) : (aTag.ipAddress || aTag.serverId?.split(":")[0] || ""))
        : "";
      const bEndpoint = bTag
        ? (bIsRtu ? (bTag.nsp || extractNsp(bTag.programName, bTag.port)) : (bTag.ipAddress || bTag.serverId?.split(":")[0] || ""))
        : "";

      const endpointCmp = aEndpoint.localeCompare(bEndpoint, undefined, { numeric: true });
      if (endpointCmp !== 0) return endpointCmp;

      const aHw = aTag ? (parseHardwareAddressOffset(aTag.element) || (a.address + 1)) : (a.address + 1);
      const bHw = bTag ? (parseHardwareAddressOffset(bTag.element) || (b.address + 1)) : (b.address + 1);
      if (aHw !== bHw) return aHw - bHw;

      return a.address - b.address;
    });

    return mappedRows;
  }, [activeTab, modbusDb, getDb, modbusDbTick, tags, isBit, activeServerId, isAllServers]);

  if (activeTab === "settings") {
    return (
      <div className="flex flex-col h-full bg-[#111] overflow-hidden">
        <div className="flex-1 overflow-hidden min-h-0">
          <ServerSettingsView
            activeServer={activeServer}
            activeServerId={activeServerId}
            servers={servers}
            tags={allTags}
            bridgeHost={bridgeHost}
            onBridgeHostChange={onBridgeHostChange}
            onServerSelect={onServerSelect}
            onConnect={onConnectServer}
            onDisconnect={onDisconnectServer}
            onConnectAll={onConnectAll}
            onDisconnectAll={onDisconnectAll}
            onAddServer={onAddServer}
            logs={logs}
            onClearLogs={onClearLogs}
            onReassignServerPort={onReassignServerPort}
            onAutoAssignPorts={onAutoAssignPorts}
            loggingActive={loggingActive}
            loggingRemainingSeconds={loggingRemainingSeconds}
            loggingDurationMinutes={loggingDurationMinutes}
            onStartLogging={onStartLogging}
            onStopLogging={onStopLogging}
            onSetLoggingDurationMinutes={onSetLoggingDurationMinutes}
          />
        </div>
      </div>
    );
  }

  if (activeTab === "tagDatabase") {
    return (
      <div className="flex flex-col h-full bg-[#111] overflow-hidden">
        <div className="flex-1 overflow-hidden min-h-0">
          <CsvTagDatabaseView
            tags={allTags}
            activeServerId={activeServerId}
            servers={servers}
            onServerSelect={onServerSelect}
            onUpdateTags={onUpdateTags}
            onFactoryReset={onFactoryReset}
            onUpdateTag={onUpdateTag}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#111] overflow-hidden">
      <div className="flex-1 overflow-y-auto overflow-x-auto bg-[#0a0a0a] relative">
        <table className="w-full text-left text-xs whitespace-nowrap border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky top-0 z-30 py-2.5 px-3 font-semibold bg-[#161616] text-neutral-300 border-b border-neutral-700 shadow-sm">CENTUM Tag Label</th>
              <th className="sticky top-0 z-30 py-2.5 px-3 font-semibold bg-[#161616] text-neutral-300 border-b border-neutral-700 shadow-sm">{serverColHeader}</th>
              <th className="sticky top-0 z-30 py-2.5 px-3 font-semibold bg-[#161616] text-neutral-300 border-b border-neutral-700 shadow-sm">Hardware Addr</th>
              <th className="sticky top-0 z-30 py-2.5 px-3 font-semibold bg-[#161616] text-neutral-300 border-b border-neutral-700 shadow-sm">Update Mode & MB Addr</th>
              <th className="sticky top-0 z-30 py-2.5 px-3 font-semibold bg-[#161616] text-neutral-300 border-b border-neutral-700 shadow-sm">Data Type</th>
              <th className="sticky top-0 z-30 py-2.5 px-3 font-semibold text-right pr-6 bg-[#161616] text-neutral-300 border-b border-neutral-700 shadow-sm">Value</th>
              <th className="sticky top-0 z-30 py-2.5 px-3 font-semibold bg-[#161616] text-neutral-300 border-b border-neutral-700 shadow-sm">Sim Mode</th>
            </tr>
          </thead>
          <tbody className="text-neutral-300 divide-y divide-neutral-800/40">
            {rows.map((row, idx) => (
              <tr key={row.tag?.id ? `${row.tag.id}_${idx}` : `${row.tag?.serverId || activeServerId}_${row.address}_${row.tag?.label || ''}_${idx}`} className="even:bg-white/[0.02] odd:bg-transparent hover:bg-white/[0.04] transition-colors">
                <td className="py-1.5 px-3">
                  {row.tag ? (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{row.tag.label}</span>
                      <span className="text-[10px] text-neutral-500 truncate max-w-xs">{row.tag.comment}</span>
                    </div>
                  ) : (
                    <span className="text-neutral-600 italic">Unmapped Register</span>
                  )}
                </td>
                <td className="py-1.5 px-3 font-mono whitespace-nowrap">
                  {row.tag ? (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                      (row.tag.isRtu || !row.tag.ipAddress)
                        ? "bg-amber-950/60 text-amber-300 border-amber-800/80"
                        : "bg-indigo-950/80 text-indigo-300 border-indigo-800/80"
                    }`}>
                      {(row.tag.isRtu || !row.tag.ipAddress)
                        ? (row.tag.nsp || extractNsp(row.tag.programName, row.tag.port))
                        : (row.tag.ipAddress || row.tag.serverId?.split(":")[0] || "127.0.0.1")}
                    </span>
                  ) : (
                    <span className="text-neutral-600 text-[11px]">—</span>
                  )}
                </td>
                <td className="py-1.5 px-3 font-mono text-neutral-400">
                  {row.tag ? (
                    <span className="bg-neutral-800 border border-neutral-700 px-1.5 py-0.5 rounded text-[10px] text-amber-300 font-bold">
                      {formatElementRange(row.tag.element, row.tag.wordSize)}
                    </span>
                  ) : (
                    <span className="text-neutral-600 text-[11px]">—</span>
                  )}
                </td>
                <td className="py-1.5 px-3 font-mono text-neutral-300 text-xs">
                  {row.tag ? (
                    formatDeviceAddrRange(row.tag.deviceAddress, row.tag.wordSize)
                  ) : (
                    <span className="text-neutral-600 text-[11px]">—</span>
                  )}
                </td>
                <td className="py-1.5 px-3 text-neutral-400 text-xs">
                  {row.tag ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="text-neutral-300 font-medium">{row.tag.dataTypeName}</span>
                      {row.tag.wordSize > 1 && (
                        <span className="bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 px-1 py-0.2 rounded text-[10px] font-mono">
                          {row.tag.wordSize}W
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-neutral-600 text-[11px]">16-Bit Word</span>
                  )}
                </td>
                <td 
                  className="py-1.5 px-3 text-right pr-6"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName !== "INPUT" && target.tagName !== "BUTTON") {
                      const input = e.currentTarget.querySelector("input");
                      if (input && !input.disabled && document.activeElement !== input) {
                        input.focus();
                      }
                    }
                  }}
                >
                  {isBit ? (
                    <button
                      type="button"
                      id={`btn-bit-${row.address}`}
                      disabled={isReadOnly}
                      onClick={(e) => {
                        (e.currentTarget as HTMLButtonElement)?.blur();
                        onManualWrite(activeTab, row.address, !row.value, row.tag);
                      }}
                      className={`w-12 h-5 rounded inline-flex items-center justify-center font-bold text-[10px] border ${
                        row.value 
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50" 
                          : "bg-neutral-800 text-neutral-500 border-neutral-700"
                      } ${!isReadOnly ? "cursor-pointer hover:bg-neutral-700" : "opacity-70 cursor-not-allowed"}`}
                    >
                      {row.value ? "ON" : "OFF"}
                    </button>
                  ) : (
                    <RegisterValueInput
                      id={`input-reg-${row.address}`}
                      value={row.value}
                      isReadOnly={isReadOnly}
                      onCommit={(numVal) => onManualWrite(activeTab, row.address, numVal, row.tag)}
                    />
                  )}
                </td>
                <td className="py-1.5 px-3">
                  {row.tag && (
                    <select
                      value={row.tag.simMode}
                      onChange={(e) => onUpdateTag({ ...row.tag!, simMode: e.target.value as SimPattern })}
                      className="bg-[#050505] border border-neutral-800 rounded px-2 py-0.5 text-[10px] uppercase font-semibold text-neutral-300 outline-none focus:border-indigo-500"
                    >
                      <option value="constant">Static</option>
                      <option value="sine">Sine</option>
                      <option value="ramp">Ramp</option>
                      <option value="noise">Noise</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-neutral-500 italic text-sm">
                  {loading ? "Loading registers..." : "No mapped registers found for this bank"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
