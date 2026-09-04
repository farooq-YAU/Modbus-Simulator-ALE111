import React, { useState, useRef, useEffect, useMemo } from "react";
import { Cpu, ChevronDown, ExternalLink, RotateCcw, Plus, Layers, Database, Sliders, ShieldCheck, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { ModbusServerInstance, RegisterType } from "../types";
import { getNextAvailablePort } from "../utils/serverPortManager";

export const REGISTER_TABS: { id: RegisterType; label: string; shortLabel: string; code: string }[] = [
  { id: "holdingRegisters", label: "Holding Registers", shortLabel: "Holding (4xxxx)", code: "4xxxx" },
  { id: "inputRegisters", label: "Input Registers", shortLabel: "Input (3xxxx)", code: "3xxxx" },
  { id: "coils", label: "Coils", shortLabel: "Coils (0xxxx)", code: "0xxxx" },
  { id: "discreteInputs", label: "Discrete Inputs", shortLabel: "Discrete (1xxxx)", code: "1xxxx" },
  { id: "tagDatabase", label: "Tag Database View", shortLabel: "Tag Database", code: "CSV" },
  { id: "settings", label: "Settings & Logs", shortLabel: "Settings & Logs", code: "CFG" },
];

interface HeaderProps {
  activeTab: RegisterType;
  setActiveTab: (tab: RegisterType) => void;
  activeServerId: string;
  servers: ModbusServerInstance[];
  onServerSelect: (serverId: string) => void;
  onAddServer?: (serverId: string) => void;
  tagCountsByServer?: Record<string, number>;
  isMaster: boolean;
  onFactoryReset?: () => void;
  totalMappedCount?: number;
  onConnectAll?: () => void;
  onDisconnectAll?: () => void;
  isTabActive?: boolean;
  onTakeOver?: () => void;
  loggingActive?: boolean;
  loggingRemainingSeconds?: number;
  onStartLogging?: () => void;
  onStopLogging?: () => void;
}

export default function Header({
  activeTab,
  setActiveTab,
  activeServerId,
  servers,
  onServerSelect,
  onAddServer,
  tagCountsByServer = {},
  isMaster,
  onFactoryReset,
  totalMappedCount,
  onConnectAll,
  onDisconnectAll,
  isTabActive = true,
  onTakeOver,
  loggingActive = false,
  loggingRemainingSeconds = 0,
  onStartLogging,
  onStopLogging
}: HeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [newServerIp, setNewServerIp] = useState("");

  const dropdownRef = useRef<HTMLDivElement>(null);
  const previousServerIdRef = useRef<string>(activeServerId);

  const uniqueServers = useMemo(() => {
    const map = new Map<string, ModbusServerInstance>();
    servers.forEach((s) => {
      if (s && s.id) {
        const cleanId = s.id.trim();
        if (!map.has(cleanId)) {
          map.set(cleanId, { ...s, id: cleanId });
        }
      }
    });
    return Array.from(map.values());
  }, [servers]);

  const tcpServers = useMemo(() => {
    return uniqueServers.filter((s) => {
      const isRtu = s.mode === "rtu" || s.id.startsWith("RTU") || s.id.startsWith("COM") || !s.id.includes(":");
      return !isRtu;
    });
  }, [uniqueServers]);

  const connectedTcpCount = useMemo(() => {
    return tcpServers.filter((s) => s.status === "connected").length;
  }, [tcpServers]);

  const connectingTcpCount = useMemo(() => {
    return tcpServers.filter((s) => s.status === "connecting").length;
  }, [tcpServers]);

  const errorTcpCount = useMemo(() => {
    return tcpServers.filter((s) => s.status === "error").length;
  }, [tcpServers]);

  const isAnyConnected = connectedTcpCount > 0;
  const isAnyConnecting = connectingTcpCount > 0;
  const isAnyError = errorTcpCount > 0;

  const totalTagsCount = useMemo(() => {
    return Object.values(tagCountsByServer).reduce((acc, c) => acc + c, 0);
  }, [tagCountsByServer]);

  const activeServer = uniqueServers.find((s) => s.id === activeServerId) || servers.find((s) => s.id === activeServerId);

  const nextAvailablePort = useMemo(() => getNextAvailablePort(servers, 5020), [servers]);

  const handleToggleDropdown = () => {
    if (!isDropdownOpen) {
      previousServerIdRef.current = activeServerId;
      setIsDropdownOpen(true);
    } else {
      onServerSelect(previousServerIdRef.current);
      setIsDropdownOpen(false);
      setIsAddingServer(false);
    }
  };

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onServerSelect(previousServerIdRef.current);
        setIsDropdownOpen(false);
        setIsAddingServer(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen, onServerSelect]);

  const handleCreateServer = () => {
    if (!newServerIp.trim()) return;
    const cleanIp = newServerIp.trim();
    const serverId = cleanIp.includes(":") 
      ? cleanIp 
      : (!cleanIp.startsWith("RTU") && !cleanIp.startsWith("COM") ? `${cleanIp}:${nextAvailablePort}` : cleanIp);
    if (onAddServer) {
      onAddServer(serverId);
    }
    onServerSelect(serverId);
    setNewServerIp("");
    setIsAddingServer(false);
    setIsDropdownOpen(false);
  };

  return (
    <header className="border-b border-neutral-800 bg-[#0d0d0d] sticky top-0 z-50 px-3 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.6)]">
      <div className="w-full flex items-center justify-between gap-3">
        {/* Left Section: Brand Logo + Merged Category Tabs */}
        <div className="flex items-center gap-3 overflow-x-auto min-w-0">
          {/* Brand Logo */}
          <div className="flex items-center gap-2 shrink-0 pr-2 border-r border-neutral-800">
            <div className="p-1 px-1.5 bg-indigo-500/10 rounded-md border border-indigo-500/30 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5 leading-none">
                <span>Modbus Workbench</span>
                <span className="text-[9px] bg-indigo-600/25 text-indigo-300 px-1 py-0.2 rounded uppercase font-mono font-bold tracking-tight">V2.0</span>
              </h1>
            </div>
          </div>

          {/* Unified Navigation Tabs */}
          <nav className="flex items-center gap-1 bg-[#050505] p-1 rounded-lg border border-neutral-800/80 shrink-0">
            {REGISTER_TABS.map((tab, idx) => {
              const isActive = activeTab === tab.id;
              const isTagDb = tab.id === "tagDatabase";
              const isSettings = tab.id === "settings";

              let tabStyle = "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60";
              if (isTagDb) {
                tabStyle = isActive
                  ? "bg-emerald-600 text-white shadow-sm font-bold border border-emerald-500"
                  : "text-emerald-400/90 hover:text-emerald-200 hover:bg-emerald-950/40 border border-emerald-500/30";
              } else if (isSettings) {
                tabStyle = isActive
                  ? "bg-amber-600 text-white shadow-sm font-bold border border-amber-500"
                  : "text-amber-400/90 hover:text-amber-200 hover:bg-amber-950/40 border border-amber-500/30";
              } else if (isActive) {
                tabStyle = "bg-indigo-600 text-white shadow-sm font-bold";
              }

              return (
                <React.Fragment key={tab.id}>
                  {idx === 4 && <div className="h-4 w-px bg-neutral-800 mx-0.5" />}
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${tabStyle}`}
                  >
                    {isTagDb && <Database className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-emerald-400"}`} />}
                    {isSettings && <Sliders className={`w-3.5 h-3.5 ${isActive ? "text-white" : "text-amber-400"}`} />}
                    <span>{tab.shortLabel}</span>

                    {/* LED Indicator for Connection Status on Settings & Logs Tab */}
                    {isSettings && (
                      <span
                        className="inline-flex items-center justify-center ml-0.5 p-0.5 rounded-full bg-black/50 border border-neutral-700/80"
                        title={
                          isAnyConnected
                            ? `Bridge Status: Connected (${connectedTcpCount}/${tcpServers.length} online)`
                            : isAnyConnecting
                            ? `Bridge Status: Connecting (${connectingTcpCount} negotiating)...`
                            : isAnyError
                            ? `Bridge Status: Fault / Error detected`
                            : `Bridge Status: Disconnected (Standby)`
                        }
                      >
                        {isAnyConnected ? (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
                          </span>
                        ) : isAnyConnecting ? (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                          </span>
                        ) : isAnyError ? (
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]" />
                        ) : (
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-600" />
                        )}
                      </span>
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Center/Right Section: Server Instance Selector + Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Single Server Instance Selector Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={handleToggleDropdown}
              className="flex items-center gap-1.5 bg-[#141414] hover:bg-neutral-800 border border-neutral-700/90 px-3 py-1.5 rounded-lg text-xs font-semibold text-neutral-200 transition-colors shadow-sm cursor-pointer"
            >
              <span className="text-neutral-400 text-[11px]">Server:</span>
              <span className="text-indigo-400 font-mono font-bold text-xs">
                {activeServerId === "ALL" || !activeServerId
                  ? "All Servers (Global View)"
                  : activeServer
                  ? `${activeServer.id} (${activeServer.mode.toUpperCase()})`
                  : activeServerId}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-neutral-800">
                <div className="p-2.5 bg-neutral-950 text-[10px] font-bold text-neutral-400 uppercase tracking-wider flex justify-between items-center">
                  <span>Server Instances ({uniqueServers.length})</span>
                  <span className="text-indigo-400 font-mono text-[10px]">DYNAMIC PORTS</span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-neutral-800/40">
                  {/* Option: ALL SERVERS */}
                  <button
                    onClick={() => {
                      onServerSelect("ALL");
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between hover:bg-neutral-800/80 transition-colors cursor-pointer ${
                      activeServerId === "ALL" || !activeServerId
                        ? "bg-indigo-500/15 text-indigo-300 font-bold border-l-2 border-indigo-500"
                        : "text-neutral-300"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-mono text-xs font-bold text-indigo-300">All Servers</span>
                      <span className="text-[10px] text-neutral-400">
                        {totalTagsCount} total signal tags (Global View)
                      </span>
                    </div>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono uppercase font-bold">
                      ALL
                    </span>
                  </button>

                  {uniqueServers.length === 0 ? (
                    <div className="p-3 text-xs text-neutral-500 text-center">No server instances loaded</div>
                  ) : (
                    uniqueServers.map((srv) => {
                      const count = tagCountsByServer[srv.id] || 0;
                      const isSelected = activeServerId === srv.id;
                      return (
                        <button
                          key={srv.id}
                          onClick={() => {
                            onServerSelect(srv.id);
                            setIsDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between hover:bg-neutral-800/80 transition-colors cursor-pointer ${
                            isSelected ? "bg-indigo-500/15 text-indigo-300 font-bold border-l-2 border-indigo-500" : "text-neutral-300"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">{srv.id}</span>
                            <span className="text-[10px] text-neutral-500">
                              {count > 0 ? `${count} signal tags mapped` : "0 tags mapped"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(srv.mode === "tcp" || srv.id.includes(":")) && (
                              <span className="text-[10px] bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">
                                :{srv.port || (srv.id.includes(":") ? srv.id.split(":")[1] : "5020")}
                              </span>
                            )}
                            <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 font-mono uppercase">
                              {srv.mode}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="p-2 bg-neutral-950">
                  {isAddingServer ? (
                    <div className="space-y-2 p-1">
                      <input
                        type="text"
                        placeholder={`IP or Host (e.g. 172.31.28.105:${nextAvailablePort})`}
                        value={newServerIp}
                        onChange={(e) => setNewServerIp(e.target.value)}
                        className="w-full bg-[#111] border border-neutral-700 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreateServer();
                        }}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setIsAddingServer(false)}
                          className="px-2 py-1 text-[11px] text-neutral-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleCreateServer}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold"
                        >
                          Add Server
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAddingServer(true)}
                      className="w-full text-left px-2.5 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-neutral-900 rounded flex items-center gap-1.5 font-medium transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Custom Server Instance</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Connection Status Indication (Red = Disconnected, Yellow = Some Disconnected/Partial, Green = All Connected) */}
          {(() => {
            const totalTcp = tcpServers.length;
            const isAllConnected = totalTcp > 0 && connectedTcpCount === totalTcp;
            const isAllDisconnected = totalTcp === 0 || (connectedTcpCount === 0 && connectingTcpCount === 0);
            const isPartial = !isAllConnected && !isAllDisconnected;

            return (
              <div
                id="header-connection-status"
                onClick={() => setActiveTab("settings")}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer select-none shadow-sm ${
                  isAllConnected
                    ? "bg-emerald-950/40 hover:bg-emerald-900/40 border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : isPartial
                    ? "bg-amber-950/40 hover:bg-amber-900/40 border-amber-500/50 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
                    : "bg-rose-950/40 hover:bg-rose-900/40 border-rose-500/50 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                }`}
                title={
                  isAllConnected
                    ? `All ${connectedTcpCount} Modbus TCP bridges connected. Click to view Settings.`
                    : isPartial
                    ? `${connectedTcpCount} of ${totalTcp} bridges connected (${totalTcp - connectedTcpCount} disconnected). Click to manage in Settings.`
                    : totalTcp === 0
                    ? "No Modbus TCP servers configured. Click to configure in Settings."
                    : `All connections disconnected (${connectedTcpCount}/${totalTcp}). Click to connect in Settings.`
                }
              >
                {/* LED Indicator Light */}
                <span className="relative flex h-2 w-2 shrink-0">
                  {isAllConnected ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                    </>
                  ) : isPartial ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
                    </>
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_6px_#ef4444]" />
                  )}
                </span>

                {/* Status Text & Connected Count Pill */}
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="hidden sm:inline">
                    {isAllConnected
                      ? "All Connected"
                      : isPartial
                      ? connectingTcpCount > 0 && connectedTcpCount === 0
                        ? "Connecting..."
                        : "Partial"
                      : "Disconnected"}
                  </span>
                  <span className="sm:hidden">
                    {isAllConnected ? "Conn." : isPartial ? "Part." : "Disc."}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                      isAllConnected
                        ? "bg-emerald-500/25 text-emerald-200"
                        : isPartial
                        ? "bg-amber-500/25 text-amber-200"
                        : "bg-rose-500/25 text-rose-200"
                    }`}
                  >
                    {connectedTcpCount}/{totalTcp}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Open in New Tab Button */}
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:flex bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg items-center gap-1.5 transition-all shadow"
            title="Open app in a new tab to enable Web Serial/WebUSB hardware permissions"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            <span>Open in Tab</span>
          </a>

          {/* Reset Factory Defaults Button */}
          {onFactoryReset && (
            <button
              type="button"
              onClick={(e) => {
                (e.currentTarget as HTMLButtonElement)?.blur();
                onFactoryReset();
              }}
              className="bg-neutral-850 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-red-400 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow"
              title="Reset Tag Database to Factory Defaults (8 sample CENTUM VP tags)"
            >
              <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
              <span className="hidden lg:inline">Reset Defaults</span>
            </button>
          )}

          {/* Telemetry Logging Quick Indicator & Toggle */}
          {loggingActive ? (
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-mono shadow-sm"
              title="Packet telemetry logging is actively capturing frames"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#10b981]" />
              </span>
              <span>
                Log: {Math.floor(loggingRemainingSeconds / 60)}:{String(loggingRemainingSeconds % 60).padStart(2, "0")}
              </span>
              {onStopLogging && (
                <button
                  type="button"
                  onClick={onStopLogging}
                  className="ml-1 text-[10px] px-1 py-0.2 rounded bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700/50 transition-colors cursor-pointer"
                  title="Stop Logging immediately"
                >
                  Stop
                </button>
              )}
            </div>
          ) : (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-semibold border bg-neutral-900/60 border-neutral-800 text-neutral-400 font-mono"
              title="Packet telemetry logging is disabled (Click Start in Settings & Logs or here to start a 5-min session)"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-600" />
              <span>Log: Off</span>
              {onStartLogging && (
                <button
                  type="button"
                  onClick={() => onStartLogging()}
                  className="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-neutral-800 hover:bg-emerald-900/50 text-neutral-300 hover:text-emerald-300 border border-neutral-700 hover:border-emerald-700/50 transition-colors cursor-pointer"
                  title="Start 5-min capture session"
                >
                  Start
                </button>
              )}
            </div>
          )}

          {/* Single Tab Exclusive Session Status Badge */}
          {isTabActive ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-sm"
              title="Exclusive Active Session: This tab holds authoritative simulation execution"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10b981]" />
              <span className="font-mono">Active Session</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onTakeOver}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 transition-all cursor-pointer shadow-sm animate-pulse"
              title="This tab is in standby. Click to take over active control."
            >
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="font-mono">Session Inactive (Take Over)</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
