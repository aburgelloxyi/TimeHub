import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  PdfLoader,
  PdfHighlighter,
  TextHighlight,
  AreaHighlight,
  useHighlightContainerContext,
} from "react-pdf-highlighter-plus";
// The core PDF.js page-sizing CSS (--scale-factor → .page / .canvasWrapper
// dimensions). react-pdf-highlighter-plus's own style/pdf_viewer.css is only
// *overrides* of this — without the real one from pdfjs-dist, every .page
// renders at zero size and the viewer shows blank. Load it BEFORE the
// library's style.css so the library's overrides still win.
import "pdfjs-dist/web/pdf_viewer.css";
import "react-pdf-highlighter-plus/style/style.css";
import { X, Upload, FileText, Copy, Trash2, Check, Highlighter } from "lucide-react";

// ---------------------------------------------------------------------------
// PdfAnnotator — a standalone "drop a PDF in, drag-select the bits you care
// about" utility. Selecting text instantly saves it as a highlight (no
// confirm click — matches "extrapolate things" quickly); the right rail
// lists every extracted snippet with per-item and copy-all actions.
//
// Session-only: highlights aren't persisted anywhere. This is a scratch tool
// for pulling text out of a one-off PDF (a brief, a spec sheet), not a
// document-management feature — nothing here assumes the PDF is tied to a
// Wrike job.
// ---------------------------------------------------------------------------

function HighlightLayer({ onDelete }) {
  const { highlight, isScrolledTo } = useHighlightContainerContext();
  const commonProps = {
    highlight,
    isScrolledTo,
    highlightColor: "rgba(194, 65, 13, 0.35)",
    onDelete: () => onDelete(highlight.id),
  };
  return highlight.type === "area" ? (
    <AreaHighlight {...commonProps} />
  ) : (
    <TextHighlight {...commonProps} copyText={highlight.content?.text} />
  );
}

