/// <reference lib="webworker" />
import { ModbusServerInstance, LogEntry, RegisterType, GeneratorConfig, ModbusTag, SimPattern } from '../types';

// Web worker global safety handlers
self.onerror = (message, filename, lineno, colno, error) => {
  console.warn(`[Modbus Worker Internal Handled] ${message} at ${filename}:${lineno}:${colno}`);
  return true;
};

self.onunhandledrejection = (event) => {
  console.warn('[Modbus Worker Handled Rejection]', event?.reason?.message || event?.reason || 'Unknown rejection');
  event.preventDefault();
};

interface WorkerGenerator {
  tagId: string;
  regBank: RegisterType;
  address: number;
  dataTypeCode: number;
  wordSize: number;
  reverseSwap: number;
  mode: SimPattern | 'none' | 'random' | 'sawtooth' | 'toggle';
  min: number;
  max: number;
  baseline: number;
  currentVal: number;
  phase: number;
}

interface ServerState {
  coils: boolean[];
  discreteInputs: boolean[];
  holdingRegisters: number[];
  inputRegisters: number[];
  generators: Record<string, WorkerGenerator>;
  dataType: string;
  ws?: WebSocket;
}

const servers = new Map<string, ServerState>();
let tickerInterval: any = null;

function getOrCreateServer(serverId: string): ServerState {
  if (!servers.has(serverId)) {
    servers.set(serverId, {
      coils: new Array(10000).fill(false),
      discreteInputs: new Array(10000).fill(false),
      holdingRegisters: new Array(10000).fill(0),
      inputRegisters: new Array(10000).fill(0),
      generators: {},
      dataType: "UInt16"
    });
  }
  return servers.get(serverId)!;
}

function reverse16Bits(n: number): number {
  let res = 0;
  for (let i = 0; i < 16; i++) {
    res = (res << 1) | ((n >> i) & 1);
  }
  return res & 0xffff;
}

function encodeTagWords(dataTypeCode: number, reverseSwap: number, v: number): number[] {
  const isSwapped = reverseSwap === 2;

  if (dataTypeCode === 5 || dataTypeCode === 11) {
    // 32-bit Float (2 words)
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, v, false);
    const w0 = view.getUint16(0, false);
    const w1 = view.getUint16(2, false);
    return isSwapped ? [w1, w0] : [w0, w1];
  } else if (dataTypeCode === 2 || dataTypeCode === 4 || dataTypeCode === 8 || dataTypeCode === 10) {
    // 32-bit Int/DWord (2 words)
    const view = new DataView(new ArrayBuffer(4));
    if (dataTypeCode === 2 || dataTypeCode === 8) view.setInt32(0, v, false);
    else view.setUint32(0, v, false);
    const w0 = view.getUint16(0, false);
    const w1 = view.getUint16(2, false);
    return isSwapped ? [w1, w0] : [w0, w1];
  } else if (dataTypeCode === 6 || dataTypeCode === 12) {
    // 64-bit Float (4 words)
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, v, false);
    return [
      view.getUint16(0, false),
      view.getUint16(2, false),
      view.getUint16(4, false),
      view.getUint16(6, false),
    ];
  } else if (dataTypeCode === 13 || dataTypeCode === 14) {
    // 16-bit Status / Command Discrete Register (Bit swap if reverseSwap === 1)
    const raw = (Math.round(v) || 0) & 0xffff;
    return [reverseSwap === 1 ? reverse16Bits(raw) : raw];
  } else if (dataTypeCode === 1 || dataTypeCode === 7) {
    // 16-bit Signed Int
    let intVal = Math.max(-32768, Math.min(32767, Math.round(v)));
    if (intVal < 0) intVal += 65536;
    return [intVal & 0xffff];
  } else {
    // 16-bit Int/Word
    return [Math.round(v) & 0xffff];
  }
}

