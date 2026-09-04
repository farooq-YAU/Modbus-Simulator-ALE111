import React, { useState, useMemo, useEffect } from "react";
import { ModbusServerInstance, LogEntry, ModbusTag } from "../types";
import { getNextAvailablePort } from "../utils/serverPortManager";
import TerminalLogs from "./TerminalLogs";
import WebsocatInstructions from "./WebsocatInstructions";
import { Server, Activity, Wifi, WifiOff, RefreshCw, Cpu, Plus, Trash2, Terminal, Copy, Check, Radio, AlertTriangle, Hash } from "lucide-react";

interface ServerSettingsViewProps {
  activeServer?: ModbusServerInstance;
  activeServerId: string;
  servers: ModbusServerInstance[];
  tags?: ModbusTag[];
  bridgeHost?: string;
  onBridgeHostChange?: (host: string) => void;
  onServerSelect: (id: string) => void;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onConnectAll?: () => void;
  onDisconnectAll?: () => void;
  onAddServer: (id: string) => void;
  logs: LogEntry[];
  onClearLogs?: () => void;
  onReassignServerPort?: (oldServerId: string, newPort: number) => void;
  onAutoAssignPorts?: () => void;
  loggingActive?: boolean;
  loggingRemainingSeconds?: number;
  loggingDurationMinutes?: number;
  onStartLogging?: (durationMinutes?: number) => void;
  onStopLogging?: () => void;
  onSetLoggingDurationMinutes?: (minutes: number) => void;
}

