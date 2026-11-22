import type { Autonomy, Stage, Terms } from "./types";

// PLAN §1.3 order for grouping (needs-your-OK stages stay in place; they're also in Needs you)
export const GROUP_ORDER: Stage[] = [
  "shortlisted", "reached_out", "talking", "negotiating", "deal_ready",
  "awaiting_video", "video_feedback", "video_ready", "completed", "declined",
];

export const STAGE_LABEL: Record<Stage, string> = {
  shortlisted: "Shortlisted", reached_out: "Reached out", talking: "Talking", negotiating: "Negotiating",
  deal_ready: "Needs your OK", awaiting_video: "Filming", video_feedback: "Feedback round",
  video_ready: "Needs your OK", completed: "Done", declined: "Didn't work out",
};
export const GROUP_LABEL: Record<Stage, string> = {
  ...STAGE_LABEL, deal_ready: "Deal ready · needs your OK", video_ready: "Video ready · needs your OK",
};

/** kit StatusBadge status per stage */
export const STAGE_STATUS: Record<Stage, "default" | "online" | "offline" | "pending" | "error" | "accent"> = {
  shortlisted: "default", reached_out: "accent", talking: "accent", negotiating: "accent",
  deal_ready: "pending", awaiting_video: "accent", video_feedback: "accent", video_ready: "pending",
  completed: "online", declined: "offline",
};

export const AUTONOMY_LABEL: Record<Autonomy, string> = {
  human_first: "Human-first", autopilot: "Autopilot", full_autopilot: "Full autopilot",
};
export const AUTONOMY_FROM_LABEL: Record<string, Autonomy> = Object.fromEntries(
  Object.entries(AUTONOMY_LABEL).map(([k, v]) => [v, k as Autonomy]),
);

/** One constant for the gates (CONTRACT Amendments v3 #1). */
export const GATES: Record<Autonomy, { gates: string[]; line: string }> = {
  human_first: { gates: ["shortlist", "deal", "video", "payment"], line: "You approve the shortlist, every deal, every final video and payments." },
  autopilot: { gates: ["payment"], line: "You approve payments only. Lily handles the rest." },
  full_autopilot: { gates: [], line: "Coming soon." },
};

export const usd = (n?: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);
export const compact = (n?: number | null) =>
  n == null ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export function termsLine(t: Terms): string {
  const bits = [
    t.fee_usd != null ? `${usd(t.fee_usd)}` : null,
    t.deliverables ? `for ${t.deliverables}` : null,
  ].filter(Boolean).join(" ");
  const extra = [
    t.revision_rounds != null ? `${t.revision_rounds} revision${t.revision_rounds === 1 ? "" : "s"}` : null,
    t.usage_rights_days != null ? `${t.usage_rights_days} days of usage` : null,
    t.delivery_days != null ? `delivered in ${t.delivery_days} days` : null,
    t.upfront_pct != null ? `${t.upfront_pct}% upfront` : null,
  ].filter(Boolean).join(", ");
  return [bits, extra].filter(Boolean).join(" · ");
}
