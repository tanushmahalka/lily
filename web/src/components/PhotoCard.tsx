import type { ReactNode } from "react";
import { getAvatarColor, StatusBadge, Text } from "../kit/halaska-kit";
import { STAGE_LABEL, STAGE_STATUS, compact } from "../lib/stages";
import type { Creator, Stage } from "../lib/types";

/** Full-bleed creator photo; falls back to a tinted tile with initials. */
export function CreatorPhoto({ creator, ratio = "4 / 5", children }: { creator: Creator; ratio?: string; children?: ReactNode }) {
  const color = getAvatarColor(creator.name || creator.ig_handle);
  const initials = (creator.name || creator.ig_handle).replace(/^@/, "").slice(0, 2).toUpperCase();
  return (
    <div style={{ position: "relative", aspectRatio: ratio, background: color.bg, overflow: "hidden" }}>
      {creator.avatar_url ? (
        <img src={creator.avatar_url} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 40, fontWeight: 600, color: color.text }}>{initials}</div>
      )}
      {children}
    </div>
  );
}

/** Photo-first card: the creator's face edge to edge, name on a soft gradient, Lily's line underneath. */
export default function PhotoCard({ creator, stage, line, footer, onOpen, ratio = "4 / 5", dim }: {
  creator: Creator;
  stage?: Stage;
  line?: ReactNode;
  footer?: ReactNode;
  onOpen?: () => void;
  ratio?: string;
  dim?: boolean;
}) {
  return (
    <div
      style={{
        borderRadius: 16, overflow: "hidden", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
        opacity: dim ? 0.6 : 1, transition: "transform 160ms ease, box-shadow 160ms ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.05)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)"; }}
    >
      <button type="button" onClick={onOpen} aria-label={`Open @${creator.ig_handle}`}
        style={{ all: "unset", display: "block", width: "100%", cursor: onOpen ? "pointer" : "default" }}>
        <CreatorPhoto creator={creator} ratio={ratio}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.65) 100%)" }} />
          {stage && <div style={{ position: "absolute", top: 10, left: 10 }}><StatusBadge status={STAGE_STATUS[stage]}>{STAGE_LABEL[stage]}</StatusBadge></div>}
          <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, color: "#fff" }}>
            <div style={{ fontWeight: 600, fontSize: 15, textShadow: "0 1px 2px rgba(0,0,0,.3)" }}>@{creator.ig_handle}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {[creator.followers != null ? `${compact(creator.followers)} followers` : null, creator.niche].filter(Boolean).join(" · ")}
            </div>
          </div>
        </CreatorPhoto>
        {line && <div style={{ padding: "10px 14px 0" }}><Text size="sm" secondary as="div">{line}</Text></div>}
      </button>
      <div style={{ padding: footer ? "10px 14px 12px" : "0 0 12px" }}>{footer}</div>
    </div>
  );
}