function startTicker() {
  if (tickerInterval) clearInterval(tickerInterval);
  
  tickerInterval = setInterval(() => {
    try {
      let globalChanged = false;
      const allUpdates: any[] = [];

      for (const [serverId, state] of servers.entries()) {
        const updates: Array<{ regType: string; address: number; value: any; tagId?: string; tagValue?: any }> = [];
        let changed = false;

        Object.values(state.generators || {}).forEach((gen) => {
          if (!gen || gen.mode === 'constant' || gen.mode === 'none') return;
          const { regBank, address, dataTypeCode, wordSize, reverseSwap } = gen;
          if (typeof address !== 'number' || isNaN(address) || address < 0 || address + (wordSize || 1) > 10000) return;
          if (!regBank || !(state as any)[regBank]) return;

          const isBit = regBank === "coils" || regBank === "discreteInputs";
          if (isBit) {
            if (gen.mode === 'sine' || gen.mode === 'ramp' || gen.mode === 'toggle' || gen.mode === 'sawtooth') {
              gen.phase = (gen.phase || 0) + 1;
              if (gen.phase % 2 === 0) {
                const currentVal = Boolean((state as any)[regBank][address]);
                const newVal = !currentVal;
                (state as any)[regBank][address] = newVal;
                gen.currentVal = newVal ? 1 : 0;
                updates.push({ regType: regBank, address, value: newVal, tagId: gen.tagId, tagValue: newVal ? 1 : 0 });
                changed = true;
              }
            } else if (gen.mode === 'noise' || gen.mode === 'random') {
              const newVal = Math.random() < 0.5;
              const currentVal = Boolean((state as any)[regBank][address]);
              if (newVal !== currentVal) {
                (state as any)[regBank][address] = newVal;
                gen.currentVal = newVal ? 1 : 0;
                updates.push({ regType: regBank, address, value: newVal, tagId: gen.tagId, tagValue: newVal ? 1 : 0 });
                changed = true;
              }
            }
            return;
          }

          // Analog register (holdingRegisters or inputRegisters)
          const isFloat = (dataTypeCode === 5 || dataTypeCode === 11 || dataTypeCode === 6 || dataTypeCode === 12);
          const baseline = typeof gen.baseline === 'number' ? gen.baseline : (gen.currentVal || 100.0);
          const min = typeof gen.min === 'number' ? gen.min : Math.min(0, baseline - 50);
          const max = typeof gen.max === 'number' ? gen.max : Math.max(100, baseline + 50);
          const span = Math.max(10, max - min);
          let newVal = baseline;

          if (gen.mode === 'sine') {
            gen.phase = (gen.phase || 0) + 0.15;
            const amplitude = span / 2;
            const center = (min + max) / 2;
            newVal = center + amplitude * Math.sin(gen.phase);
          } else if (gen.mode === 'ramp' || gen.mode === 'sawtooth') {
            const step = Math.max(isFloat ? 0.5 : 1, span / 15);
            let next = (typeof gen.currentVal === 'number' ? gen.currentVal : min) + step;
            if (next > max || next < min) {
              next = min;
            }
            gen.currentVal = next;
            newVal = next;
          } else if (gen.mode === 'noise' || gen.mode === 'random') {
            const noiseAmp = span * 0.12;
            newVal = baseline + (Math.random() * 2 - 1) * noiseAmp;
          }

          if (isFloat) {
            newVal = parseFloat(newVal.toFixed(2));
          } else {
            newVal = Math.round(newVal);
          }
          gen.currentVal = newVal;

          const words = encodeTagWords(dataTypeCode, reverseSwap, newVal);
          let wordChanged = false;
          for (let offset = 0; offset < words.length; offset++) {
            const targetAddr = address + offset;
            if (targetAddr >= 10000) break;
            const wVal = words[offset];
            if ((state as any)[regBank][targetAddr] !== wVal) {
              (state as any)[regBank][targetAddr] = wVal;
              updates.push({ regType: regBank, address: targetAddr, value: wVal });
              wordChanged = true;
            }
          }
          if (wordChanged) {
            updates.push({ regType: regBank, address, value: words[0], tagId: gen.tagId, tagValue: newVal });
            changed = true;
          }
        });

        if (changed) {
          globalChanged = true;
          allUpdates.push({ serverId, updates });
        }
      }

      if (globalChanged) {
        postMessage({ type: 'TICK_UPDATES', payload: allUpdates });
      }
    } catch (tickerErr) {
      console.warn('[Modbus Worker] Ticker warning:', tickerErr);
    }
  }, 1000);
}

