import { useMemo, useState } from "react";
import { parseCsv, formatRange, sortTags } from "./utils/csvTagParser";
import { loadTags, saveTags } from "./utils/tagDatabase";
import { useModbusEngine } from "./utils/useModbusEngine";
import type { RegisterBank, ServerInstance, Tag } from "./types";

const banks: Array<{ id: RegisterBank; label: string }> = [
  { id: "coils", label: "Coils" },
  { id: "discreteInputs", label: "Discrete Inputs" },
  { id: "holdingRegisters", label: "Holding Registers" },
  { id: "inputRegisters", label: "Input Registers" },
];

type TabView = RegisterBank | "help";

export default function App() {
  const [tags, setTags] = useState<Tag[]>(loadTags);
  const [bank, setBank] = useState<RegisterBank>("holdingRegisters");
  const [view, setView] = useState<TabView>("holdingRegisters");
  const [serverId, setServerId] = useState("ALL");
  const [csv, setCsv] = useState("");
  const [notice, setNotice] = useState("");
  const [logging, setLogging] = useState(false);
  const [copied, setCopied] = useState(false);

  const engine = useModbusEngine(tags);
  const serverIds = useMemo(() => Array.from(new Set(tags.map(tag => tag.serverId))), [tags]);
  const visible = sortTags(tags.filter(tag => tag.regBank === bank && (serverId === "ALL" || tag.serverId === serverId)));

  const helpCommands = useMemo(() => {
    const tcpServerIds = Array.from(new Set(tags.map(tag => tag.serverId).filter(id => !id.startsWith("RTU-"))));

    const commands: string[] = [
      "# install websocat on Ubuntu",
      "sudo apt-get update && sudo apt-get install -y websocat",
      "# bridge pattern: ws-l:0.0.0.0:<port> tcp-l:<target_host>:502",
    ];

    if (tcpServerIds.length === 0) {
      commands.push("websocat --ws-heartbeat=none -b ws-l:0.0.0.0:5020 tcp-l:172.31.28.103:502");
      return commands;
    }

    tcpServerIds.forEach((serverIdText, index) => {
      const [host] = serverIdText.split(":");
      const wsPort = 5020 + index;
      commands.push(`websocat --ws-heartbeat=none -b ws-l:0.0.0.0:${wsPort} tcp-l:${host}:502`);
    });

    return commands;
  }, [tags]);

  const updateTags = (next: Tag[]) => {
    setTags(next);
    saveTags(next);
  };

  const importCsv = (source = csv) => {
    const result = parseCsv(source);
    if (result.errors.length || !result.tags.length) {
      setNotice(result.errors.join(" ") || "No Modbus tags found.");
      return;
    }

    updateTags(result.tags);
    setNotice(`Imported ${result.tags.length} tags.`);
  };

  const browseCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const source = await file.text();
    setCsv(source);
    importCsv(source);
    event.target.value = "";
  };

  const syncServers = () => {
    const next: ServerInstance[] = serverIds.map(id =>
      id.startsWith("RTU-")
        ? { id, mode: "rtu", status: "disconnected" }
        : { id, mode: "tcp", host: id.split(":")[0], port: Number(id.split(":")[1]) || 5020, status: "disconnected" },
    );
    engine.setServerList(next);
  };

  const openHelp = () => {
    setView("help");
    setNotice("Use the bridge commands below to expose Modbus TCP devices through a WebSocket endpoint.");
  };

  const copyCommands = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(helpCommands.join("\n"));
      }
      setCopied(true);
      setNotice("Bridge commands copied to the clipboard.");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setNotice("Clipboard access is unavailable in this browser. Copy the commands manually from the panel.");
    }
  };

  if (engine.isBlocked) {
    return (
      <main className="takeover">
        <div>
          <span className="eyebrow">MODBUS WORKBENCH</span>
          <h1>Another active session owns the engine.</h1>
          <p>This tab is in standby so simulations, serial ports, and bridge connections remain exclusive.</p>
          <button onClick={engine.takeOver}>Take Over Active Session</button>
        </div>
      </main>
    );
  }

  return (
    <div className="shell">
      <header>
        <div>
          <span className="eyebrow">MODBUS WORKBENCH / ALE111</span>
          <h1>Field signal console</h1>
        </div>
        <div className="header-actions">
          <span className="status"><i className={engine.isActive ? "online" : "offline"} />{engine.isActive ? "ACTIVE SESSION" : "STANDBY"}</span>
          <button onClick={() => {
            const next = !logging;
            setLogging(next);
            engine.setLogging(next);
          }}>{logging ? "LOGGING ON" : "LOGGING OFF"}</button>
        </div>
      </header>

      <section className="toolbar">
        <label>
          Server
          <select value={serverId} onChange={event => setServerId(event.target.value)}>
            <option value="ALL">All servers</option>
            {serverIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
        <button onClick={syncServers}>Sync endpoints</button>
        <button className="secondary" onClick={() => { updateTags([]); setNotice("Tag database cleared."); }}>Clear database</button>

        <div className="view-tabs">
          {banks.map(item => (
            <button
              key={item.id}
              className={view === item.id ? "tab active" : "tab"}
              onClick={() => {
                setBank(item.id);
                setView(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
          <button className={view === "help" ? "tab active" : "tab"} onClick={openHelp}>Help</button>
        </div>
      </section>

      <main>
        <aside>
          <div className="panel-title">CSV configuration</div>
          <textarea value={csv} onChange={event => setCsv(event.target.value)} placeholder="Paste CENTUM VP CSV here..." />
          <div className="csv-actions">
            <button onClick={() => importCsv()}>Import CSV</button>
            <label className="file-button">
              Browse CSV
              <input className="file-input" type="file" accept=".csv,text/csv" onChange={browseCsv} />
            </label>
          </div>

          <div className="panel-title">Signal summary</div>
          <div className="summary-box">
            <div><span>Tags</span><strong>{tags.length}</strong></div>
            <div><span>Servers</span><strong>{serverIds.length}</strong></div>
            <div><span>View</span><strong>{view === "help" ? "Help" : banks.find(item => item.id === bank)?.label ?? "View"}</strong></div>
          </div>

          {notice && <p className="notice">{notice}</p>}
        </aside>

        <section className="workspace">
          {view === "help" ? (
            <div className="help-panel">
              <div className="workspace-head">
                <div>
                  <span className="eyebrow">HELP / BRIDGE SETUP</span>
                  <h2>WebSocket bridge commands</h2>
                </div>
                <button className="secondary" onClick={copyCommands}>{copied ? "Copied" : "Copy commands"}</button>
              </div>

              <div className="help-grid">
                <div className="help-card">
                  <h3>How this app connects</h3>
                  <p>The Modbus TCP simulator opens a browser WebSocket to a bridge that exposes a real Modbus TCP device. The pattern is:</p>
                  <pre>websocat --ws-heartbeat=none -b ws-l:0.0.0.0:5020 tcp-l:172.31.28.103:502</pre>
                  <p>Use one unique WebSocket port per Modbus TCP slave instance to avoid collisions.</p>
                </div>

                <div className="help-card">
                  <h3>Recommended commands</h3>
                  <pre>{helpCommands.join("\n")}</pre>
                </div>

                <div className="help-card">
                  <h3>Notes</h3>
                  <ul>
                    <li>Start the bridge before connecting the app.</li>
                    <li>Match the target host to the PLC or Modbus device you want to reach.</li>
                    <li>Each server should use the next free port from 5020.</li>
                    <li>RTU devices are handled by the worker simulator and serial adapters when available.</li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="workspace-head">
                <div>
                  <span className="eyebrow">LIVE MEMORY MAP</span>
                  <h2>{banks.find(item => item.id === bank)?.label}</h2>
                </div>
                <span className="counter">{visible.length} signals</span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Server IP / N-S-P</th>
                      <th>Hardware address</th>
                      <th>Modbus address</th>
                      <th>Tag</th>
                      <th>Value</th>
                      <th>Mode</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map(tag => (
                      <tr key={tag.id}>
                        <td>
                          <span className={tag.isRtu ? "chip amber" : "chip cyan"}>
                            {tag.isRtu ? tag.nsp || tag.serverId : tag.ipAddress || tag.serverId.split(":")[0]}
                          </span>
                        </td>
                        <td>{formatRange(Number(tag.element.replace(/\D/g, "")) || 0, tag.wordSize)}</td>
                        <td>{formatRange(tag.modbusAddress, tag.wordSize)}</td>
                        <td>
                          <strong>{tag.label}</strong>
                          <small>{tag.comment}</small>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={tag.value}
                            onChange={event => {
                              const value = Number(event.target.value);
                              updateTags(tags.map(item => item.id === tag.id ? { ...item, value, simMode: "constant" } : item));
                              engine.write(tag.serverId, tag.regBank, tag.modbusAddress, value);
                            }}
                          />
                        </td>
                        <td>
                          <select
                            value={tag.simMode}
                            onChange={event => updateTags(tags.map(item => item.id === tag.id ? { ...item, simMode: event.target.value as Tag["simMode"] } : item))}
                          >
                            <option value="constant">Constant</option>
                            <option value="sine">Sine</option>
                            <option value="ramp">Ramp</option>
                            <option value="noise">Noise</option>
                          </select>
                        </td>
                        <td>
                          <button
                            className="link-button"
                            onClick={() => {
                              if (tag.isRtu) {
                                setNotice("RTU frames are processed by the worker; attach a serial endpoint or use the simulator bridge.");
                                return;
                              }

                              engine.connect({
                                id: tag.serverId,
                                mode: "tcp",
                                host: tag.ipAddress || tag.serverId.split(":")[0],
                                port: Number(tag.serverId.split(":")[1]) || 5020,
                                status: "disconnected",
                              });
                            }}
                          >
                            Connect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visible.length === 0 && <div className="empty">No signals in this view. Import a Modbus CSV or choose another bank.</div>}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
