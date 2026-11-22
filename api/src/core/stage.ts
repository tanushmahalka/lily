import { db, id, now } from "../lib/db";
import { logEvent, type Actor } from "../lib/events";
import { createApproval } from "./approvals";
import { postChat } from "./chat";
import { at, fail, mustRow, one } from "./util";

export type Stage = "shortlisted" | "reached_out" | "talking" | "negotiating" | "deal_ready"
  | "awaiting_video" | "video_feedback" | "video_ready" | "completed" | "declined";

export const STAGES: Stage[] = ["shortlisted", "reached_out", "talking", "negotiating", "deal_ready",
  "awaiting_video", "video_feedback", "video_ready", "completed", "declined"];

// CONTRACT "Stages and allowed transitions". `declined` is reachable from any non-final stage (see canMove).
const TRANSITIONS: Record<Stage, Stage[]> = {
  shortlisted: ["reached_out"],
  reached_out: ["talking", "negotiating"],
  talking: ["negotiating"],
  negotiating: ["deal_ready"],
  deal_ready: ["awaiting_video", "negotiating"],
  awaiting_video: ["video_feedback"],
  video_feedback: ["video_feedback", "video_ready"],
  video_ready: ["completed", "video_feedback"],
  completed: [],
  declined: [],
};

export const STAGE_LABEL: Record<Stage, string> = {
  shortlisted: "Shortlisted", reached_out: "Reached out", talking: "Talking", negotiating: "Negotiating",
  deal_ready: "Needs your OK", awaiting_video: "Filming", video_feedback: "Feedback round",
  video_ready: "Needs your OK", completed: "Done", declined: "Didn't work out",
};

export function canMove(from: Stage, to: Stage) {
  if (to === "declined") return from !== "completed" && from !== "declined";
  return TRANSITIONS[from].includes(to);
}

/** Enforces CONTRACT transitions. Same stage = only updates latest_action. Throws 409 on an illegal move. */
export function setStage(dealId: string, stage: Stage, latestAction: string, opts: { actor?: Actor } = {}): void {
  const deal = mustRow("deals", dealId, "deal");
  if (!STAGES.includes(stage)) throw fail(400, { error: `unknown stage ${stage}` });
  const t = now();
  if (deal.stage === stage) {
    db.query("UPDATE deals SET latest_action = ?, updated_at = ? WHERE id = ?").run(latestAction, t, dealId);
    return;
  }
  if (!canMove(deal.stage, stage)) throw fail(409, { error: `can't move from ${deal.stage} to ${stage}` });

  const creator = one<{ ig_handle: string }>("SELECT ig_handle FROM creators WHERE id = ?", deal.creator_id);
  const who = at(creator?.ig_handle);
  db.transaction(() => {
    db.query("UPDATE deals SET stage = ?, latest_action = ?, updated_at = ? WHERE id = ?").run(stage, latestAction, t, dealId);
    const actor = opts.actor ?? "lily";
    logEvent({
      campaign_id: deal.campaign_id, deal_id: dealId, actor, type: "stage.changed",
      summary: `${who} moved to ${STAGE_LABEL[stage]}`, data: { from: deal.stage, to: stage },
    });
    if (stage === "declined") {
      logEvent({ campaign_id: deal.campaign_id, deal_id: dealId, actor, type: "creator.declined", summary: `${who} is out: ${latestAction}` });
      postChat({ campaign_id: deal.campaign_id, role: "lily", kind: "update", body: `${who} is out: ${latestAction}`, ref: { deal_id: dealId } });
    }
    if (stage === "completed") createPayout(dealId, deal.campaign_id, deal.agreed_fee_usd ?? 0, who);
  })();
}

function createPayout(dealId: string, campaignId: string, amount: number, who: string) {
  if (one("SELECT id FROM payouts WHERE deal_id = ?", dealId)) return;
  const pid = id("pay");
  db.query("INSERT INTO payouts (id, deal_id, amount_usd, status, created_at) VALUES (?, ?, ?, 'pending', ?)").run(pid, dealId, amount, now());
  logEvent({ campaign_id: campaignId, deal_id: dealId, actor: "system", type: "payout.created", summary: `$${amount} payment for ${who} is ready` });
  createApproval({ campaign_id: campaignId, deal_id: dealId, kind: "payment", ref_id: pid });
}
