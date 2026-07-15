import React, { useRef, useCallback } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

// ---------------------------------------------------------------------------
// ExcalidrawPageEditor — the "sketch" counterpart to RichNoteEditor. Loaded
// via React.lazy from Canvas.js so its (sizeable) bundle and CSS only cost
// anything once a sketch page is actually opened.
//
// Storage shape: { elements, appState: { viewBackgroundColor }, files }.
// Excalidraw's own onChange hands back a full appState (zoom, scroll,
// selected tool, a Map of live collaborators, etc.) — most of that is
// per-session UI state, not document content, and some of it isn't even
// JSON-safe. We keep only viewBackgroundColor and let everything else reset
// to Excalidraw's own defaults on reload, same spirit as a text note not
// persisting where your cursor last was.
// ---------------------------------------------------------------------------

export default function ExcalidrawPageEditor({ content, onChange }) {
  const saveTimerRef = useRef(null);

  const handleChange = useCallback((elements, appState, files) => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onChange({
        elements,
        appState: { viewBackgroundColor: appState.viewBackgroundColor },
        files,
      });
    }, 800);
  }, [onChange]);

  const initialData = content?.elements?.length || Object.keys(content?.files || {}).length
    ? {
        elements: content.elements || [],
        appState: content.appState || {},
        files: content.files || {},
        scrollToContent: true,
      }
    : undefined;

  return (
    // The app runs at a deliberate, app-wide `zoom: 1.1` (src/tailwind.css).
    // Excalidraw does its own screen-to-canvas coordinate math internally —
    // it has no idea an ancestor is scaling the page, so every click/draw
    // lands 10% off from where the cursor visually is (worse the further
    // from the origin). We can't patch Excalidraw's internals the way
    // RichNoteEditor's own hand-rolled positioning was fixed; instead this
    // inner layer applies the exact inverse zoom (1/1.1), so the NET zoom
    // Excalidraw's subtree experiences is 1.1 × (1/1.1) = 1 — a genuine,
    // un-zoomed 100% as far as Excalidraw can tell. The 110% width/height
    // compensates the visual shrink that same inverse zoom would otherwise
    // cause, so the canvas still fills the outer box edge-to-edge instead of
    // rendering undersized inside it.
    <div style={{ height: "100%", minHeight: 640, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "110%", height: "110%", zoom: 1 / 1.1 }}>
        <Excalidraw initialData={initialData} onChange={handleChange} />
      </div>
    </div>
  );
}