function normalizeWsUrl(ip: string, port: number): string {
  const clean = ip.trim();
  if (clean.startsWith("ws://") || clean.startsWith("wss://")) {
    return clean;
  }
  if (clean.includes(":")) {
    const parts = clean.split(":");
    const h = parts[0] || "127.0.0.1";
    const p = parts[1] || port;
    return `ws://${h}:${p}`;
  }
  return `ws://${clean}:${port}`;
}

function handleConnectTCP(serverId: string, ip: string, port: number) {
  postMessage({ type: 'CONNECTION_STATUS', serverId, status: 'connecting' });
  const state = getOrCreateServer(serverId);
  if (state.ws) {
    try {
      state.ws.close();
    } catch (_) {}
    state.ws = undefined;
  }
  
  const wsUrl = normalizeWsUrl(ip, port);
  console.info(`%c[Modbus Worker] Connecting to WebSocket bridge: ${wsUrl} (Server ID: ${serverId})`, "color: #818cf8; font-weight: bold;");

  // Check Mixed Content in Worker context
  const isHttps = typeof self !== 'undefined' && self.location && self.location.protocol === 'https:';
  const isLocal = wsUrl.includes('localhost') || wsUrl.includes('127.0.0.1');
  if (isHttps && wsUrl.startsWith('ws://') && !isLocal) {
    const warnMsg = `[Mixed Content Warning] Current origin is HTTPS (${self.location.origin}). Insecure WebSocket (${wsUrl}) to a remote IP will be blocked by modern browser security policies. Use WSS (wss://) or run websocat on localhost / 127.0.0.1.`;
    console.warn(`%c${warnMsg}`, "color: #fbbf24; font-weight: bold;");
    addLog(serverId, 'error', new Uint8Array(), warnMsg);
  }

  try {
    const socket = new WebSocket(wsUrl);
    socket.binaryType = 'arraybuffer';
    state.ws = socket;
    
    socket.onopen = () => {
      console.info(`%c[Modbus Worker] WebSocket connection established successfully: ${wsUrl}`, "color: #34d399; font-weight: bold;");
      postMessage({ type: 'CONNECTION_STATUS', serverId, status: 'connected' });
      addLog(serverId, 'info', new Uint8Array(), `Connected to websocat bridge at ${wsUrl}`);
    };
    
    socket.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const rawBytes = new Uint8Array(event.data);
        addLog(serverId, 'rx', rawBytes, 'Received TCP frame from bridge');
        const res = processTcpPacket(serverId, rawBytes);
        if (res && socket.readyState === WebSocket.OPEN) {
          socket.send(res);
          addLog(serverId, 'tx', res, 'Sent TCP response');
        }
      }
    };
    
    socket.onerror = () => {
      const errMsg = `WebSocket bridge at ${wsUrl} is currently unreachable. Please ensure websocat bridge is listening.`;
      console.warn(`[Modbus Worker] ${errMsg}`);
      postMessage({ type: 'CONNECTION_STATUS', serverId, status: 'error', error: errMsg });
      addLog(serverId, 'error', new Uint8Array(), errMsg);
    };
    
    socket.onclose = (event) => {
      console.info(`[Modbus Worker] WebSocket connection closed for ${serverId} (Code: ${event.code})`);
      postMessage({ type: 'CONNECTION_STATUS', serverId, status: 'disconnected' });
      addLog(serverId, 'info', new Uint8Array(), `WebSocket bridge disconnected (code: ${event.code})`);
    };
  } catch (e: any) {
    const failMsg = `Unable to initiate WebSocket to ${wsUrl}: ${e?.message || 'Host bridge offline'}`;
    console.warn(`[Modbus Worker] ${failMsg}`);
    postMessage({ type: 'CONNECTION_STATUS', serverId, status: 'error', error: failMsg });
    addLog(serverId, 'error', new Uint8Array(), failMsg);
  }
}

