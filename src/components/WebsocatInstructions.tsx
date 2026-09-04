import React, { useState, useMemo, useEffect } from "react";
import {
  Terminal,
  Copy,
  Check,
  Radio,
  Cpu,
  Layers,
  Sparkles,
  Wifi,
  WifiOff,
  HelpCircle,
  Database,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  Activity
} from "lucide-react";
import { ModbusServerInstance, ModbusTag } from "../types";

interface WebsocatInstructionsProps {
  servers: ModbusServerInstance[];
  tags?: ModbusTag[];
  activeServerId: string;
  activeServer?: ModbusServerInstance;
  onConnect?: (serverId: string) => void;
  onDisconnect?: (serverId: string) => void;
  onConnectAll?: () => void;
  onDisconnectAll?: () => void;
}

export default function WebsocatInstructions({
  servers,
  tags = [],
  activeServerId,
  activeServer,
  onConnect,
  onDisconnect,
  onConnectAll,
  onDisconnectAll
}: WebsocatInstructionsProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [targetPortMode, setTargetPortMode] = useState<"502" | "same" | "custom">("502");
  const [customTargetPort, setCustomTargetPort] = useState<number>(502);
  const [scriptOs, setScriptOs] = useState<"bash" | "powershell" | "cmd">("bash");

  // Diagnostic Test State
  const [testUrl, setTestUrl] = useState("ws://127.0.0.1:5020");
  const [diagStatus, setDiagStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [diagLog, setDiagLog] = useState<string[]>([]);

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const isInIframe = typeof window !== "undefined" && window.self !== window.top;

  // Dynamically extract all TCP servers from BOTH active servers and tag database
  const tcpServers = useMemo(() => {
    const map = new Map<string, { id: string; host: string; port: number; status: string; tagCount: number }>();
    
    // 1. Process from current server instances
    servers.forEach((s) => {
      if (!s || !s.id) return;
      const isRtu = s.mode === "rtu" || s.id.startsWith("RTU") || s.id.startsWith("COM") || !s.id.includes(":");
      if (!isRtu) {
        const parts = s.id.split(":");
        const host = s.host || parts[0] || "127.0.0.1";
        const port = s.port || parseInt(parts[1], 10) || 5020;
        map.set(s.id, {
          id: s.id,
          host,
          port,
          status: s.status || "disconnected",
          tagCount: 0
        });
      }
    });

    // 2. Process from active tags (ensures instant reactivity upon CSV import, tag editing, or factory reset)
    tags.forEach((t) => {
      const isRtu = t.isRtu || t.serverId?.startsWith("RTU") || t.serverId?.startsWith("COM") || (!t.ipAddress && !t.serverId?.includes(":"));
      if (!isRtu) {
        const ip = t.ipAddress || (t.serverId && t.serverId.includes(":") ? t.serverId.split(":")[0] : t.serverId) || "127.0.0.1";
        const cleanIp = ip.trim();
        if (cleanIp) {
          const sId = t.serverId && t.serverId.includes(":") ? t.serverId : `${cleanIp}:5020`;
          const parts = sId.split(":");
          const host = parts[0] || cleanIp;
          const port = parseInt(parts[1], 10) || 5020;

          if (!map.has(sId)) {
            map.set(sId, {
              id: sId,
              host,
              port,
              status: "disconnected",
              tagCount: 1
            });
          } else {
            const existing = map.get(sId)!;
            existing.tagCount += 1;
          }
        }
      }
    });

    // Recalculate tag counts for all mapped servers
    map.forEach((item) => {
      const count = tags.filter((t) => {
        const matchServerId = t.serverId === item.id;
        const matchIp = t.ipAddress === item.host || t.ipAddress === item.id;
        return matchServerId || matchIp;
      }).length;
      item.tagCount = count;
    });

    // Sort by IP address and Port
    return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [servers, tags]);

  const connectedCount = useMemo(() => {
    return tcpServers.filter(s => s.status === "connected").length;
  }, [tcpServers]);

  const connectingCount = useMemo(() => {
    return tcpServers.filter(s => s.status === "connecting").length;
  }, [tcpServers]);

  const isAnyConnected = connectedCount > 0;
  const isAnyConnecting = connectingCount > 0;

  const activeTcpServer = useMemo(() => {
    if (activeServer && activeServer.mode === "tcp") {
      const parts = activeServer.id.split(":");
      return {
        id: activeServer.id,
        host: activeServer.host || parts[0] || "127.0.0.1",
        port: activeServer.port || parseInt(parts[1], 10) || 5020,
        status: activeServer.status || "disconnected",
        tagCount: tags.filter(t => t.serverId === activeServer.id || t.ipAddress === activeServer.host).length
      };
    }
    if (activeServerId && activeServerId !== "ALL") {
      const found = tcpServers.find(s => s.id === activeServerId);
      if (found) return found;
    }
    return tcpServers[0] || null;
  }, [activeServer, activeServerId, tcpServers, tags]);

  useEffect(() => {
    if (activeTcpServer?.port) {
      setTestUrl(`ws://127.0.0.1:${activeTcpServer.port}`);
    }
  }, [activeTcpServer?.port]);

  const getTargetPort = (serverPort: number) => {
    if (targetPortMode === "502") return 502;
    if (targetPortMode === "same") return serverPort;
    return customTargetPort || 502;
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Generate single command for a server
  const getSingleCommand = (host: string, port: number) => {
    const targetPort = getTargetPort(port);
    return `websocat -b -E ws-l:0.0.0.0:${port} tcp-l:${host}:${targetPort}`;
  };

  // Generate full composite batch script
  const getBatchScript = () => {
    if (tcpServers.length === 0) {
      return "# No Modbus TCP servers configured yet.\n# Import a CSV file or add a TCP endpoint to generate websocat bridge commands.";
    }

    if (scriptOs === "bash") {
      const lines = [
        "#!/usr/bin/env bash",
        "# Modbus Workbench - Automated websocat WebSocket-to-TCP Bridges",
        `# Synchronized with Tag Database: ${tcpServers.length} Modbus TCP server endpoint(s), ${tags.length} total tag(s)`,
        "",
        "# Ensure websocat is installed (e.g. sudo apt install websocat / brew install websocat)",
        ""
      ];

      tcpServers.forEach((s) => {
        const cmd = getSingleCommand(s.host, s.port);
        lines.push(`echo "Starting bridge for ${s.id} [${s.tagCount} tag(s)] (ws://0.0.0.0:${s.port} -> tcp-l:${s.host}:${getTargetPort(s.port)})..."`);
        lines.push(`${cmd} &`);
      });

      lines.push("");
      lines.push(`echo "All ${tcpServers.length} WebSocket bridge(s) running in background."`);
      lines.push("wait");
      return lines.join("\n");
    }

    if (scriptOs === "powershell") {
      const lines = [
        "# Modbus Workbench - Windows PowerShell websocat Bridge Launcher",
        `# Synchronized with Tag Database: ${tcpServers.length} Modbus TCP server endpoint(s), ${tags.length} total tag(s)`,
        ""
      ];

      tcpServers.forEach((s) => {
        const targetPort = getTargetPort(s.port);
        lines.push(`Write-Host "Launching bridge for ${s.id} (${s.tagCount} tags)..." -ForegroundColor Cyan`);
        lines.push(`Start-Process websocat -ArgumentList "-b", "-E", "ws-l:0.0.0.0:${s.port}", "tcp-l:${s.host}:${targetPort}" -NoNewWindow`);
      });

      return lines.join("\n");
    }

    if (scriptOs === "cmd") {
      const lines = [
        "@echo off",
        ":: Modbus Workbench - Windows Command Prompt websocat Launcher",
        `:: Synchronized with Tag Database: ${tcpServers.length} Modbus TCP server endpoint(s), ${tags.length} total tag(s)`,
        ""
      ];

      tcpServers.forEach((s) => {
        const cmd = getSingleCommand(s.host, s.port);
        lines.push(`start "${s.id} Bridge" ${cmd}`);
      });

      return lines.join("\n");
    }

    return "";
  };

  const runDiagnosticTest = (urlToTest: string) => {
    const logs: string[] = [];
    const addDiag = (msg: string) => {
      logs.push(msg);
      setDiagLog([...logs]);
    };

    setDiagStatus("testing");
    setDiagLog([]);
    addDiag(`[1/4] Origin Security Context: ${window.location.origin} (${window.location.protocol.replace(":", "")})`);

    let target = urlToTest.trim();
    if (!target.startsWith("ws://") && !target.startsWith("wss://")) {
      target = `ws://${target}`;
    }

    const isLocal = target.includes("127.0.0.1") || target.includes("localhost");
    if (isHttps && target.startsWith("ws://") && !isLocal) {
      addDiag(`⚠️ [Mixed Content Risk] Browser is running over HTTPS (${window.location.origin}). An unencrypted ws:// URL to a remote IP (${target}) is usually blocked by browser security.`);
    } else if (isHttps && isLocal) {
      addDiag(`ℹ️ [Localhost Loopback] Modern browsers typically allow unencrypted ws:// to 127.0.0.1 / localhost even on HTTPS.`);
    }

    addDiag(`[2/4] Initializing WebSocket client to: ${target}`);
    console.info(`%c[WebSocket Diagnostic] Initiating test to: ${target}`, "color: #38bdf8; font-weight: bold;");

    try {
      const socket = new WebSocket(target);
      socket.binaryType = "arraybuffer";

      const timeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          try { socket.close(); } catch (_) {}
          addDiag(`❌ [Timeout after 4s] Could not connect to ${target}.`);
          addDiag(`  • Is websocat running on your workstation on that port?`);
          addDiag(`  • If websocat was started in a remote container, port ${target.split(":").pop() || "5020"} is likely blocked by cloud ingress.`);
          console.error(`[WebSocket Diagnostic] Connection timed out for ${target}`);
          setDiagStatus("error");
        }
      }, 4000);

      socket.onopen = () => {
        clearTimeout(timeout);
        addDiag(`✅ [3/4] Connected successfully! readyState = OPEN.`);
        addDiag(`✅ [4/4] Host bridge is reachable from your browser.`);
        console.info(`%c[WebSocket Diagnostic] SUCCESS: Connected to ${target}!`, "color: #34d399; font-weight: bold;");
        setDiagStatus("success");
        setTimeout(() => {
          try { socket.close(); } catch (_) {}
          addDiag(`ℹ️ Test completed cleanly. Socket closed.`);
        }, 1200);
      };

      socket.onerror = (err) => {
        clearTimeout(timeout);
        addDiag(`❌ [Connection Error] WebSocket could not reach ${target}.`);
        addDiag(`  • Verify websocat command is running on your machine: websocat -b -E ws-l:0.0.0.0:5020 tcp-l:127.0.0.1:502`);
        addDiag(`  • If using a remote IP, make sure it is not blocked by Mixed Content (on HTTPS) or firewalls.`);
        console.error(`[WebSocket Diagnostic] Connection error for ${target}:`, err);
        setDiagStatus("error");
      };
    } catch (e: any) {
      addDiag(`❌ [Exception] Failed to instantiate WebSocket: ${e.message}`);
      console.error(`[WebSocket Diagnostic] Exception:`, e);
      setDiagStatus("error");
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111] overflow-y-auto p-4 space-y-4">
      {/* Live Tag Database Sync Status Card */}
      <div className="bg-[#161616] border border-neutral-800 rounded-xl p-4 shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400 shrink-0 mt-0.5">
              <Radio className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  WebSocket-to-TCP Bridge Architecture (`websocat`)
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  <span>{tags.length} Active Tags</span>
                </span>
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                  {tcpServers.length} TCP Server{tcpServers.length === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-xs text-neutral-300 leading-relaxed">
                Because web browsers cannot open raw TCP sockets directly from JavaScript, this application connects via binary WebSockets (<code className="text-indigo-300 font-mono">ws://</code>).
                Run <strong className="text-white">websocat</strong> on the host station or gateway to bridge WebSocket traffic to Modbus TCP devices/PLCs.
                Commands automatically update whenever the Tag Database is modified, reset, or a new CSV configuration is imported.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Permissions & Environment Health Checklist */}
      <div className="bg-[#161616] border border-neutral-800 rounded-xl p-4 shadow-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Application Permissions & Environment Status
            </h4>
          </div>
          <span className="text-[11px] text-neutral-400 font-mono">
            Origin: {isHttps ? "HTTPS (Secure)" : "HTTP"} • {isInIframe ? "Embedded Iframe" : "Top Window"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-[#0a0a0a] border border-neutral-800/80 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-indigo-400" />
                <span>WebSockets & TCP Bridge</span>
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded">
                Standard API
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              No browser permission prompts required. However:
            </p>
            <ul className="text-[11px] text-neutral-400 space-y-1 list-disc list-inside">
              <li>
                <strong className="text-neutral-300">Where websocat runs:</strong> Must run on a machine directly reachable from your web browser (your local workstation or an open network gateway).
              </li>
              <li>
                <strong className="text-neutral-300">Mixed Content:</strong> Browsers on HTTPS block unencrypted <code className="text-indigo-300">ws://</code> to remote IPs, but allow <code className="text-emerald-300">ws://127.0.0.1:port</code> loopback.
              </li>
              <li>
                <strong className="text-neutral-300">Container Port Ingress:</strong> If websocat is running inside the cloud dev container, port 5020 cannot be reached externally (only port 3000 is exposed). Run websocat on your workstation.
              </li>
            </ul>
          </div>

          <div className="bg-[#0a0a0a] border border-neutral-800/80 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                <span>Web Serial & WebUSB (RTU Mode)</span>
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                isInIframe ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"
              }`}>
                {isInIframe ? "Iframe Blocked" : "Ready"}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Required for connecting physical USB-to-RS485 adapters and COM ports.
            </p>
            <ul className="text-[11px] text-neutral-400 space-y-1 list-disc list-inside">
              <li>
                <strong className="text-neutral-300">Iframe restriction:</strong> Browser security forbids serial port access inside iframes.
              </li>
              <li>
                <strong className="text-neutral-300">Top Window requirement:</strong> Click <em>"Open in New Tab"</em> in the AI Studio preview to grant USB/Serial permissions.
              </li>
              <li>
                <strong className="text-neutral-300">User Gesture:</strong> Must be triggered by user click (e.g. "Connect Hardware").
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Interactive WebSocket Live Ping & Diagnostic Tool */}
      <div className="bg-[#161616] border border-indigo-900/40 rounded-xl p-4 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Interactive WebSocket Ping & Diagnostics
            </h4>
          </div>
          <span className="text-[11px] text-neutral-400">
            Tests immediate WebSocket reachability and outputs verbose logs to DevTools Console
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="ws://127.0.0.1:5020 or wss://..."
            className="flex-1 min-w-[220px] bg-[#0a0a0a] border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => setTestUrl("ws://127.0.0.1:5020")}
            className="px-2.5 py-1.5 bg-[#0a0a0a] hover:bg-neutral-800 text-neutral-300 rounded-lg border border-neutral-700 text-xs font-mono transition-colors"
            title="Use localhost 5020"
          >
            127.0.0.1:5020
          </button>
          {activeTcpServer && (
            <button
              onClick={() => setTestUrl(`ws://${activeTcpServer.host}:${activeTcpServer.port}`)}
              className="px-2.5 py-1.5 bg-[#0a0a0a] hover:bg-neutral-800 text-neutral-300 rounded-lg border border-neutral-700 text-xs font-mono transition-colors"
              title="Use active server"
            >
              Active ({activeTcpServer.id})
            </button>
          )}
          <button
            onClick={() => runDiagnosticTest(testUrl)}
            disabled={diagStatus === "testing"}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow transition-colors disabled:opacity-50 cursor-pointer"
          >
            {diagStatus === "testing" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Pinging...</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Test WebSocket Ping</span>
              </>
            )}
          </button>
        </div>

        {diagLog.length > 0 && (
          <div className="bg-[#050505] border border-neutral-800 rounded-lg p-3 space-y-1 font-mono text-[11px] max-h-48 overflow-y-auto">
            {diagLog.map((line, idx) => {
              let color = "text-neutral-300";
              if (line.includes("✅")) color = "text-emerald-400 font-semibold";
              else if (line.includes("❌")) color = "text-rose-400 font-semibold";
              else if (line.includes("⚠️")) color = "text-amber-400";
              else if (line.includes("ℹ️")) color = "text-sky-300";
              return <div key={idx} className={color}>{line}</div>;
            })}
          </div>
        )}
      </div>

      {/* Target Modbus Port Configuration */}
      <div className="bg-[#161616] border border-neutral-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-neutral-200">Target Modbus Device Port:</span>
          <span className="text-[11px] text-neutral-400">
            (The physical or PLC TCP port on the field station)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTargetPortMode("502")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
              targetPortMode === "502"
                ? "bg-indigo-600 border-indigo-500 text-white shadow"
                : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Port 502 (Standard PLC)
          </button>
          <button
            onClick={() => setTargetPortMode("same")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
              targetPortMode === "same"
                ? "bg-indigo-600 border-indigo-500 text-white shadow"
                : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Match WS Port (e.g. 5020)
          </button>
          <button
            onClick={() => setTargetPortMode("custom")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg border transition-all ${
              targetPortMode === "custom"
                ? "bg-indigo-600 border-indigo-500 text-white shadow"
                : "bg-[#0d0d0d] border-neutral-800 text-neutral-400 hover:text-white"
            }`}
          >
            Custom
          </button>

          {targetPortMode === "custom" && (
            <input
              type="number"
              value={customTargetPort}
              onChange={(e) => setCustomTargetPort(parseInt(e.target.value, 10) || 502)}
              className="w-20 bg-[#0a0a0a] border border-neutral-700 rounded-lg px-2 py-1 text-xs text-white font-mono outline-none focus:border-indigo-500"
            />
          )}
        </div>
      </div>

      {/* Active Server Quick Bridge Command */}
      {activeTcpServer && (
        <div className="bg-[#161616] border border-neutral-800 rounded-xl p-4 shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Active Server Command: <span className="font-mono text-indigo-300">{activeTcpServer.id}</span>
                {activeTcpServer.tagCount > 0 && (
                  <span className="ml-2 text-[11px] font-normal text-neutral-400 font-sans">
                    ({activeTcpServer.tagCount} tag{activeTcpServer.tagCount === 1 ? "" : "s"} mapped)
                  </span>
                )}
              </h4>
            </div>
            <button
              onClick={() => copyToClipboard(getSingleCommand(activeTcpServer.host, activeTcpServer.port), `active_${activeTcpServer.id}`)}
              className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              {copiedKey === `active_${activeTcpServer.id}` ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Command</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-[#050505] border border-neutral-800 rounded-lg p-3 font-mono text-xs text-emerald-400 overflow-x-auto select-all flex items-center justify-between">
            <code>{getSingleCommand(activeTcpServer.host, activeTcpServer.port)}</code>
          </div>
          <p className="text-[11px] text-neutral-400">
            Listens on WebSocket <code className="text-neutral-300 font-mono">ws://0.0.0.0:{activeTcpServer.port}</code> and forwards binary Modbus packets to <code className="text-neutral-300 font-mono">tcp-l:{activeTcpServer.host}:{getTargetPort(activeTcpServer.port)}</code>.
          </p>
        </div>
      )}

      {/* Multi-Server Batch Scripts Section */}
      <div className="bg-[#161616] border border-neutral-800 rounded-xl p-4 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Multi-Server Bridge Script ({tcpServers.length} Endpoints)
              </h4>
              <p className="text-[11px] text-neutral-400">
                Run this script to start all bridges simultaneously on your host station
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-[#080808] border border-neutral-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setScriptOs("bash")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  scriptOs === "bash" ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
                }`}
              >
                Linux / macOS (Bash)
              </button>
              <button
                onClick={() => setScriptOs("powershell")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  scriptOs === "powershell" ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
                }`}
              >
                Windows (PowerShell)
              </button>
              <button
                onClick={() => setScriptOs("cmd")}
                className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                  scriptOs === "cmd" ? "bg-indigo-600 text-white shadow" : "text-neutral-400 hover:text-white"
                }`}
              >
                Windows (CMD Batch)
              </button>
            </div>

            <button
              onClick={() => copyToClipboard(getBatchScript(), "batch_script")}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow"
            >
              {copiedKey === "batch_script" ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Script Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Script</span>
                </>
              )}
            </button>
          </div>
        </div>

        <pre className="bg-[#050505] border border-neutral-800 rounded-lg p-3 font-mono text-xs text-neutral-300 overflow-x-auto leading-relaxed max-h-56">
          {getBatchScript()}
        </pre>
      </div>

      {/* Dynamic List of All Configured TCP Endpoints */}
      <div className="bg-[#161616] border border-neutral-800 rounded-xl p-4 shadow-md space-y-3">
        <div className="flex flex-wrap items-center justify-between border-b border-neutral-800 pb-2.5 gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              Configured TCP Server Endpoints & Individual Commands
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 hidden sm:inline">
              Automatically updated from Tag Database & CSV configuration
            </span>
          </div>
        </div>

        {tcpServers.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500 italic">
            No Modbus TCP servers found in configuration. Import a CSV file or add a TCP endpoint above.
          </div>
        ) : (
          <div className="space-y-2">
            {tcpServers.map((srv) => {
              const cmd = getSingleCommand(srv.host, srv.port);
              const isSelected = srv.id === activeServerId;

              return (
                <div
                  key={srv.id}
                  className={`bg-[#0a0a0a] border rounded-lg p-3 transition-all ${
                    isSelected ? "border-indigo-500/80 bg-indigo-950/10" : "border-neutral-800 hover:border-neutral-700"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 font-mono">
                      {/* Hardware LED with Ring and Pulse */}
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        {srv.status === 'connected' ? (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                          </>
                        ) : srv.status === 'connecting' ? (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 shadow-[0_0_8px_#f59e0b]" />
                          </>
                        ) : srv.status === 'error' ? (
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500 shadow-[0_0_8px_#ef4444]" />
                        ) : (
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-600" />
                        )}
                      </span>
                      <span className="text-xs font-bold text-white">{srv.id}</span>
                      <span className="text-[10px] text-neutral-500">
                        (Host: {srv.host} | Port: {srv.port})
                      </span>
                      {srv.tagCount > 0 ? (
                        <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] px-2 py-0.5 rounded font-sans">
                          {srv.tagCount} tag{srv.tagCount === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="bg-neutral-800 text-neutral-400 text-[10px] px-1.5 py-0.5 rounded font-sans">
                          Custom Endpoint
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyToClipboard(cmd, `row_${srv.id}`)}
                        className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-semibold px-2.5 py-1 rounded border border-neutral-700 flex items-center gap-1 transition-colors"
                        title="Copy command for this endpoint"
                      >
                        {copiedKey === `row_${srv.id}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#050505] border border-neutral-800/80 rounded px-2.5 py-1.5 font-mono text-[11px] text-neutral-300 overflow-x-auto select-all">
                    <code>{cmd}</code>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Installation Guide & Tips Card */}
      <div className="bg-[#161616] border border-neutral-800 rounded-xl p-4 shadow-md space-y-3">
        <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400" />
          <span>Quick websocat Installation Commands</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Linux (Debian / Ubuntu)</span>
              <button
                onClick={() => copyToClipboard("sudo apt-get install websocat", "inst_linux")}
                className="text-neutral-400 hover:text-white"
              >
                {copiedKey === "inst_linux" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <code className="block bg-[#050505] p-1.5 rounded text-[11px] font-mono text-neutral-300">
              sudo apt-get install websocat
            </code>
          </div>

          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">macOS (Homebrew)</span>
              <button
                onClick={() => copyToClipboard("brew install websocat", "inst_mac")}
                className="text-neutral-400 hover:text-white"
              >
                {copiedKey === "inst_mac" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <code className="block bg-[#050505] p-1.5 rounded text-[11px] font-mono text-neutral-300">
              brew install websocat
            </code>
          </div>

          <div className="bg-[#0a0a0a] border border-neutral-800 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">Windows (winget / choco)</span>
              <button
                onClick={() => copyToClipboard("winget install websocat", "inst_win")}
                className="text-neutral-400 hover:text-white"
              >
                {copiedKey === "inst_win" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <code className="block bg-[#050505] p-1.5 rounded text-[11px] font-mono text-neutral-300">
              winget install websocat
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
