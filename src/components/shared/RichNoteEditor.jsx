import React, { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon, Strikethrough,
  Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code2, Link as LinkIcon, GripVertical,
} from "lucide-react";

// ---------------------------------------------------------------------------
// RichNoteEditor — shared TipTap-based rich text editor for Notes Canvas and
// End of Campaign notes (replaces the previous BlockNote integration).
//
// BlockNote positioned its block "+"/drag handles internally, and that broke
// the moment our layout put the editor inside a scroll container BlockNote
// didn't expect — we had no way to fix it short of restructuring around the
// library's assumptions. Here every floating control (selection toolbar,
// slash menu, drag handle) is positioned by us from plain viewport
// coordinates and rendered through a portal to <body>, so it can't be thrown
// off by an ancestor's scroll, transform, or overflow — regardless of how
// this component ends up nested in the future.
// ---------------------------------------------------------------------------

const SLASH_COMMANDS = [
  { title: "Text", kw: "text paragraph", ic: "¶", run: (e) => e.chain().focus().setParagraph().run() },
  { title: "Heading", kw: "heading h2 title section", ic: "H2", run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { title: "Subheading", kw: "heading h3 subtitle", ic: "H3", run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { title: "Bullet list", kw: "bullet list ul", ic: "•", run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: "Numbered list", kw: "numbered ordered list", ic: "1.", run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: "Checklist", kw: "task checklist todo checkbox", ic: "☑", run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: "Quote", kw: "quote blockquote", ic: "❝", run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: "Code block", kw: "code block", ic: "</>", run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: "Divider", kw: "divider hr rule line", ic: "—", run: (e) => e.chain().focus().setHorizontalRule().run() },
];

// depth 1 = the top-level block (paragraph/heading/list/etc.) directly under
// the document root — this is what a "block" means for drag/reorder purposes.
// A resolved position at the very start/end of the doc (or exactly on a
// top-level boundary) has depth 0 — there is no "before(1)" for it, and
// forcing depth to 1 anyway throws. Those spots simply have no block to
// offer a handle for.
function blockInfoAt(doc, pos) {
  const $pos = doc.resolve(pos);
  if ($pos.depth < 1) return null;
  const from = $pos.before(1);
  const node = doc.nodeAt(from);
  return node ? { node, from, to: from + node.nodeSize } : null;
}

export default function RichNoteEditor({
  content,
  onChange,
  accent = "#c2410d",
  placeholder = "Type “/” for commands, or just start writing…",
  className = "",
  wide = false,
}) {
  const [bubble, setBubble] = useState(null); // {top,left}
  const [slash, setSlash] = useState(null); // {top,left,query,index}
  const [dragHandle, setDragHandle] = useState(null); // {top,left,from,to}
  const [dropIndicator, setDropIndicator] = useState(null); // { top } in wrap coords
  const saveTimerRef = useRef(null);
  const slashRangeRef = useRef(null);
  const dragFromRef = useRef(null);
  const wrapRef = useRef(null);

  // All floating UI is positioned in the wrapper's own coordinate space
  // (absolute inside wrapRef) rather than fixed-to-viewport — a scaled or
  // transformed ancestor silently reparents position:fixed and threw these
  // dozens of px off (bubble landing on top of the text, handle below the row).
  //
  // The app applies `html { zoom: 1.1 }` globally (src/tailwind.css). Under a
  // non-1 CSS `zoom`, getBoundingClientRect()/coordsAtPos()/clientX/Y all
  // report already-zoomed VISUAL pixels, but an inline `style.top`/`left`
  // value is a LAYOUT length that the browser zooms AGAIN before painting.
  // Feeding a raw viewport-pixel delta straight into `top:`/`left:` silently
  // multiplies it by the zoom factor a second time — the farther down the
  // page (the more accumulated offset), the further the drift, which is
  // exactly the "handle drifts below the row" symptom. Dividing the delta by
  // the current zoom factor before assigning it as a style value cancels
  // that out. wrap.scrollTop is a layout value already in local units, so it
  // is added AFTER the divide, not before.
  const zoomFactor = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const toWrap = (viewportTop, viewportLeft) => {
    const wrap = wrapRef.current;
    if (!wrap) return { top: viewportTop, left: viewportLeft };
    const r = wrap.getBoundingClientRect();
    const z = zoomFactor();
    return { top: (viewportTop - r.top) / z + wrap.scrollTop, left: (viewportLeft - r.left) / z };
  };

  const checkSlash = useCallback((editor) => {
    const { $from } = editor.state.selection;
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, "￼", "￼");
    const match = textBefore.match(/\/([a-z0-9 ]*)$/i);
    if (match) {
      const query = match[1].trim().toLowerCase();
      const from = $from.pos - match[0].length;
      slashRangeRef.current = { from, to: $from.pos };
      const coords = editor.view.coordsAtPos(from);
      const p = toWrap(coords.bottom, coords.left);
      setSlash({ top: p.top, left: p.left, query, index: 0 });
    } else {
      slashRangeRef.current = null;
      setSlash(null);
    }
  }, []);

  const updateBubble = useCallback((editor) => {
    const { from, to, empty } = editor.state.selection;
    if (empty) { setBubble(null); return; }
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const p = toWrap(Math.min(start.top, end.top), (start.left + end.left) / 2);
    setBubble({ top: p.top, left: p.left });
  }, []);

  const editor = useEditor({
    extensions: [
      // StarterKit v3 already bundles Underline and Link — configure Link here
      // rather than re-adding the extensions (which triggers duplicate-name
      // errors). Underline/Link commands (toggleUnderline, setLink) still work.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: content && (Array.isArray(content) ? content.length : Object.keys(content).length) ? content : "",
    editorProps: {
      handleKeyDown(view, event) {
        if (!slashRangeRef.current) return false;
        if (event.key === "ArrowDown") { setSlash((s) => (s ? { ...s, index: s.index + 1 } : s)); event.preventDefault(); return true; }
        if (event.key === "ArrowUp") { setSlash((s) => (s ? { ...s, index: s.index - 1 } : s)); event.preventDefault(); return true; }
        if (event.key === "Enter" || event.key === "Escape") { event.preventDefault(); return true; }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      checkSlash(editor);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => onChange(editor.getJSON()), 800);
    },
    onSelectionUpdate: ({ editor }) => { checkSlash(editor); updateBubble(editor); },
    onBlur: () => { setTimeout(() => { setBubble(null); setSlash(null); slashRangeRef.current = null; }, 150); },
  }, []);

  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  // Slash menu: run/close on Enter/Escape (handleKeyDown above only stops the
  // default editor behavior; the actual action happens here where component
  // state — the filtered list + selected index — is in scope).
  useEffect(() => {
    if (!slash) return;
    const filtered = SLASH_COMMANDS.filter((c) => !slash.query || c.kw.includes(slash.query));
    const onKey = (e) => {
      if (e.key === "Enter") {
        const cmd = filtered[((slash.index % filtered.length) + filtered.length) % filtered.length];
        if (cmd && slashRangeRef.current) {
          const { from, to } = slashRangeRef.current;
          editor.chain().focus().deleteRange({ from, to }).run();
          cmd.run(editor);
        }
        slashRangeRef.current = null;
        setSlash(null);
      } else if (e.key === "Escape") {
        slashRangeRef.current = null;
        setSlash(null);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [slash, editor]);

  // --- Drag handle: track the hovered top-level block, offer a handle,
  // reorder via a delete+insert transaction on drop.
  //
  // Every early-return below explicitly clears dragHandle rather than
  // leaving it as-is. The previous version returned early on a miss without
  // clearing state, so the moment the mouse crossed ANY position that didn't
  // resolve cleanly (a margin, a gap between blocks, a doc-boundary position
  // that made blockInfoAt throw) the handle was left showing wherever it
  // last successfully computed — visibly stuck on some earlier row instead
  // of tracking the cursor. */
  const handleMouseMove = useCallback((e) => {
    if (!editor || slash) { setDragHandle(null); return; }
    const wrap = wrapRef.current;
    const pmDom = editor.view.dom;
    if (!wrap || !pmDom) { setDragHandle(null); return; }
    const wrapRect = wrap.getBoundingClientRect();
    // Match by row (Y) across the whole wrapper width, not by exact hit on the
    // text glyphs — requiring the cursor to land squarely on a paragraph made
    // the handle only appear a "few digits in", and the gutter itself (where
    // the handle actually sits) was dead space. Any X within the wrapper now
    // counts, so moving straight at the handle keeps the row's hover alive.
    if (e.clientX < wrapRect.left || e.clientX > wrapRect.right) { setDragHandle(null); return; }
    try {
      let match = null;
      for (const child of pmDom.children) {
        const r = child.getBoundingClientRect();
        if (r.height > 0 && e.clientY >= r.top && e.clientY <= r.bottom) { match = { el: child, rect: r }; break; }
      }
      if (!match) { setDragHandle(null); return; }
      const info = blockInfoAt(editor.state.doc, editor.view.posAtDOM(match.el, 0));
      if (!info) { setDragHandle(null); return; }
      // Position/size the handle strip to match the row's own top+height
      // exactly. Both the position AND the height must go through the same
      // zoom correction as toWrap — a raw viewport-pixel height fed straight
      // into style.height gets zoomed a second time same as top/left would.
      const p = toWrap(match.rect.top, 0);
      setDragHandle({
        top: p.top,
        height: match.rect.height / zoomFactor(),
        from: info.from, to: info.to,
      });
    } catch {
      setDragHandle(null);
    }
  }, [editor, slash]);

  // Pointer-based block reorder. Native HTML5 drag over a ProseMirror editable
  // is swallowed by PM's own drop handling and never reorders; a manual pointer
  // drag is reliable and lets us draw a clear insertion line.
  const blockUnderPointer = useCallback((clientX, clientY) => {
    const pmDom = editor.view.dom;
    let el = document.elementFromPoint(clientX, clientY);
    if (!el || !pmDom.contains(el)) return null;
    while (el && el.parentElement !== pmDom) el = el.parentElement;
    if (!el?.getBoundingClientRect) return null;
    const info = blockInfoAt(editor.state.doc, editor.view.posAtDOM(el, 0));
    if (!info) return null;
    const rect = el.getBoundingClientRect();
    return { info, rect, after: clientY > rect.top + rect.height / 2 };
  }, [editor]);

  const onDragPointerMove = useCallback((e) => {
    const t = blockUnderPointer(e.clientX, e.clientY);
    const wrap = wrapRef.current;
    if (!t || !wrap) { setDropIndicator(null); return; }
    const p = toWrap(t.after ? t.rect.bottom : t.rect.top, 0);
    setDropIndicator({ top: p.top });
  }, [blockUnderPointer]);

  const onDragPointerUp = useCallback((e) => {
    document.removeEventListener("pointermove", onDragPointerMove);
    document.removeEventListener("pointerup", onDragPointerUp);
    document.body.style.userSelect = "";
    const src = dragFromRef.current;
    dragFromRef.current = null;
    setDropIndicator(null);
    setDragHandle(null);
    if (!src) return;
    const t = blockUnderPointer(e.clientX, e.clientY);
    if (!t) return;
    const { from, to } = src;
    let insertAt = t.after ? t.info.to : t.info.from;
    if (insertAt >= from && insertAt <= to) return; // dropped within itself
    const slice = editor.state.doc.slice(from, to);
    editor.chain().command(({ tr }) => {
      tr.delete(from, to);
      if (insertAt > from) insertAt -= (to - from);
      tr.insert(insertAt, slice.content);
      return true;
    }).run();
  }, [editor, blockUnderPointer, onDragPointerMove]);

  const startDrag = useCallback((e) => {
    if (!dragHandle) return;
    e.preventDefault();
    dragFromRef.current = { from: dragHandle.from, to: dragHandle.to };
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onDragPointerMove);
    document.addEventListener("pointerup", onDragPointerUp);
  }, [dragHandle, onDragPointerMove, onDragPointerUp]);

  // Clear the hover handle when the editor scrolls or resizes (e.g. entering
  // full-width expand) so it never sticks at a stale spot.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const clear = () => { setDragHandle(null); setDropIndicator(null); };
    wrap.addEventListener("scroll", clear);
    const ro = new ResizeObserver(clear);
    ro.observe(wrap);
    return () => { wrap.removeEventListener("scroll", clear); ro.disconnect(); };
  }, []);

  if (!editor) return null;

  const filteredSlash = slash
    ? SLASH_COMMANDS.filter((c) => !slash.query || c.kw.includes(slash.query))
    : [];
  const slashIndex = filteredSlash.length ? ((slash.index % filteredSlash.length) + filteredSlash.length) % filteredSlash.length : 0;

  const runSlash = (cmd) => {
    if (!slashRangeRef.current) return;
    const { from, to } = slashRangeRef.current;
    editor.chain().focus().deleteRange({ from, to }).run();
    cmd.run(editor);
    slashRangeRef.current = null;
    setSlash(null);
  };

  return (
    <div
      ref={wrapRef}
      className={`rne-root ${className}`}
      style={{ "--rne-accent": accent, "--rne-measure": wide ? "62rem" : "46rem", position: "relative" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setDragHandle(null)}
    >
      <style>{`
        .rne-root .ProseMirror { outline: none; font-size: 16px; line-height: 1.7; color: #2a2620; max-width: var(--rne-measure, 46rem); margin-inline: auto; padding: 4px 24px 48px; transition: max-width 0.2s ease; }
        @media (min-width: 640px) { .rne-root .ProseMirror { padding: 4px 48px 48px; } }
        .rne-root h2 { font-size: 1.55rem; font-weight: 750; letter-spacing: -0.01em; margin: 0 0 10px; }
        .rne-root h3 { font-size: 1.28rem; font-weight: 750; letter-spacing: -0.01em; margin: 18px 0 8px; }
        .rne-root p { margin: 0 0 12px; }
        .rne-root .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); float: left; color: #cdc5b7; pointer-events: none; height: 0; }
        .rne-root ul, .rne-root ol { padding-left: 22px; margin: 0 0 12px; }
        .rne-root li { margin-bottom: 5px; }
        .rne-root blockquote { border-left: 3px solid var(--rne-accent); margin: 0 0 12px; padding: 2px 0 2px 14px; color: #8a8073; font-style: italic; }
        .rne-root pre { background: #22201c; color: #f2ece2; border-radius: 10px; padding: 12px 14px; overflow-x: auto; margin: 0 0 12px; font-size: 13px; }
        .rne-root code { background: color-mix(in srgb, var(--rne-accent) 10%, transparent); color: var(--rne-accent); border-radius: 4px; padding: 1px 5px; font-size: 13px; font-family: ui-monospace, monospace; }
        .rne-root pre code { background: none; color: inherit; padding: 0; }
        .rne-root ul[data-type="taskList"] { list-style: none; padding-left: 2px; }
        .rne-root ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 8px; }
        .rne-root ul[data-type="taskList"] li > label { margin-top: 3px; }
        .rne-root ul[data-type="taskList"] input[type="checkbox"] { width: 15px; height: 15px; accent-color: var(--rne-accent); cursor: pointer; }
        .rne-root hr { border: none; border-top: 1px solid #ece4d8; margin: 18px 0; }
        .rne-root a { color: var(--rne-accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
        .rne-root .ProseMirror { caret-color: var(--rne-accent); }
        .rne-root .rne-drag-handle-icon {
          width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
          background: #fff; border: 1px solid #ece4d8; color: #a79f93; border-radius: 7px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08); transition: color 0.12s, border-color 0.12s;
        }
        .rne-root .rne-drag-handle:hover .rne-drag-handle-icon,
        .rne-root .rne-drag-handle:active .rne-drag-handle-icon {
          color: var(--rne-accent); border-color: color-mix(in srgb, var(--rne-accent) 40%, #ece4d8);
        }
      `}</style>
      <EditorContent editor={editor} />

      {dropIndicator && (
        <div
          style={{
            position: "absolute", left: 20, right: 20, top: dropIndicator.top - 1, height: 2,
            background: "var(--rne-accent)", borderRadius: 2, zIndex: 39, pointerEvents: "none",
            boxShadow: "0 0 0 2px color-mix(in srgb, var(--rne-accent) 20%, transparent)",
          }}
        />
      )}

      {dragHandle && (
        // The whole gutter column for this row is the drag target — not just
        // the visible icon — so starting a drag doesn't require pinpointing a
        // 26px square. The icon is centered inside via flex, so it always
        // lines up with the row regardless of the block's own height
        // (heading vs paragraph vs checklist item).
        <button
          className="rne-drag-handle"
          onPointerDown={startDrag}
          title="Drag to move this block"
          style={{
            position: "absolute", top: dragHandle.top, left: 0, width: 34, height: dragHandle.height,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab", touchAction: "none",
            background: "transparent", border: "none", padding: 0, zIndex: 40,
          }}
        >
          <span className="rne-drag-handle-icon">
            <GripVertical size={15} />
          </span>
        </button>
      )}

      {bubble && (
        <div
          style={{
            position: "absolute", top: bubble.top, left: bubble.left, transform: "translate(-50%, calc(-100% - 8px))",
            display: "flex", alignItems: "center", gap: 2, background: "#fff", border: "1px solid #ece4d8",
            borderRadius: 11, boxShadow: "0 10px 28px -12px rgba(0,0,0,0.25)", padding: 5, zIndex: 50,
          }}
        >
          {[
            { Icon: BoldIcon, active: () => editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run(), title: "Bold" },
            { Icon: ItalicIcon, active: () => editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run(), title: "Italic" },
            { Icon: UnderlineIcon, active: () => editor.isActive("underline"), run: () => editor.chain().focus().toggleUnderline().run(), title: "Underline" },
            { Icon: Strikethrough, active: () => editor.isActive("strike"), run: () => editor.chain().focus().toggleStrike().run(), title: "Strikethrough" },
            { Icon: LinkIcon, active: () => editor.isActive("link"), run: () => {
                if (editor.isActive("link")) { editor.chain().focus().unsetLink().run(); return; }
                const prev = editor.getAttributes("link").href || "https://";
                const url = window.prompt("Link URL", prev);
                if (url === null) return;
                if (url === "") { editor.chain().focus().unsetLink().run(); return; }
                editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
              }, title: "Link" },
            { Icon: Code2, active: () => editor.isActive("code"), run: () => editor.chain().focus().toggleCode().run(), title: "Inline code" },
            null, // separator
            { Icon: Heading2, active: () => editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), title: "Heading" },
            { Icon: Heading3, active: () => editor.isActive("heading", { level: 3 }), run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), title: "Subheading" },
            { Icon: List, active: () => editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run(), title: "Bullet list" },
            { Icon: ListOrdered, active: () => editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run(), title: "Numbered list" },
            { Icon: ListChecks, active: () => editor.isActive("taskList"), run: () => editor.chain().focus().toggleTaskList().run(), title: "Checklist" },
            { Icon: Quote, active: () => editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run(), title: "Quote" },
          ].map((item, i) =>
            item === null ? (
              <span key={`sep-${i}`} style={{ width: 1, height: 18, background: "#ece4d8", margin: "0 3px" }} />
            ) : (
              <button
                key={item.title}
                title={item.title}
                onMouseDown={(e) => e.preventDefault()}
                onClick={item.run}
                style={{
                  width: 28, height: 28, border: "none", borderRadius: 7, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: item.active() ? "var(--rne-accent, #c2410d)" : "transparent",
                  color: item.active() ? "#fff" : "#8a8073",
                }}
              >
                <item.Icon size={15} />
              </button>
            )
          )}
        </div>
      )}

      {slash && (
        <div
          style={{
            position: "absolute", top: slash.top, left: slash.left, width: 210, background: "#fff",
            border: "1px solid #ece4d8", borderRadius: 11, boxShadow: "0 10px 28px -12px rgba(0,0,0,0.25)",
            padding: 6, zIndex: 50, display: "flex", flexDirection: "column", marginTop: 8,
          }}
        >
          {filteredSlash.length === 0 && (
            <div style={{ padding: "8px 9px", fontSize: 12.5, color: "#cdc5b7" }}>No matching block</div>
          )}
          {filteredSlash.map((c, i) => (
            <div
              key={c.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runSlash(c)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 9px", borderRadius: 8, cursor: "pointer",
                fontSize: 13, fontWeight: 600, background: i === slashIndex ? "color-mix(in srgb, var(--rne-accent) 10%, transparent)" : "transparent",
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: 6, background: "color-mix(in srgb, var(--rne-accent) 10%, transparent)",
                color: "var(--rne-accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0,
              }}>{c.ic}</span>
              {c.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
