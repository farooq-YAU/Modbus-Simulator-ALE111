import { useCallback, useEffect, useRef, useState } from "react";
import type { LogEntry, ServerInstance, Tag } from "../types";
import { CircularLogBuffer } from "./circularLogBuffer";

const workerUrl = new URL("../workers/modbus.worker.ts", import.meta.url);

export function useModbusEngine(tags: Tag[]) {
  const worker = useRef<Worker | null>(null);
  const buffer = useRef(new CircularLogBuffer());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [servers, setServers] = useState<ServerInstance[]>([]);
  const [memoryTick, setMemoryTick] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const tabId = useRef(crypto.randomUUID());

  useEffect(() => {
    const activeId = localStorage.getItem("modbus_active_tab_id");
    const heartbeat = Number(localStorage.getItem("modbus_active_tab_hb") || 0);
    if (activeId && activeId !== tabId.current && Date.now() - heartbeat < 3500) setIsBlocked(true);
    else { setIsActive(true); localStorage.setItem("modbus_active_tab_id", tabId.current); }
    const heartbeatTimer = setInterval(() => { if (isActive) localStorage.setItem("modbus_active_tab_hb", String(Date.now())); }, 1500);
    const channel = new BroadcastChannel("modbus_single_tab_coordinator");
    channel.onmessage = event => {
      if (event.data.type === "TAKE_OVER" && event.data.tabId !== tabId.current) {
        setIsActive(false); worker.current?.postMessage({ type: "STOP" }); worker.current?.terminate(); worker.current = undefined; setIsBlocked(true);
      }
    };
    return () => { clearInterval(heartbeatTimer); channel.close(); if (localStorage.getItem("modbus_active_tab_id") === tabId.current) { localStorage.removeItem("modbus_active_tab_id"); localStorage.removeItem("modbus_active_tab_hb"); } };
  }, [isActive]);

  const getWorker = useCallback(() => {
    if (!isActive) return undefined;
    if (!worker.current) {
      worker.current = new Worker(workerUrl, { type: "module" });
      worker.current.onmessage = event => {
        if (event.data.type === "LOG") { buffer.current.push(event.data.entry); setLogs(buffer.current.values()); }
        if (event.data.type === "STATUS") setServers(current => current.map(server => server.id === event.data.serverId ? { ...server, status: event.data.status, error: event.data.error } : server));
        if (event.data.type === "MEMORY") setMemoryTick(value => value + 1);
      };
    }
    return worker.current;
  }, [isActive]);

  useEffect(() => { getWorker()?.postMessage({ type: "INIT_TAGS", tags }); }, [getWorker, tags]);
  useEffect(() => () => { worker.current?.postMessage({ type: "STOP" }); worker.current?.terminate(); }, []);

  const takeOver = useCallback(() => { const channel = new BroadcastChannel("modbus_single_tab_coordinator"); channel.postMessage({ type: "TAKE_OVER", tabId: tabId.current }); channel.close(); localStorage.setItem("modbus_active_tab_id", tabId.current); localStorage.setItem("modbus_active_tab_hb", String(Date.now())); setIsBlocked(false); setIsActive(true); }, []);
  const setServerList = useCallback((next: ServerInstance[]) => { setServers(previous => { const currentWorker = getWorker(); previous.filter(server => !next.some(item => item.id === server.id)).forEach(server => currentWorker?.postMessage({ type: "REMOVE_SERVER", serverId: server.id })); return next; }); }, [getWorker]);
  const connect = useCallback((server: ServerInstance) => getWorker()?.postMessage({ type: "CONNECT_TCP", serverId: server.id, host: server.host || "127.0.0.1", port: server.port || 5020 }), [getWorker]);
  const write = useCallback((serverId: string, bank: string, address: number, value: number) => getWorker()?.postMessage({ type: "WRITE", serverId, bank, address, value }), [getWorker]);
  const setLogging = useCallback((active: boolean) => getWorker()?.postMessage({ type: "SET_LOGGING_ACTIVE", active }), [getWorker]);

  return { logs, servers, memoryTick, isActive, isBlocked, takeOver, setServerList, connect, write, setLogging };
}
