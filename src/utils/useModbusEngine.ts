import { useEffect, useRef, useState, useCallback } from "react";
import { ModbusTag, LogEntry, ModbusServerInstance } from "../types";
import { CircularLogBuffer } from "./circularLogBuffer";

export interface ModbusEngineHook {
  // Single-Tab Session Status
  isMaster: boolean; // Maintained for backward compatibility (equals isTabActive)
  isTabActive: boolean;
  isBlockedByAnotherTab: boolean;
  isTakenOver: boolean;
  takeOverSession: () => void;
  reclaimSession: () => void;
  dismissTakeoverWarning: () => void;

  // Logging Controls & Auto-Stop Timer
  loggingActive: boolean;
  loggingRemainingSeconds: number;
  loggingDurationMinutes: number;
  startLogging: (durationMinutes?: number) => void;
  stopLogging: () => void;
  setLoggingDurationMinutes: (minutes: number) => void;

  // Server & Connection Management
  servers: Map<string, ModbusServerInstance>;
  bridgeHost: string;
  setBridgeHost: (host: string) => void;
  addServer: (server: ModbusServerInstance) => void;
  removeServer: (serverId: string) => void;
  setServerList: (servers: ModbusServerInstance[]) => void;
  connectServer: (serverId: string) => void;
  disconnectServer: (serverId: string) => void;
  connectAllServers: () => void;
  disconnectAllServers: () => void;

  // Logs & Telemetry
  logs: LogEntry[];
  addLog: (log: LogEntry) => void;
  clearLogs: () => void;
  workerActive: boolean;

  // Register & Tag Actions
  writeRegister: (serverId: string, regType: string, address: number, value: any) => void;
  writeTagValue: (tag: ModbusTag, value: number, words?: number[]) => void;
  setTagSimMode: (tagId: string, mode: any, min?: number, max?: number, baseline?: number) => void;
  syncTagsToWorker: (tagsToSync: ModbusTag[]) => void;
}

