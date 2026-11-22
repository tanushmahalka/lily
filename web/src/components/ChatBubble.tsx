import type { ReactNode } from "react";
import { AgentGlyph } from "../kit/halaska-kit";

/** One chat turn. You: right, dark bubble. Lily: left, open layout so cards get full width. */
export default function ChatBubble({ role, time, streaming, pending, children }: {
  role: "user" | "agent"; time?: string; streaming?: boolean; pending?: boolean; children: ReactNode;
}) {
  if (role === "user") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, opacity: pending ? 0.7 : 1 }}>
        <div style={{ maxWidth: "78%", background: "#171717", color: "#fff", padding: "10px 14px", borderRadius: "18px 18px 6px 18px", fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {children}
        </div>
        {time && <span style={{ fontSize: 11, color: "#a3a3a3" }}>{time}</span>}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ paddingTop: 2 }}><AgentGlyph size={26} /></div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.55, color: "#1c1c1c" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#737373", marginBottom: 3 }}>
          Lily {time && <span style={{ fontWeight: 400, color: "#a3a3a3", marginLeft: 6 }}>{time}</span>}
        </div>
        {children}
        {streaming && <span className="caret" />}
      </div>
    </div>
  );
}