function processTcpPacket(serverId: string, buffer: Uint8Array): Uint8Array | null {
  if (buffer.length < 8) return null;

  const state = getOrCreateServer(serverId);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  
  const transId = view.getUint16(0, false);
  const protoId = view.getUint16(2, false);
  const len = view.getUint16(4, false);
  const unitId = buffer[6];
  const funcCode = buffer[7];

  let responsePayload: number[] = [];
  const updates: Array<{ regType: string; address: number; value: any }> = [];

  try {
    if (funcCode === 1 || funcCode === 2) {
      const addr = view.getUint16(8, false);
      const qty = view.getUint16(10, false);
      const byteCount = Math.ceil(qty / 8);
      responsePayload.push(funcCode, byteCount);

      const targetBank = funcCode === 1 ? state.coils : state.discreteInputs;
      let currentByte = 0;
      for (let i = 0; i < qty; i++) {
        const bit = targetBank[addr + i] || false;
        if (bit) currentByte |= 1 << (i % 8);
        if (i % 8 === 7 || i === qty - 1) {
          responsePayload.push(currentByte);
          currentByte = 0;
        }
      }
    } else if (funcCode === 3 || funcCode === 4) {
      const addr = view.getUint16(8, false);
      const qty = view.getUint16(10, false);
      const byteCount = qty * 2;
      responsePayload.push(funcCode, byteCount);

      const targetBank = funcCode === 3 ? state.holdingRegisters : state.inputRegisters;
      for (let i = 0; i < qty; i++) {
        const val = targetBank[addr + i] || 0;
        responsePayload.push((val >> 8) & 0xff, val & 0xff);
      }
    } else if (funcCode === 5) {
      const addr = view.getUint16(8, false);
      const val = view.getUint16(10, false);
      const boolVal = val === 0xff00;
      state.coils[addr] = boolVal;
      updates.push({ regType: 'coils', address: addr, value: boolVal });
      responsePayload.push(funcCode, buffer[8], buffer[9], buffer[10], buffer[11]);
    } else if (funcCode === 6) {
      const addr = view.getUint16(8, false);
      const val = view.getUint16(10, false);
      state.holdingRegisters[addr] = val;
      updates.push({ regType: 'holdingRegisters', address: addr, value: val });
      responsePayload.push(funcCode, buffer[8], buffer[9], buffer[10], buffer[11]);
    } else if (funcCode === 15) {
      const addr = view.getUint16(8, false);
      const qty = view.getUint16(10, false);
      for (let i = 0; i < qty; i++) {
        const byteIndex = Math.floor(i / 8);
        const bitIndex = i % 8;
        const bit = (buffer[13 + byteIndex] & (1 << bitIndex)) !== 0;
        state.coils[addr + i] = bit;
        updates.push({ regType: 'coils', address: addr + i, value: bit });
      }
      responsePayload.push(funcCode, buffer[8], buffer[9], buffer[10], buffer[11]);
    } else if (funcCode === 16) {
      const addr = view.getUint16(8, false);
      const qty = view.getUint16(10, false);
      for (let i = 0; i < qty; i++) {
        const val = view.getUint16(13 + i * 2, false);
        state.holdingRegisters[addr + i] = val;
        updates.push({ regType: 'holdingRegisters', address: addr + i, value: val });
      }
      responsePayload.push(funcCode, buffer[8], buffer[9], buffer[10], buffer[11]);
    } else {
      // Exception
      responsePayload.push(funcCode | 0x80, 0x01);
    }
  } catch (e) {
    responsePayload = [funcCode | 0x80, 0x04];
  }

  if (updates.length > 0) {
    postMessage({ type: 'TICK_UPDATES', payload: [{ serverId, updates }] });
  }

  const mbapLen = responsePayload.length + 1;
  const resBuffer = new Uint8Array(7 + responsePayload.length);
  const resView = new DataView(resBuffer.buffer);
  
  resView.setUint16(0, transId, false);
  resView.setUint16(2, protoId, false);
  resView.setUint16(4, mbapLen, false);
  resBuffer[6] = unitId;

  for (let i = 0; i < responsePayload.length; i++) {
    resBuffer[7 + i] = responsePayload[i];
  }

  return resBuffer;
}

