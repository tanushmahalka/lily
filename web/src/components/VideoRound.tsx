import { Badge, Text } from "../kit/halaska-kit";
import { videoUrl } from "../lib/api";
import { field, type Review, type Submission } from "../lib/types";
import Markdown from "./Markdown";

const STATUS: Record<Submission["status"], [string, "default" | "success" | "warning" | "danger" | "accent"]> = {
  reviewing: ["Lily is reviewing", "default"],
  changes: ["Lily asked for changes", "warning"],
  lily_ok: ["Lily approved · needs your OK", "accent"],
  admin_ok: ["You approved", "success"],
  admin_changes: ["You asked for changes", "warning"],
};

export default function VideoRound({ s, compact }: { s: Submission; compact?: boolean }) {
  const review = field<Review | null>(s, "review", null);
  const src = videoUrl(s.local_path);
  // failed checks first, so a missing must-have is the first thing you read
  const checks = [...(review?.checks ?? [])].sort((a, b) => Number(a.passed) - Number(b.passed));
  const [label, variant] = STATUS[s.status] ?? [s.status, "default"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!compact && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text weight="semibold">Round {s.round}</Text>
          <Badge variant={variant}>{label}</Badge>
        </div>
      )}
      {src ? (
        <video src={src} controls playsInline style={{ width: "100%", maxHeight: 360, borderRadius: 12, background: "#000" }} />
      ) : s.source_url ? (
        <a href={s.source_url} target="_blank" rel="noreferrer"><Text size="sm">Open the video ↗</Text></a>
      ) : null}
      {checks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span aria-label={c.passed ? "Passed" : "Failed"} style={{ color: c.passed ? "#16a34a" : "#dc2626", fontWeight: 600, width: 14, flexShrink: 0 }}>
                {c.passed ? "✓" : "✗"}
              </span>
              <div>
                <Text size="sm" weight={c.passed ? "regular" : "medium"}>{c.rule}</Text>
                {c.note && <Text size="xs" muted as="div">{c.note}</Text>}
              </div>
            </div>
          ))}
        </div>
      )}
      {review?.notes_for_admin && <Text size="sm" secondary as="div">Lily: {review.notes_for_admin}</Text>}
      {!compact && review?.feedback_to_creator && review.verdict === "changes" && (
        <div style={{ background: "#f5f5f5", borderRadius: 10, padding: "8px 12px" }}>
          <Text size="xs" muted as="div">Lily's feedback to the creator</Text>
          <Markdown text={review.feedback_to_creator} />
        </div>
      )}
    </div>
  );
}
