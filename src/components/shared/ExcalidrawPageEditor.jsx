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
    <div style={{ height: 560, position: "relative" }}>
      <Excalidraw initialData={initialData} onChange={handleChange} />
    </div>
  );
}