let isLoggingActive = false;
const lastLogTime = new Map<string, number>();
let workerLogIdCounter = 0;

function addLog(serverId: string, direction: "tx" | "rx" | "info" | "error", rawBytes: Uint8Array, desc: string) {
  // Suppress all packet and activity logging unless explicitly activated by user
  if (!isLoggingActive) {
    return;
  }

  const now = performance.now();
  if (direction === "rx" || direction === "tx") {
    // Rate-limit fast-path RX and TX frames to max ~10 logs/sec per server to prevent message queue memory growth
    const key = `${serverId}_${direction}`;
    const last = lastLogTime.get(key) || 0;
    if (now - last < 100) {
      return;
    }
    lastLogTime.set(key, now);
  } else {
    // Rate-limit identical info/error logs to at most once per 500ms to avoid bridge reconnect spam
    const descKey = `${serverId}_${direction}_${desc}`;
    const last = lastLogTime.get(descKey) || 0;
    if (now - last < 500) {
      return;
    }
    lastLogTime.set(descKey, now);
  }

  // Truncate rawBytes to max 32 bytes and copy to a small independent Uint8Array
  // This allows the incoming WebSocket ArrayBuffer to be immediately garbage collected!
  let safeBytes: Uint8Array;
  if (rawBytes && rawBytes.length > 0) {
    const len = Math.min(rawBytes.length, 32);
    safeBytes = new Uint8Array(len);
    safeBytes.set(rawBytes.subarray(0, len));
  } else {
    safeBytes = new Uint8Array(0);
  }

  if (workerLogIdCounter > 1000000) {
    workerLogIdCounter = 0;
  }

  postMessage({
    type: 'ADD_LOG',
    id: `wlog_${++workerLogIdCounter}`,
    serverId,
    direction,
    rawBytes: safeBytes,
    desc
  });
}