export default function PdfAnnotator({ onClose }) {
  const [fileName, setFileName] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [copiedAll, setCopiedAll] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const objectUrlRef = useRef(null);

  // A blob: URL, not a raw Uint8Array — PDF.js then fetches the bytes itself
  // instead of structured-cloning a caller-owned ArrayBuffer to its worker.
  // Passing the array directly detaches its buffer on transfer, so any second
  // load attempt (a re-open, or React's dev-mode double-invoke of effects)
  // throws "ArrayBuffer is detached"; a URL has no such one-shot buffer.
  const openFile = useCallback((file) => {
    if (!file) return;
    setLoadError(null);
    setHighlights([]);
    setFileName(file.name);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPdfUrl(url);
  }, []);

  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const onSelection = useCallback((pdfSelection) => {
    // makeGhostHighlight() must run synchronously off the live selection
    // (the library's own warning: it stops working once the selection is
    // gone), so a highlight is captured the instant the user releases the
    // mouse — no separate "confirm" click needed.
    const ghost = pdfSelection.makeGhostHighlight();
    const id = `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setHighlights((prev) => [...prev, { ...ghost, id }]);
  }, []);

  const deleteHighlight = useCallback((id) => {
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const textSnippets = highlights.filter((h) => h.content?.text);

  const copyAll = () => {
    navigator.clipboard?.writeText(textSnippets.map((h) => h.content.text).join("\n\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[10010] bg-[#122027]/90 backdrop-blur-md flex flex-col p-4 sm:p-8">
      <div className="bg-white rounded-3xl w-full h-full shadow-2xl flex flex-col overflow-hidden border border-white/20">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#dce4ec] shrink-0">
          <div className="w-9 h-9 rounded-xl bg-[#c2410d]/10 text-[#c2410d] flex items-center justify-center shrink-0">
            <Highlighter className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-[#122027] truncate">{fileName || "PDF Highlighter"}</p>
            <p className="text-[11px] font-bold text-[#768994]">
              Drag-select any text — it's saved as a highlight instantly. Nothing here is uploaded or persisted.
            </p>
          </div>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#dce4ec] text-[12px] font-black text-[#122027] hover:border-[#c2410d]/40 hover:text-[#c2410d] cursor-pointer transition-colors shrink-0">
            <Upload className="w-3.5 h-3.5" />
            {pdfUrl ? "Open another" : "Open a PDF"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => openFile(e.target.files?.[0])}
            />
          </label>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#768994] hover:text-[#122027] hover:bg-slate-50 transition-colors shrink-0"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex min-h-0">
          {/* Viewer */}
          <div className="flex-1 min-w-0 bg-[#e5e5e5] relative">
            {!pdfUrl ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-[#c2410d]/10 text-[#c2410d] flex items-center justify-center">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-[#122027]">Open a PDF to start highlighting</p>
                  <p className="text-[12px] font-semibold text-[#768994] mt-1 max-w-xs">
                    Drag over any text to pull it out — handy for briefs, spec sheets, or anything not already in Wrike.
                  </p>
                </div>
                <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#c2410d] hover:bg-[#9a3412] text-white text-[12px] font-black uppercase tracking-widest transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" /> Choose PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => openFile(e.target.files?.[0])}
                  />
                </label>
                {loadError && <p className="text-[11px] font-bold text-red-500">{loadError}</p>}
              </div>
            ) : (
              <PdfLoader
                document={pdfUrl}
                onError={(err) => setLoadError(err?.message || "Couldn't load that PDF.")}
                beforeLoad={() => (
                  <div className="absolute inset-0 flex items-center justify-center gap-2 text-[#768994]">
                    <div className="w-4 h-4 border-2 border-[#c2410d] border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold">Loading PDF…</span>
                  </div>
                )}
                errorMessage={(err) => (
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-red-500 px-6 text-center">
                    {err?.message || "Couldn't load that PDF."}
                  </div>
                )}
              >
                {(pdfDocument) => (
                  <PdfHighlighter
                    pdfDocument={pdfDocument}
                    highlights={highlights}
                    onSelection={onSelection}
                    enableAreaSelection={(e) => e.altKey}
                    utilsRef={() => {}}
                  >
                    <HighlightLayer onDelete={deleteHighlight} />
                  </PdfHighlighter>
                )}
              </PdfLoader>
            )}
          </div>

          {/* Extracted highlights rail */}
          <div className="w-80 shrink-0 border-l border-[#dce4ec] flex flex-col bg-white">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#eef1f5]">
              <span className="text-[11px] font-black uppercase tracking-widest text-[#768994]">
                Extracted · {textSnippets.length}
              </span>
              {textSnippets.length > 0 && (
                <button
                  onClick={copyAll}
                  className="flex items-center gap-1 text-[11px] font-black text-[#c2410d] hover:text-[#9a3412] transition-colors"
                >
                  {copiedAll ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copiedAll ? "Copied" : "Copy all"}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {textSnippets.length === 0 ? (
                <p className="text-[12px] font-semibold text-[#94a3b8] px-2 py-6 text-center">
                  {pdfUrl ? "Select text in the PDF to pull it out here." : "Open a PDF, then drag-select any text."}
                </p>
              ) : (
                textSnippets.map((h) => (
                  <div
                    key={h.id}
                    className="group/snippet relative rounded-xl border border-[#eef1f5] bg-slate-50/60 p-2.5"
                  >
                    <p className="text-[12px] font-semibold text-[#122027] leading-snug pr-5">{h.content.text}</p>
                    <div className="flex items-center gap-1 absolute top-1.5 right-1.5 opacity-0 group-hover/snippet:opacity-100 transition-opacity">
                      <button
                        onClick={() => navigator.clipboard?.writeText(h.content.text)}
                        title="Copy"
                        className="p-1 rounded-md text-[#94a3b8] hover:text-[#c2410d] hover:bg-white transition-colors"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => deleteHighlight(h.id)}
                        title="Remove"
                        className="p-1 rounded-md text-[#94a3b8] hover:text-red-500 hover:bg-white transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
