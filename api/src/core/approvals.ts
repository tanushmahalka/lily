import { wakeLily } from "../lily";
import { db, id, now } from "../lib/db";
import { logEvent } from "../lib/events";
import { postChat } from "./chat";
import { setStage } from "./stage";
import { all, at, campaignTitle, fail, mustRow, one, row } from "./util";

export type ApprovalKind = "shortlist" | "deal" | "video" | "payment";
type Autonomy = "human_first" | "autopilot" | "full_autopilot";

/** Which approvals wait for the admin, per autonomy mode (CONTRACT Amendments v2 #5, v3 #1). */
export const GATES: Record<Autonomy, Record<ApprovalKind, boolean>> = {
  human_first: { shortlist: true, deal: true, video: true, payment: true },
  autopilot: { shortlist: false, deal: false, video: false, payment: true },
  full_autopilot: { shortlist: false, deal: false, video: false, payment: false },
};

function describe(kind: ApprovalKind, who: string, amount?: number | null) {
  switch (kind) {
    case "shortlist": return "The shortlist";
    case "deal": return `Deal with ${who}`;
    case "video": return `Video from ${who}`;
    case "payment": return `$${amount ?? 0} payment to ${who}`;
  }
}

function whoFor(dealId?: string | null) {
  if (!dealId) return "";
  return at(one<{ ig_handle: string }>("SELECT c.ig_handle FROM deals d JOIN creators c ON c.id = d.creator_id WHERE d.id = ?", dealId)?.ig_handle);
}

