import { useRef, useState } from "react";

/** Chat composer: Enter sends, Shift+Enter is a new line, grows to 6 lines. */
export default function Composer({ onSend, onStop, streaming, placeholder }: {
  onSend: (text: string) => void; onStop?: () => void; streaming?: boolean; placeholder?: string;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 6 * 22 + 20)}px`;
  };
  const send = () => {
    const t = text.trim();
    if (!t || streaming) return;
    onSend(t);
    setText("");
    requestAnimationFrame(grow);
  };
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "#fff", borderRadius: 20, padding: 8, boxShadow: "0 1px 2px rgba(0,0,0,.05), 0 0 0 1px rgba(0,0,0,.07)" }}>
      <textarea ref={ref} rows={1} value={text} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => { setText(e.target.value); grow(); }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
        style={{ flex: 1, resize: "none", border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 15, lineHeight: "22px", padding: "8px 10px" }} />
      <button type="button" onClick={streaming ? onStop : send} disabled={!streaming && !text.trim()}
        aria-label={streaming ? "Stop" : "Send"}
        style={{
          all: "unset", width: 38, height: 38, borderRadius: 19, display: "grid", placeItems: "center", flexShrink: 0,
          cursor: streaming || text.trim() ? "pointer" : "default",
          background: streaming || text.trim() ? "#171717" : "#e8e8e6", color: "#fff", transition: "background 150ms",
        }}>
        {streaming
          ? <span style={{ width: 11, height: 11, borderRadius: 2, background: "#fff" }} />
          : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 13V3M8 3L3.5 7.5M8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
    </div>
  );
}
