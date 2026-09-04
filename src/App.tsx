import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { RegisterType, DataType, LogEntry, ModbusTag, ModbusServerInstance } from "./types";
import { loadTagDatabase, saveTagDatabase, resetFactoryTagDatabase, decodeTagValueFromWords, encodeTagValueToWords, applyTagsToModbusMemory } from "./utils/tagDatabase";
import { ensureUniqueServerPorts, getNextAvailablePort, reassignServerPort } from "./utils/serverPortManager";
import { useModbusEngine } from "./utils/useModbusEngine";
import Header from "./components/Header";
import RegistersTable from "./components/RegistersTable";
import CsvTagDatabaseModal from "./components/CsvTagDatabaseModal";
import SingleTabTakeoverModal from "./components/SingleTabTakeoverModal";

export default function App() {
  const [tags, setTags] = useState<ModbusTag[]>(() => {
    const loaded = loadTagDatabase();
    const checked = ensureUniqueServerPorts(loaded);
    if (checked.hasChanges) {
      saveTagDatabase(checked.tags);
      return checked.tags;
    }
    return loaded;
  });
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<RegisterType>("holdingRegisters");
  const [dataType, setDataType] = useState<DataType>("UInt16");
  const [startAddress, setStartAddress] = useState(0);
  const [count, setCount] = useState(1000);
  const [autoRefresh, setAutoRefresh] = useState(false);
  
  const [activeServerId, setActiveServerId] = useState<string>("ALL");

  const [modbusDbTick, setModbusDbTick] = useState(0);
  const modbusDb = useRef<Record<string, {
    coils: boolean[];
    discreteInputs: boolean[];
    holdingRegisters: number[];
    inputRegisters: number[];
  }>>({});

  const getDb = useCallback((serverId: string) => {
    if (!serverId) {
      if (!modbusDb.current["_empty"]) {
        modbusDb.current["_empty"] = {
          coils: new Array(10000).fill(false),
          discreteInputs: new Array(10000).fill(false),
          holdingRegisters: new Array(10000).fill(0),
          inputRegisters: new Array(10000).fill(0),
        };
      }
      return modbusDb.current["_empty"];
    }
    if (!modbusDb.current[serverId]) {
      modbusDb.current[serverId] = {
        coils: new Array(10000).fill(false),
        discreteInputs: new Array(10000).fill(false),
        holdingRegisters: new Array(10000).fill(0),
        inputRegisters: new Array(10000).fill(0),
      };
    }
    return modbusDb.current[serverId];
  }, []);

  const handleMemoryUpdate = useCallback((serverId: string, updates: any[]) => {
    const db = getDb(serverId);
    const tagUpdatesMap = new Map<string, any>();

    updates.forEach(u => {
      (db as any)[u.regType][u.address] = u.value;
      if (u.tagId && u.tagValue !== undefined) {
        tagUpdatesMap.set(u.tagId, u.tagValue);
      }
    });

    if (tagUpdatesMap.size > 0) {
      setTags(prevTags => {
        let changed = false;
        const next = prevTags.map(t => {
          if (tagUpdatesMap.has(t.id)) {
            const newVal = tagUpdatesMap.get(t.id);
            if (t.value !== newVal) {
              changed = true;
              return { ...t, value: newVal };
            }
          }
          return t;
        });
        return changed ? next : prevTags;
      });
    }

    setModbusDbTick(prev => (prev + 1) % 100000);
  }, [getDb]);

  const {
    isMaster,
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
    syncTagsToWorker,
    bridgeHost,
    setBridgeHost
  } = useModbusEngine(tags, handleMemoryUpdate);

  const [customServerList, setCustomServerList] = useState<ModbusServerInstance[]>([]);

  // Derive all unique server IDs present in the tags database (stable across value ticks)
  const serverIdsKey = useMemo(() => {
    const set = new Set<string>();
    tags.forEach(t => {
      if (t.serverId) {
        const clean = t.serverId.trim();
        if (clean) set.add(clean);
      }
    });
    return Array.from(set).sort().join("|");
  }, [tags]);

  const tagServerIds = useMemo(() => {
    return serverIdsKey ? serverIdsKey.split("|") : [];
  }, [serverIdsKey]);

  // Auto-register & sync server instances for all unique serverIds found in tags + custom added endpoints
  useEffect(() => {
    const tagServers: ModbusServerInstance[] = tagServerIds.map(sId => {
      const isRtu = sId.startsWith("RTU") || sId.startsWith("COM") || !sId.includes(":");
      if (isRtu) {
        return {
          id: sId,
          mode: "rtu",
          portName: sId,
          baudRate: 9600,
          status: "disconnected"
        };
      }
      const parts = sId.split(":");
      const host = parts[0] || "127.0.0.1";
      const port = parseInt(parts[1], 10) || 5020;
      return {
        id: sId,
        mode: "tcp",
        host,
        port,
        status: "disconnected"
      };
    });

    // Merge tag servers and custom servers without duplicates
    const mergedMap = new Map<string, ModbusServerInstance>();
    tagServers.forEach(s => mergedMap.set(s.id, s));
    customServerList.forEach(s => {
      if (!mergedMap.has(s.id)) {
        mergedMap.set(s.id, s);
      }
    });

    setServerList(Array.from(mergedMap.values()));
  }, [tagServerIds, customServerList, setServerList]);

  // Keep activeServerId aligned with available tag servers
  useEffect(() => {
    if (activeServerId === "ALL") return;
    const allAvailableIds = new Set([...tagServerIds, ...customServerList.map(s => s.id)]);
    if (allAvailableIds.size > 0 && activeServerId !== "" && !allAvailableIds.has(activeServerId)) {
      setActiveServerId("ALL");
    }
  }, [tagServerIds, customServerList, activeServerId]);

  // Initial & structural memory population from tags (runs on mount, CSV import, or structural changes)
  const lastPopulatedStructureRef = useRef<string>("");
  useEffect(() => {
    const structuralSig = `${tags.length}_${serverIdsKey}`;
    if (lastPopulatedStructureRef.current === structuralSig) {
      return;
    }
    lastPopulatedStructureRef.current = structuralSig;

    const tagsByServer: Record<string, ModbusTag[]> = {};
    tags.forEach(tag => {
      const sId = tag.serverId || (activeServerId === "ALL" ? tagServerIds[0] : activeServerId);
      if (!sId) return;
      if (!tagsByServer[sId]) tagsByServer[sId] = [];
      tagsByServer[sId].push(tag);
    });

    Object.entries(tagsByServer).forEach(([sId, sTags]) => {
      const db = getDb(sId);
      applyTagsToModbusMemory(sTags, db);
    });
  }, [tags, getDb, activeServerId, tagServerIds, serverIdsKey]);

  const activeDb = getDb(activeServerId === "ALL" ? (tagServerIds[0] || "") : activeServerId);

  // Active tags matching selected server
  const activeTags = useMemo(() => {
    if (!activeServerId || activeServerId === "ALL") return tags;
    return tags.filter(t => t.serverId === activeServerId);
  }, [tags, activeServerId]);

  const handleUpdateTags = useCallback((newTags: ModbusTag[]) => {
    const checked = ensureUniqueServerPorts(newTags, customServerList);
    const finalTags = checked.hasChanges ? checked.tags : newTags;
    setTags(finalTags);
    saveTagDatabase(finalTags);
    syncTagsToWorker(finalTags);
  }, [customServerList, syncTagsToWorker]);

  const handleResetFactoryDefaults = useCallback(() => {
    const defaults = resetFactoryTagDatabase();
    setCustomServerList([]);
    setTags(defaults);
    syncTagsToWorker(defaults);
  }, [syncTagsToWorker]);

  const activeServer = servers.get(activeServerId);
  const isInIframe = typeof window !== "undefined" && window.self !== window.top;

  const tagCountsByServer = useMemo(() => {
    const counts: Record<string, number> = {};
    tags.forEach(t => {
      if (t.serverId) {
        counts[t.serverId] = (counts[t.serverId] || 0) + 1;
      }
    });
    return counts;
  }, [tags]);

  const handleAddCustomServer = useCallback((input: string) => {
    const clean = input.trim();
    if (!clean) return;

    const allServers = Array.from(servers.values());
    const isRtu = clean.startsWith("RTU") || clean.startsWith("COM");
    if (isRtu) {
      const newServer: ModbusServerInstance = {
        id: clean,
        mode: "rtu",
        comPort: clean,
        status: "disconnected"
      };
      setCustomServerList(prev => prev.some(s => s.id === clean) ? prev : [...prev, newServer]);
      addServer(newServer);
      return;
    }

    let host = clean;
    let requestedPort: number | null = null;
    if (clean.includes(":")) {
      const parts = clean.split(":");
      host = parts[0] || "127.0.0.1";
      const p = parseInt(parts[1], 10);
      if (!isNaN(p) && p > 0) requestedPort = p;
    }

    // Ensure distinct WebSocket port for each slave endpoint to avoid websocat collisions
    const usedPorts = new Set(allServers.map(s => s.port).filter(Boolean));
    let finalPort: number;
    if (requestedPort !== null && !usedPorts.has(requestedPort)) {
      finalPort = requestedPort;
    } else {
      finalPort = getNextAvailablePort(allServers, 5020);
    }

    const normalizedId = `${host}:${finalPort}`;
    const newServer: ModbusServerInstance = {
      id: normalizedId,
      mode: "tcp",
      host,
      port: finalPort,
      status: "disconnected"
    };
    setCustomServerList(prev => {
      if (prev.some(s => s.id === normalizedId)) return prev;
      return [...prev, newServer];
    });
    addServer(newServer);
  }, [servers, addServer]);

  const handleReassignServerPort = useCallback((oldServerId: string, newPort: number) => {
    const allServers = Array.from(servers.values());
    const result = reassignServerPort(oldServerId, newPort, tags, allServers);
    setTags(result.tags);
    saveTagDatabase(result.tags);
    syncTagsToWorker(result.tags);
    setServerList(result.servers);
    setCustomServerList(result.servers.filter(s => !tagServerIds.includes(s.id)));
    if (activeServerId === oldServerId) {
      setActiveServerId(result.newServerId);
    }
  }, [servers, tags, syncTagsToWorker, setServerList, tagServerIds, activeServerId]);

  const handleAutoAssignPorts = useCallback(() => {
    const allServers = Array.from(servers.values());
    const tcpServers = allServers.filter(s => s.mode === "tcp" || s.id.includes(":"));
    let nextPort = 5020;
    let currentTags = [...tags];
    let currentServers = [...allServers];

    tcpServers.forEach(srv => {
      const result = reassignServerPort(srv.id, nextPort++, currentTags, currentServers);
      currentTags = result.tags;
      currentServers = result.servers;
    });

    setTags(currentTags);
    saveTagDatabase(currentTags);
    syncTagsToWorker(currentTags);
    setServerList(currentServers);
  }, [servers, tags, syncTagsToWorker, setServerList]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-slate-300 font-sans flex flex-col">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeServerId={activeServerId}
        servers={Array.from(servers.values())}
        onServerSelect={setActiveServerId}
        onAddServer={handleAddCustomServer}
        tagCountsByServer={tagCountsByServer}
        isMaster={isMaster}
        onFactoryReset={handleResetFactoryDefaults}
        onConnectAll={connectAllServers}
        onDisconnectAll={disconnectAllServers}
        isTabActive={isTabActive}
        onTakeOver={takeOverSession}
        loggingActive={loggingActive}
        loggingRemainingSeconds={loggingRemainingSeconds}
        onStartLogging={startLogging}
        onStopLogging={stopLogging}
      />

      {isInIframe && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2 w-full">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Running in preview iframe:</strong> Browser permissions block Web Serial / USB hardware access inside embedded frames.
            </span>
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 px-2.5 py-1 rounded font-semibold flex items-center gap-1 transition-colors shrink-0"
            >
              <span>Open in New Tab</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      <main className="flex-1 w-full px-2 sm:px-3 py-2 flex overflow-hidden h-[calc(100vh-56px)]">
        {/* FULL WIDTH REGISTERS & TAG DATABASE WORKBENCH WITH SETTINGS TAB */}
        <div className="flex-1 w-full bg-[#111] border border-neutral-800 rounded-lg flex flex-col shadow-xl min-w-0">
          <RegistersTable
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            modbusDb={activeDb}
            getDb={getDb}
            modbusDbTick={modbusDbTick}
            tags={activeTags}
            allTags={tags}
            onUpdateTags={handleUpdateTags}
            onFactoryReset={handleResetFactoryDefaults}
            onUpdateTag={(updatedTag) => {
              const newTags = tags.map((t) => (t.id === updatedTag.id ? updatedTag : t));
              handleUpdateTags(newTags);
              setTagSimMode(updatedTag.id, updatedTag.simMode, 0, 100, Number(updatedTag.value) || 100);
            }}
            dataType={dataType}
            setDataType={setDataType}
            startAddress={startAddress}
            setStartAddress={setStartAddress}
            count={count}
            setCount={setCount}
            onManualWrite={(regType, address, val, tag) => {
              if (tag) {
                const sId = tag.serverId || (activeServerId === "ALL" ? (tagServerIds[0] || "127.0.0.1:5020") : activeServerId);
                const updatedTag: ModbusTag = {
                  ...tag,
                  serverId: sId,
                  value: val,
                  simMode: "constant" // Rule 4.5: lock to static on manual edit
                };

                setTags(prev => {
                  const next = prev.map(t => t.id === tag.id ? updatedTag : t);
                  saveTagDatabase(next);
                  return next;
                });

                const db = getDb(sId);
                const isBit = tag.regBank === "coils" || tag.regBank === "discreteInputs";
                let words: number[] = [];
                if (isBit) {
                  (db as any)[tag.regBank][address] = Boolean(val);
                } else {
                  words = encodeTagValueToWords(updatedTag, val);
                  words.forEach((w, offset) => {
                    if (address + offset < 10000) {
                      (db as any)[tag.regBank][address + offset] = w;
                    }
                  });
                }

                writeTagValue(updatedTag, val, words);
                setModbusDbTick(prev => prev + 1);
              } else {
                const targetServerId = activeServerId === "ALL" ? (tagServerIds[0] || "127.0.0.1:5020") : activeServerId;
                const db = getDb(targetServerId);
                (db as any)[regType][address] = val;
                writeRegister(targetServerId, regType, address, val);
                setModbusDbTick(prev => prev + 1);
              }
            }}
            loading={!workerActive}
            autoRefresh={autoRefresh}
            setAutoRefresh={setAutoRefresh}
            // Server Settings & Logs Props
            activeServer={activeServer}
            activeServerId={activeServerId}
            servers={Array.from(servers.values())}
            onServerSelect={setActiveServerId}
            onConnectServer={connectServer}
            onDisconnectServer={disconnectServer}
            onConnectAll={connectAllServers}
            onDisconnectAll={disconnectAllServers}
            onAddServer={handleAddCustomServer}
            logs={logs}
            onClearLogs={clearLogs}
            bridgeHost={bridgeHost}
            onBridgeHostChange={setBridgeHost}
            onReassignServerPort={handleReassignServerPort}
            onAutoAssignPorts={handleAutoAssignPorts}
            loggingActive={loggingActive}
            loggingRemainingSeconds={loggingRemainingSeconds}
            loggingDurationMinutes={loggingDurationMinutes}
            onStartLogging={startLogging}
            onStopLogging={stopLogging}
            onSetLoggingDurationMinutes={setLoggingDurationMinutes}
          />
        </div>
      </main>

      {/* Single Active Tab Takeover Modal Warning */}
      <SingleTabTakeoverModal
        isBlockedByAnotherTab={isBlockedByAnotherTab}
        isTakenOver={isTakenOver}
        onTakeOver={takeOverSession}
        onDismiss={dismissTakeoverWarning}
      />

      {isCsvModalOpen && (
        <CsvTagDatabaseModal
          onClose={() => setIsCsvModalOpen(false)}
          tags={tags}
          activeServerId={activeServerId}
          servers={Array.from(servers.values())}
          onServerSelect={setActiveServerId}
          onUpdateTags={handleUpdateTags}
          onFactoryReset={handleResetFactoryDefaults}
        />
      )}
    </div>
  );
}
