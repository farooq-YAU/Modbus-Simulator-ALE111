import React from "react";
import { AlertTriangle, ArrowRightCircle, RotateCcw, Power, ShieldAlert } from "lucide-react";

interface SingleTabTakeoverModalProps {
  isBlockedByAnotherTab: boolean;
  isTakenOver: boolean;
  onTakeOver: () => void;
  onDismiss: () => void;
}

export default function SingleTabTakeoverModal({
  isBlockedByAnotherTab,
  isTakenOver,
  onTakeOver,
  onDismiss
}: SingleTabTakeoverModalProps) {
  if (!isBlockedByAnotherTab && !isTakenOver) {
    return null;
  }

  const isTakeover = isTakenOver;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#121212] border border-neutral-700/80 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden p-6 relative">
        {/* Top Accent Stripe */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${isTakeover ? "bg-amber-500" : "bg-indigo-500"}`} />

        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl border shrink-0 ${
            isTakeover
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
          }`}>
            {isTakeover ? (
              <ShieldAlert className="w-7 h-7" />
            ) : (
              <AlertTriangle className="w-7 h-7" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded border ${
                isTakeover
                  ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
                  : "bg-indigo-950/60 border-indigo-500/40 text-indigo-300"
              }`}>
                Single Active Session Policy
              </span>
            </div>

            <h3 className="text-lg font-bold text-white mt-1.5 leading-tight">
              {isTakeover ? "Session Taken Over by Another Tab" : "Another Tab is Currently Active"}
            </h3>

            <p className="text-neutral-300 text-xs mt-2 leading-relaxed">
              {isTakeover ? (
                <>
                  Active control of the Modbus Workbench was transferred to another open browser tab.
                  Background simulation loops and bridge connections in this tab have been paused to protect system stability.
                </>
              ) : (
                <>
                  Modbus Workbench is already running in another browser tab. To prevent duplicate simulations,
                  bridge port (<span className="font-mono text-indigo-300">5020+</span>) collisions, and memory leaks,
                  only one active tab is permitted at a time.
                </>
              )}
            </p>

            <div className="mt-4 p-3 rounded-lg bg-[#080808] border border-neutral-800 text-[11px] text-neutral-400 font-mono space-y-1">
              <div className="flex justify-between items-center">
                <span>Concurrency Policy:</span>
                <span className="text-emerald-400 font-bold">1 Active Tab Maximum</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Current State:</span>
                <span className={isTakeover ? "text-amber-400" : "text-indigo-400"}>
                  {isTakeover ? "Paused / Standby" : "Blocked (Standby)"}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-neutral-400 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition-colors cursor-pointer"
              >
                Keep Inactive (Standby)
              </button>

              <button
                type="button"
                onClick={onTakeOver}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 text-white shadow-lg transition-all cursor-pointer ${
                  isTakeover
                    ? "bg-amber-600 hover:bg-amber-500 shadow-amber-900/30"
                    : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/30"
                }`}
              >
                {isTakeover ? (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    <span>Reclaim Active Session</span>
                  </>
                ) : (
                  <>
                    <ArrowRightCircle className="w-4 h-4" />
                    <span>Take Over Active Session</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