onmessage = (e: MessageEvent) => {
  try {
    if (!e || !e.data) return;
    const { type, serverId } = e.data;
    
    if (type === 'INIT_TAGS') {
      const tags: ModbusTag[] = Array.isArray(e.data.tags) ? e.data.tags : [];
      const validBanks: RegisterType[] = ["coils", "discreteInputs", "holdingRegisters", "inputRegisters"];

      // Reset/populate servers and generators from tags
      tags.forEach(t => {
        if (!t) return;
        const sId = (t.serverId || "127.0.0.1:5020").trim();
        const sState = getOrCreateServer(sId);
        
        let regBank: RegisterType = t.regBank;
        if (!validBanks.includes(regBank)) {
          if ((regBank as any) === "holding") regBank = "holdingRegisters";
          else if ((regBank as any) === "input") regBank = "inputRegisters";
          else if ((regBank as any) === "coil") regBank = "coils";
          else if ((regBank as any) === "discreteInput") regBank = "discreteInputs";
          else regBank = "holdingRegisters";
        }

        const isBit = regBank === "coils" || regBank === "discreteInputs";
        const address = typeof t.modbusAddress === 'number' && !isNaN(t.modbusAddress) ? t.modbusAddress : 0;
        if (address < 0 || address >= 10000) return;

        if (isBit) {
          if ((sState as any)[regBank]) {
            (sState as any)[regBank][address] = Boolean(t.value);
          }
        } else {
          const words = encodeTagWords(Number(t.dataTypeCode) || 3, Number(t.reverseSwap) || 2, Number(t.value) || 0);
          for (let i = 0; i < words.length; i++) {
            if (address + i < 10000 && (sState as any)[regBank]) {
              (sState as any)[regBank][address + i] = words[i];
            }
          }
        }

        if (t.id) {
          sState.generators[t.id] = {
            tagId: t.id,
            regBank,
            address,
            dataTypeCode: Number(t.dataTypeCode) || 3,
            wordSize: Number(t.wordSize) || 1,
            reverseSwap: Number(t.reverseSwap) || 2,
            mode: t.simMode || 'constant',
            min: 0,
            max: Math.max(100, (Number(t.value) || 0) * 1.5),
            baseline: Number(t.value) || 100,
            currentVal: Number(t.value) || 100,
            phase: Math.random() * Math.PI * 2,
          };
        }
      });
    }
    else if (type === 'INIT_DATABASE') {
      const sState = getOrCreateServer(serverId);
      if (e.data.coils) sState.coils = e.data.coils;
      if (e.data.discreteInputs) sState.discreteInputs = e.data.discreteInputs;
      if (e.data.holdingRegisters) sState.holdingRegisters = e.data.holdingRegisters;
      if (e.data.inputRegisters) sState.inputRegisters = e.data.inputRegisters;
    }
    else if (type === 'SET_GENERATOR') {
      const { tagId, mode, min, max, baseline } = e.data;
      servers.forEach((sState) => {
        if (sState.generators[tagId]) {
          sState.generators[tagId].mode = mode;
          if (typeof min === 'number') sState.generators[tagId].min = min;
          if (typeof max === 'number') sState.generators[tagId].max = max;
          if (typeof baseline === 'number') {
            sState.generators[tagId].baseline = baseline;
            sState.generators[tagId].currentVal = baseline;
          }
        }
        if (e.data.key && sState.generators[e.data.key]) {
          sState.generators[e.data.key] = { ...sState.generators[e.data.key], ...e.data.config };
        }
      });
    }
    else if (type === 'BULK_SET_GENERATORS') {
      const sState = getOrCreateServer(serverId);
      sState.generators = { ...sState.generators, ...e.data.generators };
    }
    else if (type === 'SET_DATA_TYPE') {
      const sState = getOrCreateServer(serverId);
      sState.dataType = e.data.dataType;
    }
    else if (type === 'WRITE_TAG_VALUE') {
      const { tag, value, words } = e.data;
      if (!tag) return;
      const targetServerId = tag.serverId || serverId || "127.0.0.1:5020";
      const sState = getOrCreateServer(targetServerId);
      const validBanks: RegisterType[] = ["coils", "discreteInputs", "holdingRegisters", "inputRegisters"];
      const regBank: RegisterType = validBanks.includes(tag.regBank) ? tag.regBank : "holdingRegisters";
      const address: number = typeof tag.modbusAddress === 'number' && !isNaN(tag.modbusAddress) ? tag.modbusAddress : 0;
      if (address < 0 || address >= 10000) return;

      const isBit = regBank === "coils" || regBank === "discreteInputs";
      const updates: Array<{ regType: string; address: number; value: any; tagId?: string; tagValue?: any }> = [];

      if (isBit) {
        const bitVal = Boolean(value);
        if ((sState as any)[regBank]) {
          (sState as any)[regBank][address] = bitVal;
        }
        updates.push({ regType: regBank, address, value: bitVal, tagId: tag.id, tagValue: bitVal ? 1 : 0 });
      } else {
        const wordsToWrite = Array.isArray(words) && words.length > 0 
          ? words 
          : encodeTagWords(tag.dataTypeCode, tag.reverseSwap, Number(value));
        for (let offset = 0; offset < wordsToWrite.length; offset++) {
          if (address + offset < 10000 && (sState as any)[regBank]) {
            (sState as any)[regBank][address + offset] = wordsToWrite[offset];
            updates.push({ regType: regBank, address: address + offset, value: wordsToWrite[offset] });
          }
        }
        updates.push({ regType: regBank, address, value: wordsToWrite[0], tagId: tag.id, tagValue: Number(value) });
      }

      // Lock generator to constant per Rule 4.5
      if (tag.id && sState.generators[tag.id]) {
        sState.generators[tag.id].mode = 'constant';
        sState.generators[tag.id].currentVal = Number(value);
        sState.generators[tag.id].baseline = Number(value);
      }

      postMessage({ type: 'TICK_UPDATES', payload: [{ serverId: targetServerId, updates }] });
    }
    else if (type === 'WRITE_REGISTER') {
      const sState = getOrCreateServer(serverId);
      const { regType, address, value } = e.data;
      const addr = typeof address === 'number' && !isNaN(address) ? address : 0;
      if (addr < 0 || addr >= 10000) return;

      if ((sState as any)[regType]) {
        if (regType === "coils" || regType === "discreteInputs") {
          (sState as any)[regType][addr] = Boolean(value);
        } else {
          (sState as any)[regType][addr] = Number(value) & 0xffff;
        }
      }

      // Lock any matching generator to constant
      Object.values(sState.generators).forEach(g => {
        if (g.regBank === regType && g.address === addr) {
          g.mode = 'constant';
          g.currentVal = Number(value);
          g.baseline = Number(value);
        }
      });

      // Also notify UI immediately
      postMessage({ type: 'TICK_UPDATES', payload: [{ serverId, updates: [{ regType, address: addr, value: (sState as any)[regType]?.[addr] }] }] });
    }
    else if (type === 'CONNECT_TCP') {
      handleConnectTCP(serverId, e.data.ip, e.data.port);
    }
    else if (type === 'DISCONNECT') {
      const sState = servers.get(serverId);
      if (sState?.ws) {
        try {
          sState.ws.close();
        } catch (_) {}
        sState.ws = undefined;
      }
      for (const k of Array.from(lastLogTime.keys())) {
        if (k.startsWith(serverId)) {
          lastLogTime.delete(k);
        }
      }
    }
    else if (type === 'REMOVE_SERVER') {
      const sState = servers.get(serverId);
      if (sState?.ws) {
        try {
          sState.ws.close();
        } catch (_) {}
        sState.ws = undefined;
      }
      servers.delete(serverId);
      for (const k of Array.from(lastLogTime.keys())) {
        if (k.startsWith(serverId)) {
          lastLogTime.delete(k);
        }
      }
    }
    else if (type === 'SET_LOGGING_ACTIVE') {
      isLoggingActive = Boolean(e.data.active);
      if (!isLoggingActive) {
        lastLogTime.clear();
      }
    }
    else if (type === 'START_SIMULATION') {
      startTicker();
    }
    else if (type === 'STOP_SIMULATION') {
      if (tickerInterval) clearInterval(tickerInterval);
      tickerInterval = null;
      isLoggingActive = false;
      lastLogTime.clear();
      // Close any open server WebSocket connections
      for (const sState of servers.values()) {
        if (sState?.ws) {
          try {
            sState.ws.close();
          } catch (_) {}
          sState.ws = undefined;
        }
      }
    }
    else if (type === 'PROCESS_RTU_PACKET') {
      const req = e.data.payload as Uint8Array;
      if (!req || req.length < 4) return;
    }
  } catch (err) {
    console.warn('[Modbus Worker] Error processing worker message:', err);
  }
};