export function createApproval(a: {
  campaign_id: string; deal_id?: string | null; kind: ApprovalKind; ref_id?: string | null;
}): { id: string; status: "pending" | "approved" } {
  const campaign = mustRow("campaigns", a.campaign_id, "campaign");
  const gated = GATES[campaign.autonomy as Autonomy][a.kind];
  const aid = id("apv");
  const t = now();
  const who = whoFor(a.deal_id);
  const payout = a.kind === "payment" ? row("payouts", a.ref_id) : null;
  const what = describe(a.kind, who, payout?.amount_usd);
  db.transaction(() => {
    db.query(`INSERT INTO approvals (id, campaign_id, deal_id, kind, ref_id, status, decided_by, created_at, decided_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(aid, a.campaign_id, a.deal_id ?? null, a.kind, a.ref_id ?? null, gated ? "pending" : "approved", gated ? null : "lily", t, gated ? null : t);
    if (gated) {
      logEvent({ campaign_id: a.campaign_id, deal_id: a.deal_id, actor: "lily", type: "approval.requested", summary: `${what} is ready for your OK`, data: { approval_id: aid, kind: a.kind } });
      postChat({ campaign_id: a.campaign_id, role: "lily", kind: "approval", body: `${what} is ready for your OK`, ref: { approval_id: aid, deal_id: a.deal_id ?? null, kind: a.kind } });
    } else {
      logEvent({ campaign_id: a.campaign_id, deal_id: a.deal_id, actor: "lily", type: "approval.decided", summary: `${what}: approved on autopilot`, data: { approval_id: aid, kind: a.kind, decision: "approve", decided_by: "lily" } });
      applyDecision(mustRow("approvals", aid), "approve", null);
    }
  })();
  return { id: aid, status: gated ? "pending" : "approved" };
}

/** Stage and record effects of a decision, shared by admin decisions and autopilot. */
function applyDecision(a: any, decision: "approve" | "changes", note: string | null) {
  const asked = note ? `You asked for changes: ${note}` : "You asked for changes";
  if (a.kind === "deal") {
    if (decision === "approve") setStage(a.deal_id, "awaiting_video", "Deal approved. Waiting for the video", { actor: a.decided_by });
    else setStage(a.deal_id, "negotiating", asked, { actor: "admin" });
  } else if (a.kind === "video") {
    if (decision === "approve") {
      if (a.ref_id) db.query("UPDATE submissions SET status = 'admin_ok' WHERE id = ?").run(a.ref_id);
      setStage(a.deal_id, "completed", "Done. Video approved", { actor: a.decided_by });
    } else {
      if (a.ref_id) db.query("UPDATE submissions SET status = 'admin_changes' WHERE id = ?").run(a.ref_id);
      setStage(a.deal_id, "video_feedback", asked, { actor: "admin" });
    }
  } else if (a.kind === "payment" && decision === "approve") {
    const p = row("payouts", a.ref_id);
    if (p && p.status === "pending") {
      db.query("UPDATE payouts SET status = 'approved' WHERE id = ?").run(p.id);
      logEvent({ campaign_id: a.campaign_id, deal_id: a.deal_id, actor: a.decided_by ?? "admin", type: "payout.approved", summary: `Approved the $${p.amount_usd} payment to ${whoFor(a.deal_id)}` });
    }
  }
}

export function decideApproval(approvalId: string, decision: "approve" | "changes", note: string | null) {
  const a = mustRow("approvals", approvalId, "approval");
  if (a.status !== "pending") throw fail(409, { error: "already decided" });
  const t = now();
  db.transaction(() => {
    db.query("UPDATE approvals SET status = ?, decided_by = 'admin', admin_note = ?, decided_at = ? WHERE id = ?")
      .run(decision === "approve" ? "approved" : "changes", note, t, approvalId);
    const what = describe(a.kind, whoFor(a.deal_id), row("payouts", a.ref_id)?.amount_usd);
    logEvent({
      campaign_id: a.campaign_id, deal_id: a.deal_id, actor: "admin", type: "approval.decided",
      summary: decision === "approve" ? `You approved: ${what}` : `You asked for changes: ${what}${note ? ` (${note})` : ""}`,
      data: { approval_id: approvalId, kind: a.kind, decision, note },
    });
    applyDecision({ ...a, decided_by: "admin" }, decision, note);
  })();
  if (a.kind !== "payment") wake("admin-decision", { approval_id: approvalId });
  return enrichApproval(mustRow("approvals", approvalId));
}

/** Fire-and-forget: a Lily failure never fails the admin's request (E's wakeLily logs lily.unreachable). */
export function wake(route: Parameters<typeof wakeLily>[0], payload: Record<string, unknown>) {
  try {
    wakeLily(route, payload).catch((e) => console.error(`[core] wakeLily(${route}) failed`, e));
  } catch (e) {
    console.error(`[core] wakeLily(${route}) failed`, e);
  }
}

/** UI card shape: {...approval, campaign_title, deal, creator, ref}. */
export function enrichApproval(a: any) {
  const campaign = row("campaigns", a.campaign_id);
  const deal = row("deals", a.deal_id);
  const creator = deal ? row("creators", deal.creator_id) : null;
  let ref: unknown = null;
  if (a.kind === "deal") ref = row("offers", a.ref_id);
  else if (a.kind === "video") ref = row("submissions", a.ref_id);
  else if (a.kind === "payment") ref = row("payouts", a.ref_id);
  else if (a.kind === "shortlist") {
    const deals = all("SELECT * FROM deals WHERE campaign_id = ? AND stage = 'shortlisted' AND source = 'lily' ORDER BY created_at", a.campaign_id);
    ref = { deals: deals.map((d) => ({ ...d, creator: row("creators", d.creator_id) })) };
  }
  return { ...a, campaign_title: campaign ? campaignTitle(campaign) : null, deal, creator, ref };
}

export function listApprovals(where: { status?: string; campaign_id?: string }) {
  const cond: string[] = [];
  const params: string[] = [];
  if (where.status) { cond.push("status = ?"); params.push(where.status); }
  if (where.campaign_id) { cond.push("campaign_id = ?"); params.push(where.campaign_id); }
  return all(`SELECT * FROM approvals ${cond.length ? "WHERE " + cond.join(" AND ") : ""} ORDER BY created_at DESC`, ...params).map(enrichApproval);
}
