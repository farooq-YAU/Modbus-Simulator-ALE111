import { useMemo, useState } from "react";
import { parseCsv, formatRange, sortTags } from "./utils/csvTagParser";
import { loadTags, saveTags } from "./utils/tagDatabase";
import { useModbusEngine } from "./utils/useModbusEngine";
import type { RegisterBank, ServerInstance, Tag } from "./types";

const banks: Array<{ id: RegisterBank; label: string }> = [
  { id: "coils", label: "Coils" }, { id: "discreteInputs", label: "Discrete Inputs" },
  { id: "holdingRegisters", label: "Holding Registers" }, { id: "inputRegisters", label: "Input Registers" },
];

export default function App() {
  const [tags, setTags] = useState<Tag[]>(loadTags);
  const [bank, setBank] = useState<RegisterBank>("holdingRegisters");
  const [serverId, setServerId] = useState("ALL");
  const [csv, setCsv] = useState("");
  const [notice, setNotice] = useState("");
  const [logging, setLogging] = useState(false);
  const engine = useModbusEngine(tags);
  const serverIds = useMemo(() => Array.from(new Set(tags.map(tag => tag.serverId))), [tags]);
  const visible = sortTags(tags.filter(tag => tag.regBank === bank && (serverId === "ALL" || tag.serverId === serverId)));
  const updateTags = (next: Tag[]) => { setTags(next); saveTags(next); };
  const importCsv = () => { const result = parseCsv(csv); if (result.errors.length || !result.tags.length) { setNotice(result.errors.join(" ") || "No Modbus tags found."); return; } updateTags(result.tags); setNotice(`Imported ${result.tags.length} tags.`); };
  const syncServers = () => { const next: ServerInstance[] = serverIds.map(id => id.startsWith("RTU-") ? { id, mode: "rtu", status: "disconnected" } : { id, mode: "tcp", host: id.split(":")[0], port: Number(id.split(":")[1]) || 5020, status: "disconnected" }); engine.setServerList(next); };

  if (engine.isBlocked) return <main className="takeover"><div><span className="eyebrow">MODBUS WORKBENCH</span><h1>Another active session owns the engine.</h1><p>This tab is in standby so simulations, serial ports, and bridge connections remain exclusive.</p><button onClick={engine.takeOver}>Take Over Active Session</button></div></main>;
  return <div className="shell">
    <header><div><span className="eyebrow">MODBUS WORKBENCH / ALE111</span><h1>Field signal console</h1></div><div className="header-actions"><span className="status"><i className={engine.isActive ? "online" : "offline"} />{engine.isActive ? "ACTIVE SESSION" : "STANDBY"}</span><button onClick={() => { const next = !logging; setLogging(next); engine.setLogging(next); }}>{logging ? "LOGGING ON" : "LOGGING OFF"}</button></div></header>
    <section className="toolbar"><label>Server<select value={serverId} onChange={event => setServerId(event.target.value)}><option value="ALL">All servers</option>{serverIds.map(id => <option key={id}>{id}</option>)}</select></label><button onClick={syncServers}>Sync endpoints</button><button className="secondary" onClick={() => { updateTags([]); setNotice("Tag database cleared."); }}>Clear database</button></section>
    <main><aside><div className="panel-title">Register banks</div>{banks.map(item => <button className={bank === item.id ? "nav active" : "nav"} key={item.id} onClick={() => setBank(item.id)}>{item.label}<b>{tags.filter(tag => tag.regBank === item.id).length}</b></button>)}<div className="panel-title">CSV configuration</div><textarea value={csv} onChange={event => setCsv(event.target.value)} placeholder="Paste CENTUM VP CSV here..." /><button onClick={importCsv}>Import CSV</button>{notice && <p className="notice">{notice}</p>}</aside>
      <section className="workspace"><div className="workspace-head"><div><span className="eyebrow">LIVE MEMORY MAP</span><h2>{banks.find(item => item.id === bank)?.label}</h2></div><span className="counter">{visible.length} signals</span></div><div className="table-wrap"><table><thead><tr><th>Server IP / N-S-P</th><th>Hardware address</th><th>Modbus address</th><th>Tag</th><th>Value</th><th>Mode</th><th>Link</th></tr></thead><tbody>{visible.map(tag => <tr key={tag.id}><td><span className={tag.isRtu ? "chip amber" : "chip cyan"}>{tag.isRtu ? tag.nsp || tag.serverId : tag.ipAddress || tag.serverId.split(":")[0]}</span></td><td>{formatRange(Number(tag.element.replace(/\D/g, "")) || 0, tag.wordSize)}</td><td>{formatRange(tag.modbusAddress, tag.wordSize)}</td><td><strong>{tag.label}</strong><small>{tag.comment}</small></td><td><input type="number" value={tag.value} onChange={event => { const value = Number(event.target.value); updateTags(tags.map(item => item.id === tag.id ? { ...item, value, simMode: "constant" } : item)); engine.write(tag.serverId, tag.regBank, tag.modbusAddress, value); }} /></td><td><select value={tag.simMode} onChange={event => updateTags(tags.map(item => item.id === tag.id ? { ...item, simMode: event.target.value as Tag["simMode"] } : item))}><option value="constant">Constant</option><option value="sine">Sine</option><option value="ramp">Ramp</option><option value="noise">Noise</option></select></td><td><button className="link-button" onClick={() => tag.isRtu ? setNotice("RTU frames are processed by the worker; select a serial endpoint to attach hardware.") : engine.connect({ id: tag.serverId, mode: "tcp", host: tag.ipAddress || tag.serverId.split(":")[0], port: Number(tag.serverId.split(":")[1]) || 5020, status: "disconnected" })}>Connect</button></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty">No signals in this view. Import a Modbus CSV or choose another bank.</div>}</div><div className="bottom-grid"><div className="metric"><span>Telemetry buffer</span><strong>{engine.logs.length} / 100</strong></div><div className="metric"><span>Worker memory ticks</span><strong>{engine.memoryTick}</strong></div><div className="metric"><span>Protocol path</span><strong>Browser worker / binary frames</strong></div></div></section></main>
  </div>;
}
