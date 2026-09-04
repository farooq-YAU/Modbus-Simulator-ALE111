import React, { useState, useMemo } from "react";
import {
  FileSpreadsheet,
  Upload,
  RotateCcw,
  Download,
  Search,
  CheckCircle,
  AlertTriangle,
  X,
  Database,
  Activity,
  Layers,
  Cpu,
  Trash2,
  Server
} from "lucide-react";
import { ModbusTag, SimPattern, TagDatabaseStats, ModbusServerInstance } from "../types";
import { parseModbusCsvConfig, formatElementRange, formatModbusAddrRange, formatDeviceAddrRange } from "../utils/csvTagParser";

interface CsvTagDatabaseModalProps {
  onClose: () => void;
  tags: ModbusTag[];
  activeServerId?: string;
  servers?: ModbusServerInstance[];
  onServerSelect?: (serverId: string) => void;
  onUpdateTags: (newTags: ModbusTag[]) => void;
  onFactoryReset: () => void;
  onUpdateTag?: (updatedTag: ModbusTag) => void;
}

export default function CsvTagDatabaseModal({
  onClose,
  tags,
  activeServerId = "ALL",
  servers = [],
  onServerSelect,
  onUpdateTags,
  onFactoryReset,
  onUpdateTag
}: CsvTagDatabaseModalProps) {
  const [csvInput, setCsvInput] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseStats, setParseStats] = useState<TagDatabaseStats | null>(null);
  const [activeTab, setActiveTab] = useState<"tags" | "import">("tags");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>("all");
  const [selectedUpdateMode, setSelectedUpdateMode] = useState<string>("all");

  const uniqueServerOptions = useMemo(() => {
    const set = new Set<string>();
    tags.forEach(t => {
      if (t.serverId) set.add(t.serverId.trim());
      else if (t.ipAddress) set.add(`${t.ipAddress}:5020`);
    });
    if (servers) {
      servers.forEach(s => {
        if (s && s.id) set.add(s.id.trim());
      });
    }
    return Array.from(set);
  }, [tags, servers]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvInput(text);
      handleParseCsv(text);
    };
    reader.readAsText(file);
  };

  const handleParseCsv = (textToParse?: string) => {
    const sourceText = textToParse || csvInput;
    if (!sourceText.trim()) {
      setParseError("Please select a file or paste CSV configuration text first.");
      return;
    }

    setParseError(null);
    const result = parseModbusCsvConfig(sourceText);

    if (result.errors.length > 0) {
      setParseError(result.errors.join("\n"));
      return;
    }

    if (result.tags.length === 0) {
      setParseError("No valid Modbus signal tags could be parsed from the CSV configuration.");
      return;
    }

    setParseStats(result.stats);
    onUpdateTags(result.tags);
    setActiveTab("tags");
  };

  const handleAutoAssignPatterns = () => {
    const patterns: SimPattern[] = ["sine", "noise", "ramp"];
    const updated = tags.map((t, idx) => {
      if (t.dataTypeCode >= 13) return t; // keep discrete constant or manual
      const assignedPattern = patterns[idx % patterns.length];
      return { ...t, simMode: assignedPattern };
    });
    onUpdateTags(updated);
  };

  const handleExportCsv = () => {
    let csv = "@PRODUCTS,Yokogawa CENTUM VP Modbus Configuration\n";
    csv += "@ID,EXPORT_CONFIG\n";
    csv += "@SHEET,MODBUS_MAPPING\n";
    csv += `@DATE,${new Date().toISOString()}\n`;
    csv += "@Element,Buffer,Program Name,Size,Port,IP Address,Station,Device&Address,Data Type,Reverse,Scan,Service Comment,Label\n";

    tags.forEach(t => {
      csv += `"${t.element}","${t.buffer || "128"}","${t.programName || "K1-1-1MOD"}","${t.size || "16"}","${t.port || "1"}","${t.ipAddress || "172.31.28.101"}","${t.station || "1"}","${t.deviceAddress}","${t.dataTypeCode}","${t.reverseSwap}","${t.scan || "1s"}","${t.comment}","${t.label}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Modbus_Server_Config_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredTags = tags.filter((t) => {
    const matchesSearch =
      t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.comment.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.deviceAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.element.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.serverId && t.serverId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesBank = selectedBank === "all" || t.regBank === selectedBank;
    const matchesMode = selectedUpdateMode === "all" || t.updateMode === selectedUpdateMode;

    const tagServer = t.serverId || (t.ipAddress ? `${t.ipAddress}:5020` : "");
    const matchesServer =
      !activeServerId ||
      activeServerId === "ALL" ||
      activeServerId === "all" ||
      tagServer === activeServerId;

    return matchesSearch && matchesBank && matchesMode && matchesServer;
  });

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150"
      id="csv-tag-modal-backdrop"
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-[96vw] shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        id="csv-tag-modal-dialog"
      >
        {/* Modal Header */}
        <div className="border-b border-neutral-800 bg-neutral-950 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Modbus Server Tag Database
                <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                  CENTUM VP CSV
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                Import Yokogawa CSV configurations, manage register mappings, and auto-simulate signals.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="border-b border-neutral-800 bg-neutral-900/50 px-6 py-2.5 flex items-center justify-between">
          <div className="flex bg-[#0a0a0a] border border-neutral-800 rounded-lg p-0.5 gap-1">
            <button
              onClick={() => setActiveTab("tags")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all ${
                activeTab === "tags"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Active Tags ({tags.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("import")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-2 transition-all ${
                activeTab === "import"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Import CSV File</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold px-3 py-1.5 rounded-lg border border-neutral-700 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onFactoryReset}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Restore default factory template tags"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Factory Tag Defaults</span>
            </button>
            <button
              onClick={() => onUpdateTags([])}
              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-red-400 border border-neutral-700 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              title="Remove all tags from the database (0 tags)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear All Tags</span>
            </button>
          </div>
        </div>

        {/* Modal Main Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === "import" ? (
            <div className="space-y-6" id="csv-import-section">
              {/* File Upload Drop Zone */}
              <div className="border-2 border-dashed border-neutral-800 hover:border-indigo-500/50 bg-[#0a0a0a] rounded-xl p-6 text-center transition-all">
                <Upload className="w-10 h-10 text-indigo-400 mx-auto mb-3 opacity-80" />
                <h4 className="text-sm font-semibold text-white mb-1">Upload Yokogawa Modbus CSV File</h4>
                <p className="text-xs text-neutral-400 mb-4 max-w-md mx-auto">
                  Select a CSV configuration file containing CENTUM VP tag mappings (`@Element`, `Buffer`, `Device&Address`, `Data Type`, `Label`).
                </p>
                <input
                  type="file"
                  accept=".csv,.txt"
                  id="csv-file-input"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <label
                  htmlFor="csv-file-input"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-lg cursor-pointer inline-flex items-center gap-2 shadow transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Choose CSV File</span>
                </label>
              </div>

              {/* Paste CSV Textarea */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-neutral-300 flex items-center justify-between">
                  <span>Or Paste Raw CSV Configuration Text:</span>
                  <span className="text-[10px] text-neutral-500">Ignores metadata header lines 1-4</span>
                </label>
                <textarea
                  rows={8}
                  value={csvInput}
                  onChange={(e) => setCsvInput(e.target.value)}
                  placeholder={`@PRODUCTS,Yokogawa CENTUM VP Modbus Configuration\n@ID,SAMPLE_CONFIG\n@SHEET,MODBUS_MAPPING\n@DATE,2026-08-12\n@Element,Buffer,Program Name,Size,Port,IP Address,Station,Device&Address,Data Type,Reverse,Scan,Service Comment,Label\n%WW0001,128,K1-1-1MOD,16,1,172.31.28.103,1,A400001,5,2,1s,Crude Feed Flow Rate,FIC101.PV\n%WW0003,*,*,*,*,*,*,A400003,11,2,1s,Crude Feed Flow Setpoint,FIC101.SV`}
                  className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl p-3 font-mono text-xs text-neutral-300 outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>

              {parseError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3.5 rounded-xl text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="whitespace-pre-line">{parseError}</div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => handleParseCsv()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow cursor-pointer transition-colors flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Process & Import Tags</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6" id="active-tags-section">
              {/* Stats Summary Bar */}
              {parseStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#0a0a0a] border border-neutral-800 p-3.5 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Buffers</span>
                      <span className="text-sm font-bold text-white font-mono">{parseStats.buffersCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Block Definitions</span>
                      <span className="text-sm font-bold text-white font-mono">{parseStats.blocksCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Signal Tags</span>
                      <span className="text-sm font-bold text-white font-mono">{parseStats.tagsCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-neutral-800 rounded-lg text-neutral-400">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] text-neutral-400 uppercase font-semibold block">Unallocated Gap</span>
                      <span className="text-sm font-bold text-white font-mono">{parseStats.gapWords} words</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Filter & Search Toolbar */}
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="relative w-full md:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Label, Comment, or Address..."
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="bg-[#0a0a0a] border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-neutral-300 outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Register Banks</option>
                    <option value="holdingRegisters">Holding Registers (4x)</option>
                    <option value="inputRegisters">Input Registers (3x)</option>
                    <option value="coils">Coils (0x)</option>
                    <option value="discreteInputs">Discrete Inputs (1x)</option>
                  </select>

                  <select
                    value={selectedUpdateMode}
                    onChange={(e) => setSelectedUpdateMode(e.target.value)}
                    className="bg-[#0a0a0a] border border-neutral-800 rounded-xl px-2.5 py-2 text-xs text-neutral-300 outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Update Modes (A-Z)</option>
                    <option value="A">Mode A (Read & Write with Readback)</option>
                    <option value="B">Mode B (Single Bit/Word Write with Readback)</option>
                    <option value="C">Mode C (32-Bit Write with Readback)</option>
                    <option value="X">Mode X (Write Once no Readback)</option>
                    <option value="Y">Mode Y (Single Write no Readback)</option>
                    <option value="Z">Mode Z (32-Bit Write no Readback)</option>
                  </select>

                  <button
                    onClick={handleAutoAssignPatterns}
                    className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex items-center gap-1.5"
                    title="Auto-assign Sine, Noise, Ramp patterns across analog tags for live testing"
                  >
                    <Activity className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Auto-Assign Patterns</span>
                  </button>
                </div>
              </div>

              {/* Tag Table */}
              <div className="overflow-auto border border-neutral-800 rounded-xl bg-[#0a0a0a] max-h-[calc(75vh-200px)] min-h-[350px]">
                <table className="w-full border-collapse text-left min-w-[750px]">
                  <thead className="sticky top-0 z-20 bg-[#0a0a0a] shadow-md">
                    <tr className="bg-[#0a0a0a] text-neutral-400 text-[11px] uppercase font-semibold">
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">CENTUM Tag Label</th>
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">Server Instance</th>
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">Hardware Addr</th>
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">Device & Bank</th>
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">Data Type</th>
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">Current Value</th>
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">Sim Pattern</th>
                      <th className="px-4 py-3 sticky top-0 z-20 bg-[#0a0a0a] border-b border-neutral-800">Service Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 text-xs font-sans">
                    {filteredTags.map((t, idx) => (
                      <tr key={t.id ? `${t.id}_${idx}` : `tag_modal_${t.serverId || ''}_${t.modbusAddress}_${idx}`} className="even:bg-white/[0.02] odd:bg-transparent hover:bg-white/[0.04] transition-colors">
                        <td className="px-4 py-2 font-mono font-bold text-indigo-300 whitespace-nowrap">
                          {t.label}
                        </td>
                        <td className="px-4 py-2 font-mono whitespace-nowrap">
                          <span className="bg-indigo-950/80 text-indigo-300 border border-indigo-800/80 px-2 py-0.5 rounded text-[10px] font-bold font-mono">
                            {t.serverId || (t.ipAddress ? `${t.ipAddress}:5020` : "127.0.0.1:5020")}
                          </span>
                        </td>
                        <td className="px-4 py-2 font-mono text-neutral-400 whitespace-nowrap">
                          {formatElementRange(t.element, t.wordSize)}
                        </td>
                        <td className="px-4 py-2 font-mono text-neutral-300 whitespace-nowrap">
                          <span className="bg-neutral-800 px-1.5 py-0.5 rounded text-[10px] text-amber-300 mr-1.5 font-bold">
                            Mode {t.updateMode}
                          </span>
                          {formatDeviceAddrRange(t.deviceAddress, t.wordSize)}
                          <span className="text-[10px] text-neutral-500 block font-mono">
                            Modbus Addr: {formatModbusAddrRange(t.modbusAddress, t.wordSize)} ({t.regBank})
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-300 whitespace-nowrap">
                          {t.dataTypeName}
                          <span className="text-[10px] text-neutral-500 block">
                            {t.wordSize} word(s) | Swap Code: {t.reverseSwap}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-emerald-400 font-bold whitespace-nowrap">
                          <input
                            type="number"
                            value={t.value}
                            onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              const updatedTag = { ...t, value: v };
                              if (onUpdateTag) {
                                onUpdateTag(updatedTag);
                              } else {
                                const updated = tags.map(x => x.id === t.id ? updatedTag : x);
                                onUpdateTags(updated);
                              }
                            }}
                            className="w-24 bg-[#0a0a0a] border border-neutral-800 rounded px-2 py-1 text-xs text-emerald-400 font-mono font-bold outline-none focus:border-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <select
                            value={t.simMode}
                            onChange={(e) => {
                              const mode = e.target.value as SimPattern;
                              const updatedTag = { ...t, simMode: mode };
                              if (onUpdateTag) {
                                onUpdateTag(updatedTag);
                              } else {
                                const updated = tags.map(x => x.id === t.id ? updatedTag : x);
                                onUpdateTags(updated);
                              }
                            }}
                            className="bg-[#0a0a0a] border border-neutral-800 rounded px-2 py-1 text-xs text-neutral-300 outline-none focus:border-indigo-500"
                          >
                            <option value="constant">Constant</option>
                            <option value="sine">Sine Wave</option>
                            <option value="ramp">Ramp Pattern</option>
                            <option value="noise">Gaussian Noise</option>
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-neutral-400 max-w-xs truncate" title={t.comment}>
                          {t.comment}
                        </td>
                      </tr>
                    ))}
                    {filteredTags.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-neutral-500 text-xs">
                          {tags.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-3">
                              <p className="text-neutral-400 font-medium">Tag Database is currently empty (0 tags).</p>
                              <p className="text-neutral-500 max-w-sm">
                                Upload a Yokogawa Modbus CSV file, paste raw configuration text, or restore the baseline factory default tags.
                              </p>
                              <button
                                onClick={onFactoryReset}
                                className="mt-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-md transition-colors flex items-center gap-2"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Restore Factory Defaults</span>
                              </button>
                            </div>
                          ) : (
                            "No matching CENTUM VP tags found for current search/filters."
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