export function useModbusEngine(
  tags: ModbusTag[],
  onMemoryUpdate: (serverId: string, updates: any[]) => void
): ModbusEngineHook {
  // Unique identifier for this specific browser tab instance
  const tabId = useRef<string>("tab_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now().toString(36)).current;

  // Single-Tab Exclusive Control State
  const [isTabActive, setIsTabActive] = useState<boolean>(false);
  const [isBlockedByAnotherTab, setIsBlockedByAnotherTab] = useState<boolean>(false);
  const [isTakenOver, setIsTakenOver] = useState<boolean>(false);

  const [servers, setServers] = useState<Map<string, ModbusServerInstance>>(new Map());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [workerActive, setWorkerActive] = useState(false);

  // Dedicated Circular (Ring) Log Buffer (fixed 100 entries max)
  const circularLogRef = useRef(new CircularLogBuffer(100));
  const logFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // LOGGING CONTROLS: DISABLED BY DEFAULT ON STARTUP
  const [loggingActive, setLoggingActive] = useState<boolean>(false);
  const loggingActiveRef = useRef<boolean>(false);
  const [loggingDurationMinutes, setLoggingDurationMinutes] = useState<number>(5);
  const [loggingRemainingSeconds, setLoggingRemainingSeconds] = useState<number>(0);
  const loggingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const tabCoordChannelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Throttle UI log flushes to at most once per 150ms
  const scheduleLogFlush = useCallback(() => {
    if (logFlushTimerRef.current) return;
    logFlushTimerRef.current = setTimeout(() => {
      logFlushTimerRef.current = null;
      setLogs(circularLogRef.current.toArray());
    }, 150);
  }, []);

  // Cleanup log flush timer on unmount
  useEffect(() => {
    return () => {
      if (logFlushTimerRef.current) {
        clearTimeout(logFlushTimerRef.current);
        logFlushTimerRef.current = null;
      }
    };
  }, []);

  // STOP LOGGING
  const stopLogging = useCallback(() => {
    if (loggingTimerRef.current) {
      clearInterval(loggingTimerRef.current);
      loggingTimerRef.current = null;
    }
    setLoggingActive(false);
    loggingActiveRef.current = false;
    setLoggingRemainingSeconds(0);
    workerRef.current?.postMessage({ type: 'SET_LOGGING_ACTIVE', active: false });

    // Inform user in buffer that logging was stopped
    circularLogRef.current.push({
      id: `sys_stop_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      serverId: "SYSTEM",
      direction: "info",
      rawBytes: new Uint8Array(0),
      desc: "Telemetry packet logging stopped."
    });
    scheduleLogFlush();
  }, [scheduleLogFlush]);

  // START LOGGING WITH AUTO-STOP TIMER
  const startLogging = useCallback((durationMinutes?: number) => {
    const mins = durationMinutes !== undefined && durationMinutes > 0 ? durationMinutes : loggingDurationMinutes;
    setLoggingDurationMinutes(mins);

    if (loggingTimerRef.current) {
      clearInterval(loggingTimerRef.current);
      loggingTimerRef.current = null;
    }

    setLoggingActive(true);
    loggingActiveRef.current = true;
    const totalSecs = mins * 60;
    setLoggingRemainingSeconds(totalSecs);
    workerRef.current?.postMessage({ type: 'SET_LOGGING_ACTIVE', active: true });

    circularLogRef.current.push({
      id: `sys_start_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      serverId: "SYSTEM",
      direction: "info",
      rawBytes: new Uint8Array(0),
      desc: `Telemetry packet logging started (${mins} min capture timer).`
    });
    scheduleLogFlush();

    loggingTimerRef.current = setInterval(() => {
      setLoggingRemainingSeconds(prev => {
        if (prev <= 1) {
          stopLogging();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [loggingDurationMinutes, stopLogging, scheduleLogFlush]);

  // Cleanup logging countdown timer on unmount
  useEffect(() => {
    return () => {
      if (loggingTimerRef.current) {
        clearInterval(loggingTimerRef.current);
      }
    };
  }, []);

  const [bridgeHost, setBridgeHostState] = useState<string>(() => {
    try {
      return localStorage.getItem("modbus_bridge_host") || "127.0.0.1";
    } catch (_) {
      return "127.0.0.1";
    }
  });

  const setBridgeHost = useCallback((host: string) => {
    const clean = host.trim() || "127.0.0.1";
    setBridgeHostState(clean);
    try {
      localStorage.setItem("modbus_bridge_host", clean);
    } catch (_) {}
    console.info(`%c[ModbusEngine] WebSocket Bridge Host updated to: ${clean}`, "color: #38bdf8; font-weight: bold;");
  }, []);

  // Keep onMemoryUpdate in a ref to avoid effect re-subscriptions
  const onMemoryUpdateRef = useRef(onMemoryUpdate);
  useEffect(() => {
    onMemoryUpdateRef.current = onMemoryUpdate;
  }, [onMemoryUpdate]);

  // Keep tags in a ref for callbacks
  const tagsRef = useRef(tags);
  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  // Web Worker on-demand getter & initializer
  const getOrCreateWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    try {
      console.info("%c[ModbusEngine] Initializing Modbus Background Web Worker...", "color: #818cf8; font-weight: bold;");
      const worker = new Worker(new URL("../workers/modbus.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      setWorkerActive(true);

      worker.onerror = (err: ErrorEvent) => {
        const msg = err?.message || (err?.error && err?.error?.message) || "Worker background event";
        const loc = err?.filename ? ` (${err.filename}:${err.lineno})` : "";
        console.warn(`[ModbusEngine] Web Worker warning: ${msg}${loc}`);
        if (typeof err?.preventDefault === 'function') {
          err.preventDefault();
        }
      };

      worker.onmessage = (e) => {
        try {
          if (!e || !e.data) return;
          if (e.data.type === 'TICK_UPDATES') {
            e.data.payload.forEach((srv: any) => onMemoryUpdateRef.current(srv.serverId, srv.updates));
          } else if (e.data.type === 'CONNECTION_STATUS') {
            const { serverId, status, error } = e.data;
            if (status === 'connected') {
              console.info(`%c[ModbusEngine] Server ${serverId}: CONNECTED TO BRIDGE`, "color: #34d399; font-weight: bold;");
            } else if (status === 'error') {
              console.warn(`%c[ModbusEngine] Server ${serverId}: Bridge offline - ${error || 'Standby'}`, "color: #fbbf24; font-weight: bold;");
            } else if (status === 'disconnected') {
              console.info(`%c[ModbusEngine] Server ${serverId}: DISCONNECTED`, "color: #94a3b8;");
            }
            setServers(prev => {
              const next = new Map(prev);
              const srv = next.get(serverId);
              if (srv) {
                srv.status = status;
                if (error) srv.error = error;
                next.set(serverId, { ...srv });
              }
              return next;
            });
          } else if (e.data.type === 'ADD_LOG') {
            // Only process packet/info logs if user explicitly started logging
            if (loggingActiveRef.current) {
              circularLogRef.current.push({
                id: e.data.id,
                timestamp: new Date().toLocaleTimeString(),
                serverId: e.data.serverId,
                direction: e.data.direction,
                rawBytes: e.data.rawBytes,
                desc: e.data.desc
              });
              scheduleLogFlush();
            }
          }
        } catch (msgErr) {
          console.warn("[ModbusEngine] onmessage handling warning:", msgErr);
        }
      };

      const initialTags = tagsRef.current;
      if (initialTags && initialTags.length > 0) {
        worker.postMessage({ type: 'INIT_TAGS', tags: initialTags });
      }

      // Logging is disabled by default on startup!
      worker.postMessage({ type: 'SET_LOGGING_ACTIVE', active: loggingActiveRef.current });
      worker.postMessage({ type: 'START_SIMULATION' });
      return worker;
    } catch (err: any) {
      console.warn("[ModbusEngine] Warning initializing worker:", err?.message || err);
      return null;
    }
  }, [scheduleLogFlush]);

  // SINGLE-TAB EXCLUSIVE AUTHORITY COORDINATOR
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    try {
      localStorage.setItem("modbus_active_tab_id", tabId);
      localStorage.setItem("modbus_active_tab_hb", Date.now().toString());
    } catch (_) {}

    heartbeatIntervalRef.current = setInterval(() => {
      try {
        localStorage.setItem("modbus_active_tab_hb", Date.now().toString());
      } catch (_) {}
    }, 1500);
  }, [tabId]);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const claimActiveSession = useCallback(() => {
    console.info(`%c[SingleTabCoordinator] Tab ${tabId} claiming exclusive active authority`, "color: #34d399; font-weight: bold;");
    setIsTabActive(true);
    setIsBlockedByAnotherTab(false);
    setIsTakenOver(false);
    startHeartbeat();

    // Broadcast takeover signal to all other tabs
    tabCoordChannelRef.current?.postMessage({
      type: 'TAKE_OVER_SESSION',
      newActiveTabId: tabId
    });
  }, [tabId, startHeartbeat]);

  const yieldActiveSession = useCallback(() => {
    console.warn(`%c[SingleTabCoordinator] Tab ${tabId} yielding active control to another tab`, "color: #fbbf24; font-weight: bold;");
    stopHeartbeat();
    stopLogging();
    setIsTabActive(false);
    setIsTakenOver(true);
    setIsBlockedByAnotherTab(false);

    // Stop and terminate worker
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'STOP_SIMULATION' });
      workerRef.current.terminate();
      workerRef.current = null;
      setWorkerActive(false);
    }
  }, [tabId, stopHeartbeat, stopLogging]);

  const takeOverSession = useCallback(() => {
    claimActiveSession();
  }, [claimActiveSession]);

  const reclaimSession = useCallback(() => {
    claimActiveSession();
  }, [claimActiveSession]);

  const dismissTakeoverWarning = useCallback(() => {
    setIsBlockedByAnotherTab(false);
    setIsTakenOver(false);
  }, []);

  // Single-Tab coordination lifecycle
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("modbus_single_tab_coordinator");
      tabCoordChannelRef.current = channel;

      channel.onmessage = (e) => {
        if (!e || !e.data) return;

        if (e.data.type === 'PING_ACTIVE_TAB') {
          // If we are active, declare our active presence
          try {
            const currentActiveId = localStorage.getItem("modbus_active_tab_id");
            if (currentActiveId === tabId) {
              channel?.postMessage({
                type: 'PONG_ACTIVE_TAB',
                activeTabId: tabId
              });
            }
          } catch (_) {}
        } else if (e.data.type === 'PONG_ACTIVE_TAB') {
          // Another tab responded that it is active
          try {
            const currentActiveId = localStorage.getItem("modbus_active_tab_id");
            if (e.data.activeTabId && e.data.activeTabId !== tabId && currentActiveId === e.data.activeTabId) {
              setIsBlockedByAnotherTab(true);
              setIsTabActive(false);
            }
          } catch (_) {}
        } else if (e.data.type === 'TAKE_OVER_SESSION') {
          // Another tab is taking over exclusive active control
          if (e.data.newActiveTabId && e.data.newActiveTabId !== tabId) {
            yieldActiveSession();
          }
        } else if (e.data.type === 'ACTIVE_TAB_CLOSED') {
          // The previously active tab closed
          try {
            const activeId = localStorage.getItem("modbus_active_tab_id");
            if (activeId === e.data.tabId) {
              localStorage.removeItem("modbus_active_tab_id");
              localStorage.removeItem("modbus_active_tab_hb");
            }
          } catch (_) {}
        }
      };
    }

    // Inspect localStorage to see if another tab is actively running
    let otherTabActive = false;
    try {
      const activeId = localStorage.getItem("modbus_active_tab_id");
      const activeHbStr = localStorage.getItem("modbus_active_tab_hb");
      const activeHb = activeHbStr ? parseInt(activeHbStr, 10) : 0;
      const now = Date.now();

      // If heartbeat was updated within the last 3500ms by another tab
      if (activeId && activeId !== tabId && now - activeHb < 3500) {
        otherTabActive = true;
      }
    } catch (_) {}

    if (otherTabActive) {
      console.warn(`%c[SingleTabCoordinator] Another tab is currently active. Displaying takeover modal.`, "color: #f59e0b; font-weight: bold;");
      setIsBlockedByAnotherTab(true);
      setIsTabActive(false);
      channel?.postMessage({ type: 'PING_ACTIVE_TAB', senderId: tabId });
    } else {
      // No active tab detected, claim active session immediately
      claimActiveSession();
    }

    const handleBeforeUnload = () => {
      try {
        const activeId = localStorage.getItem("modbus_active_tab_id");
        if (activeId === tabId) {
          localStorage.removeItem("modbus_active_tab_id");
          localStorage.removeItem("modbus_active_tab_hb");
          channel?.postMessage({ type: 'ACTIVE_TAB_CLOSED', tabId });
        }
      } catch (_) {}
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      stopHeartbeat();
      if (channel) {
        channel.close();
      }
    };
  }, [tabId, claimActiveSession, yieldActiveSession, stopHeartbeat]);

  // Sync tags with worker whenever tag definitions change
  const lastTagsSignatureRef = useRef<string>("");
  useEffect(() => {
    if (!workerRef.current || !tags || tags.length === 0) return;
    const signature = tags.map(t => `${t.id}:${t.serverId}:${t.modbusAddress}:${t.regBank}:${t.simMode}:${t.dataTypeCode}:${t.reverseSwap}`).join(";");
    if (signature !== lastTagsSignatureRef.current) {
      lastTagsSignatureRef.current = signature;
      workerRef.current.postMessage({ type: 'INIT_TAGS', tags });
    }
  }, [tags]);

  // Run worker ONLY when this tab is the exclusive active tab
  useEffect(() => {
    if (!isTabActive) return;
    const worker = getOrCreateWorker();

    return () => {
      if (worker) {
        worker.postMessage({ type: 'STOP_SIMULATION' });
        worker.terminate();
        workerRef.current = null;
        setWorkerActive(false);
      }
    };
  }, [isTabActive, getOrCreateWorker]);

  const addServer = useCallback((server: ModbusServerInstance) => {
    setServers(prev => {
      const next = new Map(prev);
      const cleanId = server.id.trim();
      next.set(cleanId, { ...server, id: cleanId });
      return next;
    });
  }, []);

  const setServerList = useCallback((serverList: ModbusServerInstance[]) => {
    setServers(prev => {
      const next = new Map<string, ModbusServerInstance>();
      serverList.forEach(s => {
        if (!s || !s.id) return;
        const cleanId = s.id.trim();
        const existing = prev.get(cleanId);
        next.set(cleanId, existing ? { ...existing, ...s, id: cleanId } : { ...s, id: cleanId });
      });
      return next;
    });
  }, []);

  const removeServer = useCallback((serverId: string) => {
    setServers(prev => {
      const next = new Map(prev);
      next.delete(serverId);
      return next;
    });
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'REMOVE_SERVER', serverId });
    }
  }, []);

  const connectServer = useCallback((serverId: string) => {
    console.info(`%c[ModbusEngine] connectServer called for: ${serverId}`, "color: #818cf8; font-weight: bold;");
    const srv = servers.get(serverId);
    if (!srv) {
      console.warn(`[ModbusEngine] Server instance not found in servers map: ${serverId}`);
      return;
    }

    const worker = getOrCreateWorker();
    if (!worker) {
      console.error("[ModbusEngine] Web Worker could not be started.");
      return;
    }

    if (srv.mode === 'tcp' || (!srv.mode && !serverId.startsWith("RTU") && !serverId.startsWith("COM"))) {
      const port = srv.port || (serverId.includes(":") ? parseInt(serverId.split(":")[1], 10) : 5020) || 5020;
      const targetWsHost = srv.wsHost || bridgeHost || "127.0.0.1";

      console.info(`%c[ModbusEngine] Connecting ${serverId} -> ws://${targetWsHost}:${port} (PLC Target: ${srv.host || serverId})`, "color: #38bdf8; font-weight: bold;");

      setServers(prev => {
        const next = new Map(prev);
        const item = next.get(serverId);
        if (item) {
          next.set(serverId, { ...item, status: 'connecting' });
        }
        return next;
      });

      worker.postMessage({
        type: 'CONNECT_TCP',
        serverId,
        ip: targetWsHost,
        port
      });
    }
  }, [servers, bridgeHost, getOrCreateWorker]);

  const disconnectServer = useCallback((serverId: string) => {
    console.info(`[ModbusEngine] Disconnecting server: ${serverId}`);
    if (workerRef.current) {
      setServers(prev => {
        const next = new Map(prev);
        const item = next.get(serverId);
        if (item) {
          next.set(serverId, { ...item, status: 'disconnected' });
        }
        return next;
      });
      workerRef.current.postMessage({ type: 'DISCONNECT', serverId });
    }
  }, []);

  const connectAllServers = useCallback(() => {
    console.info(
      `%c[ModbusEngine] 'Connect All' triggered! Configured servers: ${servers.size}, Bridge Host: ${bridgeHost}`,
      "color: #818cf8; font-weight: bold; font-size: 13px;"
    );

    const worker = getOrCreateWorker();
    if (!worker) {
      console.error("[ModbusEngine] Could not initialize Web Worker for Connect All.");
      return;
    }

    if (servers.size === 0) {
      console.warn("[ModbusEngine] No servers in configuration map to connect.");
      return;
    }

    let tcpCount = 0;
    servers.forEach((srv, sId) => {
      const isTcp = srv.mode === 'tcp' || (!srv.mode && !sId.startsWith("RTU") && !sId.startsWith("COM"));
      if (isTcp) {
        tcpCount++;
        const port = srv.port || (sId.includes(":") ? parseInt(sId.split(":")[1], 10) : 5020) || 5020;
        const targetWsHost = srv.wsHost || bridgeHost || "127.0.0.1";

        console.info(`%c[ModbusEngine] [${tcpCount}/${servers.size}] Dispatching CONNECT_TCP for ${sId} -> ws://${targetWsHost}:${port}`, "color: #34d399; font-weight: bold;");

        setServers(prev => {
          const next = new Map(prev);
          const item = next.get(sId);
          if (item) {
            next.set(sId, { ...item, status: 'connecting' });
          }
          return next;
        });

        worker.postMessage({
          type: 'CONNECT_TCP',
          serverId: sId,
          ip: targetWsHost,
          port
        });
      }
    });

    if (tcpCount === 0) {
      console.warn("[ModbusEngine] No TCP servers found among registered servers to connect.");
    }
  }, [servers, bridgeHost, getOrCreateWorker]);

  const disconnectAllServers = useCallback(() => {
    console.info(`%c[ModbusEngine] 'Disconnect All' triggered!`, "color: #f87171; font-weight: bold;");
    if (!workerRef.current) return;
    servers.forEach((srv, sId) => {
      if (srv.status === 'connected' || srv.status === 'connecting') {
        setServers(prev => {
          const next = new Map(prev);
          const item = next.get(sId);
          if (item) {
            next.set(sId, { ...item, status: 'disconnected' });
          }
          return next;
        });
        workerRef.current?.postMessage({ type: 'DISCONNECT', serverId: sId });
      }
    });
  }, [servers]);

  const addLog = useCallback((entry: LogEntry) => {
    if (!loggingActiveRef.current) return;
    circularLogRef.current.push(entry);
    scheduleLogFlush();
  }, [scheduleLogFlush]);

  const writeRegister = useCallback((serverId: string, regType: string, address: number, value: any) => {
    const worker = getOrCreateWorker();
    if (worker) {
      worker.postMessage({ type: 'WRITE_REGISTER', serverId, regType, address, value });
    }
  }, [getOrCreateWorker]);

  const writeTagValue = useCallback((tag: ModbusTag, value: number, words?: number[]) => {
    const worker = getOrCreateWorker();
    if (worker) {
      worker.postMessage({
        type: 'WRITE_TAG_VALUE',
        serverId: tag.serverId,
        tag,
        value,
        words
      });
    }
  }, [getOrCreateWorker]);

  const setTagSimMode = useCallback((tagId: string, mode: any, min?: number, max?: number, baseline?: number) => {
    const worker = getOrCreateWorker();
    if (worker) {
      const tag = tagsRef.current.find(t => t.id === tagId);
      worker.postMessage({
        type: 'SET_GENERATOR',
        serverId: tag?.serverId || "127.0.0.1:5020",
        tagId,
        key: tag ? `${tag.regBank}_${tag.modbusAddress}` : undefined,
        mode,
        min: min ?? 0,
        max: max ?? 100,
        baseline: baseline ?? (tag ? Number(tag.value) : 100),
        config: { mode, min: min ?? 0, max: max ?? 100, currentSawtooth: min ?? 0 }
      });
    }
  }, [getOrCreateWorker]);

  const syncTagsToWorker = useCallback((tagsToSync: ModbusTag[]) => {
    const worker = getOrCreateWorker();
    if (worker && tagsToSync && tagsToSync.length > 0) {
      worker.postMessage({ type: 'INIT_TAGS', tags: tagsToSync });
    }
  }, [getOrCreateWorker]);

  const clearLogs = useCallback(() => {
    if (logFlushTimerRef.current) {
      clearTimeout(logFlushTimerRef.current);
      logFlushTimerRef.current = null;
    }
    circularLogRef.current.clear();
    setLogs([]);
  }, []);

  return {
    isMaster: isTabActive,
    isTabActive,
    isBlockedByAnotherTab,
    isTakenOver,
    takeOverSession,
    reclaimSession,
    dismissTakeoverWarning,
    loggingActive,
    loggingRemainingSeconds,
    loggingDurationMinutes,
    startLogging,
    stopLogging,
    setLoggingDurationMinutes,
    servers,
    bridgeHost,
    setBridgeHost,
    addServer,
    removeServer,
    setServerList,
    connectServer,
    disconnectServer,
    connectAllServers,
    disconnectAllServers,
    logs,
    addLog,
    clearLogs,
    workerActive,
    writeRegister,
    writeTagValue,
    setTagSimMode,
    syncTagsToWorker
  };
}
