import React from "react";
import { X, Play, Copy, Check, Upload } from "lucide-react";

export default function ExportModal({
  showExportModal, setShowExportModal,
  jsonCopied, pastedJson, setPastedJson,
  handleCopyJSONToClipboard, handlePasteImport,
}) {
  if (!showExportModal) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-[#122027]/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-2xl font-black text-[#122027] tracking-tight">Manage Data</h3>
            <p className="text-[#768994] text-sm mt-1">Export for automation or merge JSON backups</p>
          </div>
          <button
            onClick={() => setShowExportModal(false)}
            className="p-2 bg-slate-100 hover:bg-[#dce4ec] text-[#768994] rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto pr-2 pb-2">
          <div className="bg-[#12a0e1]/5 p-5 rounded-2xl border border-[#12a0e1]/20">
            <h4 className="text-sm font-bold text-[#122027] mb-2 flex items-center gap-2">
              <Play className="w-4 h-4 text-[#12a0e1]" /> Bookmarklet Automation Export
            </h4>
            <p className="text-xs text-[#323b43] mb-4 leading-relaxed">
              Click Copy JSON below to grab your week's data. Go to your timesheet website, click the bookmarklet, and hit paste.
            </p>
            <button
              onClick={handleCopyJSONToClipboard}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-white rounded-xl font-bold transition-all shadow-lg w-full ${
                jsonCopied
                  ? "bg-[#1cc1a5] shadow-[#1cc1a5]/30"
                  : "bg-[#12a0e1] hover:bg-[#12a0e1]/90 shadow-[#12a0e1]/30 active:scale-[0.98]"
              }`}
            >
              {jsonCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {jsonCopied ? "JSON Copied!" : "Copy JSON"}
            </button>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-[#122027]">Manual JSON Merge</h4>
            <textarea
              value={pastedJson}
              onChange={(e) => setPastedJson(e.target.value)}
              placeholder='Paste a previous {"tasks": [...]} export here to merge it...'
              className="w-full h-32 bg-slate-50 border border-[#dce4ec] rounded-xl p-3 text-xs font-mono text-[#323b43] focus:ring-2 focus:ring-[#12a0e1]/20 focus:border-[#12a0e1] outline-none resize-none transition-all"
            />
            <button
              onClick={handlePasteImport}
              disabled={!pastedJson.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#122027] hover:bg-[#25373c] text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
            >
              <Upload className="w-4 h-4" /> Merge Pasted JSON
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-6 mt-auto border-t border-[#dce4ec]">
          <button
            onClick={() => setShowExportModal(false)}
            className="px-6 py-2.5 bg-slate-100 hover:bg-[#dce4ec] text-[#122027] font-bold rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