export default function ServerSettingsView({
  activeServer,
  activeServerId,
  servers,
  tags = [],
  bridgeHost = "127.0.0.1",
  onBridgeHostChange,
  onServerSelect,
  onConnect,
  onDisconnect,
  onConnectAll,
  onDisconnectAll,
  onAddServer,
  logs,
  onClearLogs,
  onReassignServerPort,
  onAutoAssignPorts,
  loggingActive,
  loggingRemainingSeconds,
  loggingDurationMinutes,
  onStartLogging,
  onStopLogging,
  onSetLoggingDurationMinutes
}: ServerSettingsViewProps) {
  const [newServerId, setNewServerId] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"websocat" | "logs">("websocat");
  const [logFilter, setLogFilter] = useState<"current" | "all">("current");
  const [quickCopied, setQuickCopied] = useState(false);
  const [bridgeHostInput, setBridgeHostInput] = useState(bridgeHost);

  const activeHost = activeServer?.host || (activeServer?.id ? activeServer.id.split(":")[0] : "127.0.0.1");
  const activePort = activeServer?.port || (activeServer?.id ? parseInt(activeServer.id.split(":")[1], 10) || 5020 : 5020);
  const [portInput, setPortInput] = useState<string>(String(activePort));

  useEffect(() => {
    setPortInput(String(activePort));
  }, [activePort]);

  const handleUpdatePort = () => {
    const p = parseInt(portInput, 10);
    if (!isNaN(p) && p > 0 && p <= 65535 && activeServer && onReassignServerPort) {
      onReassignServerPort(activeServer.id, p);
    }
  };

  const uniqueServers = useMemo(() => {
    const map = new Map<string, ModbusServerInstance>();
    servers.forEach(s => {
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
    return uniqueServers.filter(s => s.mode === "tcp" || (s.id && s.id.includes(":") && !s.id.startsWith("RTU") && !s.id.startsWith("COM")));
  }, [uniqueServers]);

  const tcpServersCount = tcpServers.length;

  const connectedCount = useMemo(() => {
    return tcpServers.filter(s => s.status === "connected").length;
  }, [tcpServers]);

  const connectingCount = useMemo(() => {
    return tcpServers.filter(s => s.status === "connecting").length;
  }, [tcpServers]);

  const errorCount = useMemo(() => {
    return tcpServers.filter(s => s.status === "error").length;
  }, [tcpServers]);

  const isAnyConnected = connectedCount > 0;
  const isAnyConnecting = connectingCount > 0;
  const isAnyError = errorCount > 0;

  const filteredLogs = logFilter === "current" 
    ? logs.filter(l => l.serverId === activeServerId)
    : logs;

  const nextAvailablePort = useMemo(() => getNextAvailablePort(servers, 5020), [servers]);

  const portCollisions = useMemo(() => {
    const map = new Map<number, string[]>();
    uniqueServers.forEach(s => {
      if (s.mode === "tcp" || s.id.includes(":")) {
        const p = s.port || parseInt(s.id.split(":")[1], 10) || 5020;
        const list = map.get(p) || [];
        list.push(s.id);
        map.set(p, list);
      }
    });
    const duplicates: { port: number; servers: string[] }[] = [];
    map.forEach((serversList, port) => {
      if (serversList.length > 1) {
        duplicates.push({ port, servers: serversList });
      }
    });
    return duplicates;
  }, [uniqueServers]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerId.trim()) return;
    const clean = newServerId.trim();
    if (!clean.includes(":") && !clean.startsWith("RTU") && !clean.startsWith("COM")) {
      onAddServer(`${clean}:${nextAvailablePort}`);
    } else {
      onAddServer(clean);
    }
    setNewServerId("");
  };

  const quickWebsocatCmd = `websocat -b -E ws-l:0.0.0.0:${activePort} tcp-l:${activeHost}:502`;

  const copyQuickCommand = () => {
    navigator.clipboard.writeText(quickWebsocatCmd);
    setQuickCopied(true);
    setTimeout(() => setQuickCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col gap-3 p-3 sm:p-4 bg-[#0d0d0d] overflow-y-auto h-full">
      {/* TOP SCADA LED MONITOR & QUICK CONNECT ALL BAR */}
      <div className="bg-[#121212] border border-neutral-800 rounded-xl p-3 px-4 shadow-xl flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          {/* Hardware LED Bezel Ring */}
          <div className="p-1.5 rounded-full bg-black border border-neutral-700/80 shadow-inner flex items-center justify-center">
            {isAnyConnected ? (
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1)]" />
              </span>
            ) : isAnyConnecting ? (
              <span className="relative flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,1)]" />
              </span>
            ) : isAnyError ? (
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,1)]" />
            ) : (
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-neutral-600 border border-neutral-500/50" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-white">
                Bridge Connection Status:
              </span>
              <span className={`text-xs font-mono font-bold uppercase px-2 py-0.5 rounded ${
                isAnyConnected ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                isAnyConnecting ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse" :
                isAnyError ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                "bg-neutral-800 text-neutral-400 border border-neutral-700"
              }`}>
                {isAnyConnected ? "ONLINE" : isAnyConnecting ? "CONNECTING..." : isAnyError ? "BRIDGE FAULT" : "STANDBY (DISCONNECTED)"}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              {tcpServersCount > 0
                ? `${connectedCount} of ${tcpServersCount} Modbus TCP bridges connected • ${uniqueServers.length - tcpServersCount} RTU serial ports`
                : "No TCP server endpoints configured"}
            </p>
          </div>
        </div>

        {/* Quick Connect All / Disconnect All Toggle Button */}
        {onConnectAll && onDisconnectAll && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                (e.currentTarget as HTMLButtonElement)?.blur();
                console.info("%c[ServerSettings] Quick Connect All clicked!", "color: #38bdf8; font-weight: bold;");
                if (isAnyConnected || isAnyConnecting) {
                  onDisconnectAll();
                } else {
                  onConnectAll();
                }
              }}
              disabled={tcpServersCount === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all shadow-md cursor-pointer border ${
                tcpServersCount === 0
                  ? "bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed"
                  : isAnyConnected
                  ? "bg-rose-600 hover:bg-rose-500 border-rose-500 text-white shadow-rose-950/50"
                  : isAnyConnecting
                  ? "bg-amber-600 hover:bg-amber-500 border-amber-500 text-white shadow-amber-950/50"
                  : "bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white shadow-emerald-950/50"
              }`}
              title={
                isAnyConnected
                  ? `Disconnect all ${connectedCount} active WebSocket bridges`
                  : isAnyConnecting
                  ? "Connecting to bridges... Click to cancel"
                  : `Connect all ${tcpServersCount} configured TCP server bridges`
              }
            >
              {isAnyConnected ? (
                <>
                  <WifiOff className="w-3.5 h-3.5" />
                  <span className="font-mono">Disconnect All ({connectedCount}/{tcpServersCount})</span>
                </>
              ) : isAnyConnecting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-mono">Connecting ({connectingCount})...</span>
                </>
              ) : (
                <>
                  <Wifi className="w-3.5 h-3.5" />
                  <span className="font-mono">Quick Connect All ({tcpServersCount})</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col xl:flex-row gap-4 overflow-y-auto">
        {/* LEFT / TOP PANEL: Server Instance Management */}
        <div className="xl:w-96 shrink-0 flex flex-col gap-4">
          {/* Active Instance Overview Card */}
          <div className="bg-[#111] border border-neutral-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2.5">
              <h2 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Server className="w-4 h-4 text-indigo-400" />
                <span>Active Server Instance</span>
              </h2>

              {/* Status Badge with LED Indicator */}
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/60 border border-neutral-800">
                <span className="relative flex h-2 w-2">
                  {activeServer?.status === 'connected' ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                    </>
                  ) : activeServer?.status === 'connecting' ? (
                    <>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                    </>
                  ) : activeServer?.status === 'error' ? (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_6px_#ef4444]" />
                  ) : (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-600" />
                  )}
                </span>
                <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-neutral-300">
                  {activeServer?.status || 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-neutral-500">Instance Identifier:</span>
              <span className="text-white font-mono font-bold truncate">{activeServer?.id || "N/A"}</span>

              <span className="text-neutral-500">Protocol Mode:</span>
              <span className="text-indigo-400 font-bold uppercase">{activeServer?.mode || "N/A"}</span>

              {activeServer?.mode === 'tcp' && (
                <>
                  <span className="text-neutral-500">Target PLC IP:</span>
                  <span className="text-neutral-300 font-mono">{activeHost}</span>

                  <span className="text-neutral-500">WebSocket Port:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      value={portInput}
                      onChange={(e) => setPortInput(e.target.value)}
                      className="w-20 bg-[#050505] border border-neutral-700 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:border-indigo-500"
                    />
                    {parseInt(portInput, 10) !== activePort && (
                      <button
                        type="button"
                        onClick={handleUpdatePort}
                        className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 rounded text-[10px] font-bold text-white transition-colors cursor-pointer"
                        title="Update WebSocket Port for this server instance"
                      >
                        Save
                      </button>
                    )}
                  </div>

                  <span className="text-neutral-500">Bridge Target:</span>
                  <span className="text-emerald-400 font-mono font-bold">ws://{bridgeHost}:{activePort}</span>
                </>
              )}

              {activeServer?.mode === 'rtu' && (
                <>
                  <span className="text-neutral-500">COM Port:</span>
                  <span className="text-neutral-300 font-mono">{activeServer?.comPort || "COM1"}</span>
                </>
              )}
            </div>

            {/* WebSocket Bridge Host Gateway Config */}
            {activeServer?.mode === 'tcp' && (
              <div className="mt-1 pt-2 border-t border-neutral-800/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-400 font-semibold flex items-center gap-1">
                    <Radio className="w-3 h-3 text-emerald-400" />
                    <span>WebSocket Bridge Gateway (Host / IP)</span>
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={bridgeHostInput}
                    onChange={(e) => setBridgeHostInput(e.target.value)}
                    placeholder="127.0.0.1"
                    className="flex-1 bg-[#050505] border border-neutral-800 rounded px-2 py-1 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={() => onBridgeHostChange?.(bridgeHostInput)}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    Set
                  </button>
                  <button
                    onClick={() => {
                      setBridgeHostInput("127.0.0.1");
                      onBridgeHostChange?.("127.0.0.1");
                    }}
                    className="px-2 py-1 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-700/50 rounded text-[10px] font-mono font-semibold text-indigo-300 transition-colors cursor-pointer"
                    title="Set to 127.0.0.1 (Workstation loopback for websocat)"
                  >
                    127.0.0.1
                  </button>
                </div>
                <p className="text-[10px] text-neutral-500 leading-tight">
                  Browser connects to <code className="text-emerald-400 font-mono">ws://{bridgeHost}:{activePort}</code>, which websocat bridges to Modbus TCP <code className="text-neutral-300 font-mono">{activeHost}:502</code>.
                </p>
              </div>
            )}

            {activeServer?.mode === 'tcp' && (
              <div className="mt-1 pt-2 border-t border-neutral-800/80 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-400 font-semibold flex items-center gap-1">
                    <Terminal className="w-3 h-3 text-indigo-400" />
                    <span>Quick websocat Command</span>
                  </span>
                  <button
                    onClick={copyQuickCommand}
                    className="text-neutral-400 hover:text-white flex items-center gap-1 text-[10px]"
                  >
                    {quickCopied ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <code className="block bg-[#050505] border border-neutral-800 rounded p-1.5 font-mono text-[10px] text-emerald-400 break-all select-all">
                  {quickWebsocatCmd}
                </code>
              </div>
            )}

            {/* Endpoint Connection Note */}
            <div className="pt-2 flex items-center justify-between text-[11px] text-neutral-500 border-t border-neutral-850">
              <span>Bridge Connection:</span>
              <span className="font-mono text-neutral-400">
                {activeServer?.status === 'connected' ? (
                  <span className="text-emerald-400 font-bold">Connected</span>
                ) : activeServer?.status === 'connecting' ? (
                  <span className="text-amber-400 font-bold">Connecting...</span>
                ) : (
                  <span className="text-neutral-500">Managed via Connect button above</span>
                )}
              </span>
            </div>
          </div>

          {/* Server Instances Selector & Add Custom Instance */}
          <div className="bg-[#111] border border-neutral-800 rounded-xl p-4 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="w-4 h-4 text-amber-400" />
                <span>Configured Servers ({uniqueServers.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                {onAutoAssignPorts && tcpServersCount > 1 && (
                  <button
                    type="button"
                    onClick={onAutoAssignPorts}
                    className="text-[10px] bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 px-2 py-0.5 rounded font-mono font-semibold transition-colors cursor-pointer"
                    title="Automatically assign sequential ports (5020, 5021, 5022...) to all TCP servers"
                  >
                    Auto Ports (5020+)
                  </button>
                )}
                <span className="text-[10px] text-neutral-500 font-mono">
                  {tcpServersCount} TCP | {uniqueServers.length - tcpServersCount} RTU
                </span>
              </div>
            </div>

            {/* Port Conflict Alert Banner */}
            {portCollisions.length > 0 && (
              <div className="bg-amber-950/40 border border-amber-500/50 rounded-lg p-2.5 flex items-start justify-between gap-2 text-xs text-amber-200">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Port Conflict: </span>
                    <span>Multiple slaves share WebSocket port {portCollisions.map(c => c.port).join(", ")}. Websocat cannot bind to the same port twice.</span>
                  </div>
                </div>
                {onAutoAssignPorts && (
                  <button
                    type="button"
                    onClick={onAutoAssignPorts}
                    className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                  >
                    Auto-Resolve
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {uniqueServers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onServerSelect(s.id)}
                  className={`w-full p-2 rounded-lg border text-left flex items-center justify-between transition-all text-xs cursor-pointer ${
                    s.id === activeServerId
                      ? "bg-indigo-600/20 border-indigo-500 text-white"
                      : "bg-[#080808] border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                  }`}
                >
                  <div className="flex items-center gap-2 font-mono font-medium truncate">
                    {/* Server LED Dot */}
                    <span className="relative flex h-2 w-2 shrink-0">
                      {s.status === 'connected' ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_6px_#10b981]" />
                        </>
                      ) : s.status === 'connecting' ? (
                        <>
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
                        </>
                      ) : s.status === 'error' ? (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500 shadow-[0_0_6px_#ef4444]" />
                      ) : (
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-600" />
                      )}
                    </span>
                    <span className="truncate">{s.id}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(s.mode === "tcp" || s.id.includes(":")) && (
                      <span className="text-[10px] bg-indigo-950/80 border border-indigo-700/60 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-bold">
                        WS :{s.port || (s.id.includes(":") ? s.id.split(":")[1] : "5020")}
                      </span>
                    )}
                    <span className="text-[10px] uppercase font-bold text-neutral-500 px-1.5 py-0.5 rounded bg-neutral-800 shrink-0 font-mono">
                      {s.mode}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            <form onSubmit={handleAdd} className="mt-2 pt-3 border-t border-neutral-800 flex flex-col gap-2">
              <label className="text-[11px] font-semibold text-neutral-400">Add New TCP Bridge Endpoint</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={`172.31.28.104:${nextAvailablePort}`}
                  value={newServerId}
                  onChange={(e) => setNewServerId(e.target.value)}
                  className="flex-1 bg-[#050505] border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 font-mono focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs font-semibold text-white flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT PANEL: Websocat Bridge Instructions & Live Telemetry Logs */}
        <div className="flex-1 bg-[#111] border border-neutral-800 rounded-xl flex flex-col min-h-[450px] shadow-xl overflow-hidden">
          {/* Sub-Header Navigation */}
          <div className="border-b border-neutral-800 bg-neutral-900/60 p-3 flex flex-wrap justify-between items-center gap-3 shrink-0">
            <div className="flex bg-[#050505] border border-neutral-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setActiveSubTab("websocat")}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeSubTab === "websocat"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-300" />
                <span>websocat Bridge Commands</span>
                {/* Bridge Connection Status LED on Subtab */}
                <span className="relative flex h-2 w-2 ml-1">
                  {isAnyConnected ? (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                  ) : isAnyConnecting ? (
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_6px_#f59e0b] animate-ping" />
                  ) : (
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-neutral-600" />
                  )}
                </span>
                <span className="bg-white/10 px-1.5 py-0.2 rounded text-[10px] font-mono">
                  {tcpServersCount}
                </span>
              </button>
              <button
                onClick={() => setActiveSubTab("logs")}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                  activeSubTab === "logs"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-neutral-400 hover:text-white"
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>Live Packet Telemetry & Logs</span>
                {logs.length > 0 && (
                  <span className="relative flex h-2 w-2 ml-1">
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse" />
                  </span>
                )}
                <span className="bg-white/10 px-1.5 py-0.2 rounded text-[10px] font-mono">
                  {logs.length}
                </span>
              </button>
            </div>

            {activeSubTab === "logs" && (
              <div className="flex items-center gap-2">
                <div className="flex bg-[#050505] border border-neutral-800 rounded-lg p-0.5 text-xs">
                  <button
                    onClick={() => setLogFilter("current")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      logFilter === "current" ? "bg-indigo-600 text-white font-semibold" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Current Server ({logs.filter(l => l.serverId === activeServerId).length})
                  </button>
                  <button
                    onClick={() => setLogFilter("all")}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      logFilter === "all" ? "bg-indigo-600 text-white font-semibold" : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    All Servers ({logs.length})
                  </button>
                </div>

                {onClearLogs && (
                  <button
                    onClick={onClearLogs}
                    className="p-1.5 rounded-lg border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Clear Logs"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-hidden">
            {activeSubTab === "websocat" ? (
              <WebsocatInstructions
                servers={uniqueServers}
                tags={tags}
                activeServerId={activeServerId}
                activeServer={activeServer}
                onConnect={onConnect}
                onDisconnect={onDisconnect}
                onConnectAll={onConnectAll}
                onDisconnectAll={onDisconnectAll}
              />
            ) : (
              <TerminalLogs
                logs={filteredLogs}
                onClearLogs={onClearLogs}
                loggingActive={loggingActive}
                loggingRemainingSeconds={loggingRemainingSeconds}
                loggingDurationMinutes={loggingDurationMinutes}
                onStartLogging={onStartLogging}
                onStopLogging={onStopLogging}
                onSetLoggingDurationMinutes={onSetLoggingDurationMinutes}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

