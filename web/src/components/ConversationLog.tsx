import { format } from "date-fns";
import { Attachment, Badge, Text } from "../kit/halaska-kit";
import { videoUrl } from "../lib/api";
import { field, type Attachment as Att, type Message } from "../lib/types";

/** Instagram + email in one thread, oldest first, read-only. */
export default function ConversationLog({ messages, creatorName, speaksAs }: {
  messages: Message[]; creatorName: string; speaksAs: (ch: Message["channel"]) => string;
}) {
  if (!messages.length) return <Text size="sm" muted>No messages yet.</Text>;
  const sorted = [...messages].sort((a, b) => a.created_at - b.created_at);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map((m) => {
        const out = m.direction === "out";
        const atts = field<Att[]>(m, "attachments", []);
        return (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start", opacity: m.suppressed ? 0.55 : 1 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
              <Text size="xs" muted>{out ? speaksAs(m.channel) : creatorName}</Text>
              <Badge>{m.channel === "instagram" ? "IG" : "Email"}</Badge>
              <Text size="xs" muted>{format(m.created_at, "MMM d, h:mm a")}</Text>
            </div>
            <div style={{
              maxWidth: "85%", padding: "8px 12px", borderRadius: 14, whiteSpace: "pre-wrap",
              background: out ? "#171717" : "#f2f2f2", color: out ? "#fff" : "#171717",
              border: m.suppressed ? "1px dashed #a3a3a3" : "none", fontSize: 14, lineHeight: 1.45,
            }}>
              {m.body}
            </div>
            {m.suppressed ? <Text size="xs" muted as="div" style={{ marginTop: 3 }}>Drafted, not sent (demo allowlist)</Text> : null}
            {atts.map((a, i) => {
              const src = videoUrl(a.local_path);
              const isVideo = a.mime?.startsWith("video/");
              return (
                <div key={i} style={{ marginTop: 6, maxWidth: "85%" }}>
                  {isVideo && src
                    ? <video src={src} controls playsInline style={{ width: 260, borderRadius: 10, background: "#000" }} />
                    : <Attachment name={a.filename} kind={a.mime?.startsWith("image/") ? "image" : "file"} size="" onOpen={src ? () => window.open(src, "_blank") : undefined} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
