import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, id, now } from "../lib/db";
import { logEvent, subscribe } from "../lib/events";
import { createApproval, decideApproval, enrichApproval, listApprovals, wake } from "./approvals";
import { postChat } from "./chat";
import { checkTerms, deriveGuardrails } from "./guardrails";
import { setStage, STAGES, type Stage } from "./stage";
import { all, at, body, campaignTitle, fail, getSetting, mustRow, one, row } from "./util";

const app = new Hono();
const AUTONOMY = ["human_first", "autopilot", "full_autopilot"];
const AUTONOMY_LABEL: Record<string, string> = { human_first: "Human-first", autopilot: "Autopilot" };
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const latestAnalysis = (creatorId: string, campaignId: string) =>
  one("SELECT * FROM analyses WHERE creator_id = ? AND campaign_id = ? ORDER BY created_at DESC LIMIT 1", creatorId, campaignId);
const withTitle = (c: any) => ({ ...c, title: campaignTitle(c) });

// ---------- settings + accounts ----------
app.get("/settings", (c) => {
  const out: Record<string, unknown> = {};
  for (const r of db.query("SELECT key, value_json FROM settings").all() as { key: string; value_json: string }[]) out[r.key] = JSON.parse(r.value_json);
  return c.json(out);
});

app.put("/settings/:key", async (c) => {
  const key = c.req.param("key");
  const { value } = await body(c);
  if (value === undefined) throw fail(400, { error: "value is required" });
  if (key === "default_autonomy") {
    if (value === "full_autopilot") throw fail(400, { error: "coming_soon" });
    if (!AUTONOMY.includes(value)) throw fail(400, { error: "default_autonomy must be human_first or autopilot" });
  } else if (key === "brand") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw fail(400, { error: "brand must be an object" });
  } else throw fail(400, { error: `unknown setting ${key}` });
  db.query("INSERT INTO settings (key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json").run(key, JSON.stringify(value));
  logEvent({ actor: "admin", type: "settings.changed", summary: key === "brand" ? "Updated the brand details" : `Default mode is now ${AUTONOMY_LABEL[value]}`, data: { key } });
  return c.json({ key, value });
});

app.get("/accounts", (c) => c.json(all("SELECT * FROM accounts ORDER BY channel DESC")));

// ---------- campaigns ----------
app.get("/campaigns", (c) => {
  const camps = all("SELECT * FROM campaigns ORDER BY created_at DESC");
  return c.json(camps.map((campaign) => {
    const stage_counts: Record<string, number> = {};
    for (const r of db.query("SELECT stage, COUNT(*) n FROM deals WHERE campaign_id = ? GROUP BY stage").all(campaign.id) as { stage: string; n: number }[]) stage_counts[r.stage] = r.n;
    const needs_you = (db.query("SELECT COUNT(*) n FROM approvals WHERE campaign_id = ? AND status = 'pending'").get(campaign.id) as { n: number }).n;
    return { campaign: withTitle(campaign), needs_you, stage_counts };
  }));
});

app.post("/campaigns", async (c) => {
  const b = await body(c);
  if (!isNum(b.budget_usd) || b.budget_usd <= 0) throw fail(400, { error: "budget_usd must be a positive number" });
  if (!isStr(b.product_url)) throw fail(400, { error: "product_url is required" });
  if (!isStr(b.goal)) throw fail(400, { error: "goal is required" });
  if (b.autonomy === "full_autopilot") throw fail(400, { error: "coming_soon" });
  if (b.autonomy != null && !AUTONOMY.includes(b.autonomy)) throw fail(400, { error: "autonomy must be human_first or autopilot" });
  let autonomy: string = b.autonomy ?? getSetting<string>("default_autonomy") ?? "human_first";
  if (!AUTONOMY.includes(autonomy) || autonomy === "full_autopilot") autonomy = "human_first";
  const cid = id("cmp");
  const tid = id("thr");
  const t = now();
  db.transaction(() => {
    db.query("INSERT INTO campaigns (id, status, autonomy, budget_usd, product_url, goal, chat_thread_id, created_at) VALUES (?, 'ideating', ?, ?, ?, ?, ?, ?)")
      .run(cid, autonomy, Math.round(b.budget_usd), b.product_url.trim(), b.goal.trim(), tid, t);
    db.query("INSERT INTO chat_threads (id, title, campaign_id, created_at) VALUES (?, ?, ?, ?)").run(tid, b.goal.trim(), cid, t);
    logEvent({ campaign_id: cid, actor: "admin", type: "campaign.created", summary: `New campaign: ${b.goal.trim()}` });
  })();
  return c.json({ campaign: withTitle(row("campaigns", cid)), thread_id: tid });
});

app.get("/campaigns/:id", (c) => {
  const campaign = mustRow("campaigns", c.req.param("id"), "campaign");
  const ideas = all("SELECT * FROM ideas WHERE campaign_id = ? ORDER BY position", campaign.id);
  const deals = all("SELECT * FROM deals WHERE campaign_id = ? ORDER BY updated_at DESC", campaign.id).map((deal) => ({
    deal, creator: row("creators", deal.creator_id), analysis: latestAnalysis(deal.creator_id, campaign.id),
  }));
  const payouts = all("SELECT p.* FROM payouts p JOIN deals d ON d.id = p.deal_id WHERE d.campaign_id = ? ORDER BY p.created_at", campaign.id)
    .map((p) => ({ ...p, creator: deals.find((d) => d.deal.id === p.deal_id)?.creator ?? null }));
  return c.json({
    campaign: withTitle(campaign), title: campaignTitle(campaign), ideas, deals,
    approvals_pending: listApprovals({ status: "pending", campaign_id: campaign.id }), payouts,
  });
});

app.patch("/campaigns/:id", async (c) => {
  const campaign = mustRow("campaigns", c.req.param("id"), "campaign");
  const { autonomy } = await body(c);
  if (autonomy === "full_autopilot") throw fail(400, { error: "coming_soon" });
  if (!AUTONOMY.includes(autonomy)) throw fail(400, { error: "autonomy must be human_first or autopilot" });
  if (autonomy !== campaign.autonomy) {
    db.query("UPDATE campaigns SET autonomy = ? WHERE id = ?").run(autonomy, campaign.id);
    logEvent({ campaign_id: campaign.id, actor: "admin", type: "autonomy.changed", summary: `Switched to ${AUTONOMY_LABEL[autonomy]}`, data: { from: campaign.autonomy, to: autonomy } });
  }
  return c.json(withTitle(row("campaigns", campaign.id)));
});

/** Amendments v4 #5: stores the product and renames the campaign's chat thread to its title (goal if none). B calls it too. */
export function setCampaignProduct(campaignId: string, product_json: Record<string, any>) {
  const campaign = mustRow("campaigns", campaignId, "campaign");
  if (!product_json || typeof product_json !== "object" || Array.isArray(product_json)) throw fail(400, { error: "product_json must be an object" });
  db.query("UPDATE campaigns SET product_json = ? WHERE id = ?").run(JSON.stringify(product_json), campaign.id);
  const title = isStr(product_json.title) ? product_json.title.trim() : campaign.goal;
  if (campaign.chat_thread_id) {
    db.query("UPDATE chat_threads SET title = ? WHERE id = ?").run(title, campaign.chat_thread_id);
    logEvent({ campaign_id: campaign.id, actor: "lily", type: "thread.renamed", summary: `Named the chat "${title}"`, data: { thread_id: campaign.chat_thread_id, title } });
  }
  return withTitle(row("campaigns", campaign.id));
}

app.put("/campaigns/:id/product", async (c) => {
  const { product_json } = await body(c);
  return c.json(setCampaignProduct(c.req.param("id"), product_json));
});

// Amendments v4 #1: brief.video_rules is the one editable checklist once an idea is chosen.
app.put("/campaigns/:id/brief", async (c) => {
  const campaign = mustRow("campaigns", c.req.param("id"), "campaign");
  const { video_rules } = await body(c);
  if (!Array.isArray(video_rules) || video_rules.length > 10 || !video_rules.every(isStr))
    throw fail(400, { error: "video_rules must be an array of up to 10 non-empty strings" });
  if (!campaign.brief) throw fail(409, { error: "campaign has no brief yet (choose an idea first)" });
  const rules = video_rules.map((r: string) => r.trim());
  db.query("UPDATE campaigns SET brief_json = ? WHERE id = ?").run(JSON.stringify({ ...campaign.brief, video_rules: rules }), campaign.id);
  logEvent({ campaign_id: campaign.id, actor: "admin", type: "brief.updated", summary: `Updated the video checklist (${rules.length} rule${rules.length === 1 ? "" : "s"})`, data: { video_rules: rules } });
  return c.json(withTitle(row("campaigns", campaign.id)));
});

app.post("/campaigns/:id/ideas", async (c) => {
  const campaign = mustRow("campaigns", c.req.param("id"), "campaign");
  const b = await body(c);
  const ideas = b.ideas;
  if (!Array.isArray(ideas) || ideas.length < 1 || ideas.length > 3) throw fail(400, { error: "ideas must be an array of 1-3 ideas" });
  ideas.forEach((i: any, n: number) => {
    for (const k of ["title", "angle", "video_description", "creator_profile"]) if (!isStr(i?.[k])) throw fail(400, { error: `ideas[${n}].${k} is required` });
    for (const k of ["keywords", "video_rules"]) if (!Array.isArray(i[k]) || !i[k].every(isStr)) throw fail(400, { error: `ideas[${n}].${k} must be an array of strings` });
    for (const k of ["creators_target", "fee_hint_usd"]) if (!isNum(i[k]) || i[k] <= 0) throw fail(400, { error: `ideas[${n}].${k} must be a positive number` });
  });
  if (campaign.chosen_idea_id) throw fail(409, { error: "an idea is already chosen for this campaign" });
  const ids: string[] = [];
  db.transaction(() => {
    db.query("DELETE FROM ideas WHERE campaign_id = ? AND chosen = 0").run(campaign.id);
    ideas.forEach((i: any, n: number) => {
      const iid = id("idea");
      ids.push(iid);
      db.query(`INSERT INTO ideas (id, campaign_id, position, title, angle, video_description, creator_profile, keywords_json, video_rules_json, creators_target, fee_hint_usd, chosen)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`)
        .run(iid, campaign.id, n + 1, i.title, i.angle, i.video_description, i.creator_profile, JSON.stringify(i.keywords), JSON.stringify(i.video_rules), Math.round(i.creators_target), Math.round(i.fee_hint_usd));
    });
    logEvent({ campaign_id: campaign.id, actor: "lily", type: "ideas.proposed", summary: `Proposed ${ideas.length} campaign ideas` });
  })();
  const msg = postChat({
    campaign_id: campaign.id, role: "lily", kind: "ideas",
    body: isStr(b.body) ? b.body : `Here are ${ideas.length} ways to run this. Pick the one you like:`,
    ref: { campaign_id: campaign.id, idea_ids: ids },
  });
  return c.json({ ideas: all("SELECT * FROM ideas WHERE campaign_id = ? ORDER BY position", campaign.id), message_id: msg.id });
});

app.post("/campaigns/:id/choose", async (c) => {
  const campaign = mustRow("campaigns", c.req.param("id"), "campaign");
  const { idea_id } = await body(c);
  const idea = row("ideas", idea_id);
  if (!idea || idea.campaign_id !== campaign.id) throw fail(404, { error: "idea not found in this campaign" });
  if (campaign.chosen_idea_id) throw fail(409, { error: "an idea is already chosen for this campaign" });
  const brief = {
    title: idea.title, angle: idea.angle, video_description: idea.video_description, creator_profile: idea.creator_profile,
    keywords: idea.keywords, video_rules: idea.video_rules, creators_target: idea.creators_target,
  };
  const guardrails = deriveGuardrails(campaign.budget_usd, idea.creators_target);
  db.transaction(() => {
    db.query("UPDATE ideas SET chosen = (id = ?) WHERE campaign_id = ?").run(idea.id, campaign.id);
    db.query("UPDATE campaigns SET chosen_idea_id = ?, brief_json = ?, guardrails_json = ?, status = 'active' WHERE id = ?")
      .run(idea.id, JSON.stringify(brief), JSON.stringify(guardrails), campaign.id);
    if (campaign.chat_thread_id && !campaign.product?.title) db.query("UPDATE chat_threads SET title = ? WHERE id = ?").run(idea.title, campaign.chat_thread_id);
    logEvent({ campaign_id: campaign.id, actor: "admin", type: "idea.chosen", summary: `Chose "${idea.title}"`, data: { idea_id: idea.id, guardrails } });
  })();
  postChat({ campaign_id: campaign.id, role: "lily", kind: "update", body: "On it. I'll shortlist creators and reach out. I'll ask you before any deal is final." });
  wake("campaign-start", { campaign_id: campaign.id, phase: "find" });
  return c.json(withTitle(row("campaigns", campaign.id)));
});

app.post("/campaigns/:id/shortlist/submit", async (c) => {
  const campaign = mustRow("campaigns", c.req.param("id"), "campaign");
  if (one("SELECT id FROM approvals WHERE campaign_id = ? AND kind = 'shortlist' AND status = 'pending'", campaign.id))
    throw fail(409, { error: "a shortlist is already waiting for approval" });
  const n = (db.query("SELECT COUNT(*) n FROM deals WHERE campaign_id = ? AND stage = 'shortlisted' AND source = 'lily'").get(campaign.id) as { n: number }).n;
  if (n === 0) throw fail(409, { error: "no shortlisted creators to submit" });
  logEvent({ campaign_id: campaign.id, actor: "lily", type: "shortlist.submitted", summary: `Shortlisted ${n} creator${n === 1 ? "" : "s"}` });
  const a = createApproval({ campaign_id: campaign.id, kind: "shortlist" });
  if (a.status === "approved") wake("admin-decision", { approval_id: a.id });
  return c.json(enrichApproval(mustRow("approvals", a.id)));
});

// ---------- deals ----------
app.post("/deals", async (c) => {
  const b = await body(c);
  const campaign = mustRow("campaigns", b.campaign_id, "campaign");
  const creator = mustRow("creators", b.creator_id, "creator");
  const channel = b.channel ?? "instagram";
  if (!["instagram", "email"].includes(channel)) throw fail(400, { error: "channel must be instagram or email" });
  const existing = one("SELECT * FROM deals WHERE campaign_id = ? AND creator_id = ?", campaign.id, creator.id);
  if (existing) throw fail(409, { error: "creator is already in this campaign", deal: existing });
  const did = id("deal");
  const t = now();
  db.query("INSERT INTO deals (id, campaign_id, creator_id, source, stage, channel, latest_action, created_at, updated_at) VALUES (?, ?, ?, 'lily', 'shortlisted', ?, ?, ?, ?)")
    .run(did, campaign.id, creator.id, channel, isStr(b.latest_action) ? b.latest_action : "Shortlisted", t, t);
  logEvent({ campaign_id: campaign.id, deal_id: did, actor: "lily", type: "creator.shortlisted", summary: `Shortlisted ${at(creator.ig_handle)}` });
  return c.json(row("deals", did));
});

app.patch("/deals/:id", async (c) => {
  const deal = mustRow("deals", c.req.param("id"), "deal");
  const b = await body(c);
  const stage = (b.stage ?? deal.stage) as Stage;
  if (!STAGES.includes(stage)) throw fail(400, { error: `unknown stage ${b.stage}` });
  if (stage !== deal.stage && (stage === "deal_ready" || stage === "video_ready"))
    throw fail(409, { error: `${stage} is entered only via ${stage === "deal_ready" ? "accepting an offer" : "lily-approve"}` });
  const actor = b.actor === "admin" ? "admin" : "lily";
  const latest = isStr(b.latest_action) ? b.latest_action : stage === "declined" && actor === "admin" ? "Removed by you" : deal.latest_action ?? "";
  setStage(deal.id, stage, latest, { actor });
  return c.json(row("deals", deal.id));
});

app.get("/deals/:id/context", (c) => {
  const deal = mustRow("deals", c.req.param("id"), "deal");
  const campaign = withTitle(row("campaigns", deal.campaign_id));
  return c.json({
    deal, campaign, brief: campaign.brief, guardrails: campaign.guardrails,
    creator: row("creators", deal.creator_id),
    analysis: latestAnalysis(deal.creator_id, deal.campaign_id),
    reels: all("SELECT * FROM found_reels WHERE creator_id = ? ORDER BY (campaign_id = ?) DESC, views DESC LIMIT 10", deal.creator_id, deal.campaign_id),
    offers: all("SELECT * FROM offers WHERE deal_id = ? ORDER BY version", deal.id),
    messages: all("SELECT * FROM messages WHERE deal_id = ? ORDER BY created_at, rowid", deal.id),
    submissions: all("SELECT * FROM submissions WHERE deal_id = ? ORDER BY round", deal.id),
    approvals: all("SELECT * FROM approvals WHERE deal_id = ? ORDER BY created_at", deal.id),
    brand: getSetting("brand"),
    accounts: all("SELECT * FROM accounts ORDER BY channel DESC"),
  });
});

const OFFER_STAGES = ["reached_out", "talking", "negotiating"];

app.post("/deals/:id/offers", async (c) => {
  const deal = mustRow("deals", c.req.param("id"), "deal");
  const b = await body(c);
  if (b.by !== "lily" && b.by !== "creator") throw fail(400, { error: "by must be lily or creator" });
  const terms = b.terms;
  if (!terms || typeof terms !== "object" || !isNum(terms.fee_usd)) throw fail(400, { error: "terms.fee_usd is required" });
  for (const k of ["revision_rounds", "usage_rights_days", "delivery_days", "upfront_pct"])
    if (terms[k] != null && !isNum(terms[k])) throw fail(400, { error: `terms.${k} must be a number` });
  if (!OFFER_STAGES.includes(deal.stage)) throw fail(409, { error: `can't take offers while the deal is ${deal.stage}` });
  const campaign = mustRow("campaigns", deal.campaign_id, "campaign");
  if (!campaign.guardrails) throw fail(409, { error: "campaign has no guardrails yet (choose an idea first)" });
  const violations = checkTerms(terms, campaign.guardrails);
  if (b.by === "lily" && violations.length) throw fail(422, { violations });

  const who = at(one<{ ig_handle: string }>("SELECT ig_handle FROM creators WHERE id = ?", deal.creator_id)?.ig_handle);
  const oid = id("off");
  db.transaction(() => {
    db.query("UPDATE offers SET status = 'superseded' WHERE deal_id = ? AND status = 'open'").run(deal.id);
    const version = ((db.query("SELECT MAX(version) v FROM offers WHERE deal_id = ?").get(deal.id) as { v: number | null }).v ?? 0) + 1;
    db.query("INSERT INTO offers (id, deal_id, version, by, terms_json, within_guardrails, violations_json, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)")
      .run(oid, deal.id, version, b.by, JSON.stringify(terms), violations.length ? 0 : 1, JSON.stringify(violations), now());
    const latest = b.by === "lily" ? `Offered $${terms.fee_usd}, waiting for a reply` : `${who} asked for $${terms.fee_usd}`;
    logEvent(b.by === "lily"
      ? { campaign_id: deal.campaign_id, deal_id: deal.id, actor: "lily", type: "offer.made", summary: `Offered ${who} $${terms.fee_usd}`, data: { offer_id: oid } }
      : { campaign_id: deal.campaign_id, deal_id: deal.id, actor: "creator", type: "offer.received", summary: `${who} asked for $${terms.fee_usd}${violations.length ? " (outside the limits)" : ""}`, data: { offer_id: oid, violations } });
    setStage(deal.id, "negotiating", latest);
  })();
  return c.json(row("offers", oid));
});

app.post("/deals/:id/offers/:oid/accept", (c) => {
  const deal = mustRow("deals", c.req.param("id"), "deal");
  const offer = row("offers", c.req.param("oid"));
  if (!offer || offer.deal_id !== deal.id) throw fail(404, { error: "offer not found on this deal" });
  if (offer.status !== "open") throw fail(409, { error: `offer is ${offer.status}` });
  if (!offer.within_guardrails) throw fail(422, { violations: offer.violations });
  const who = at(one<{ ig_handle: string }>("SELECT ig_handle FROM creators WHERE id = ?", deal.creator_id)?.ig_handle);
  const fee = offer.terms.fee_usd;
  let approval!: { id: string };
  db.transaction(() => {
    db.query("UPDATE offers SET status = 'accepted' WHERE id = ?").run(offer.id);
    db.query("UPDATE deals SET agreed_fee_usd = ? WHERE id = ?").run(fee, deal.id);
    logEvent({ campaign_id: deal.campaign_id, deal_id: deal.id, actor: "lily", type: "offer.accepted", summary: `Agreed $${fee} with ${who}`, data: { offer_id: offer.id } });
    setStage(deal.id, "deal_ready", `Agreed $${fee}. Needs your OK`);
    approval = createApproval({ campaign_id: deal.campaign_id, deal_id: deal.id, kind: "deal", ref_id: offer.id });
  })();
  return c.json({ deal: row("deals", deal.id), offer: row("offers", offer.id), approval: enrichApproval(mustRow("approvals", approval.id)) });
});

app.post("/deals/:id/escalate", async (c) => {
  const deal = mustRow("deals", c.req.param("id"), "deal");
  const { question } = await body(c);
  if (!isStr(question)) throw fail(400, { error: "question is required" });
  const who = at(one<{ ig_handle: string }>("SELECT ig_handle FROM creators WHERE id = ?", deal.creator_id)?.ig_handle);
  const msg = postChat({ campaign_id: deal.campaign_id, role: "lily", kind: "text", body: question, ref: { deal_id: deal.id } });
  setStage(deal.id, deal.stage, `Waiting on you: ${question}`);
  logEvent({ campaign_id: deal.campaign_id, deal_id: deal.id, actor: "lily", type: "deal.escalated", summary: `Asked you about ${who}`, data: { message_id: msg.id } });
  return c.json({ message_id: msg.id });
});

// ---------- approvals ----------
app.get("/approvals", (c) => c.json(listApprovals({ status: c.req.query("status"), campaign_id: c.req.query("campaign_id") })));

app.post("/approvals/:id", async (c) => {
  const { decision, note } = await body(c);
  if (decision !== "approve" && decision !== "changes") throw fail(400, { error: "decision must be approve or changes" });
  return c.json(decideApproval(c.req.param("id"), decision, isStr(note) ? note : null));
});

// ---------- payouts + perf ----------
app.post("/payouts/:id/approve", (c) => {
  const p = mustRow("payouts", c.req.param("id"), "payout");
  const pending = one<{ id: string }>("SELECT id FROM approvals WHERE kind = 'payment' AND ref_id = ? AND status = 'pending'", p.id);
  if (pending) decideApproval(pending.id, "approve", null);
  else if (p.status === "pending") {
    const deal = mustRow("deals", p.deal_id, "deal");
    db.query("UPDATE payouts SET status = 'approved' WHERE id = ?").run(p.id);
    logEvent({ campaign_id: deal.campaign_id, deal_id: deal.id, actor: "admin", type: "payout.approved", summary: `Approved the $${p.amount_usd} payment` });
  } else throw fail(409, { error: `payout is ${p.status}` });
  return c.json(row("payouts", p.id));
});

app.post("/payouts/:id/paid", (c) => {
  const p = mustRow("payouts", c.req.param("id"), "payout");
  if (p.status !== "approved") throw fail(409, { error: p.status === "paid" ? "already paid" : "approve the payment first" });
  const deal = mustRow("deals", p.deal_id, "deal");
  const who = at(one<{ ig_handle: string }>("SELECT ig_handle FROM creators WHERE id = ?", deal.creator_id)?.ig_handle);
  db.query("UPDATE payouts SET status = 'paid', paid_at = ? WHERE id = ?").run(now(), p.id);
  logEvent({ campaign_id: deal.campaign_id, deal_id: deal.id, actor: "admin", type: "payout.paid", summary: `Marked $${p.amount_usd} to ${who} as paid` });
  return c.json(row("payouts", p.id));
});

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : `${n}`);

app.get("/deals/:id/perf", (c) => {
  const deal = mustRow("deals", c.req.param("id"), "deal");
  const snapshots = all("SELECT * FROM perf_snapshots WHERE deal_id = ? ORDER BY taken_at", deal.id);
  let lily_line: string | null = null;
  if (snapshots.length) {
    const last = snapshots[snapshots.length - 1];
    const hours = Math.round((last.taken_at - snapshots[0].taken_at) / 3600_000) + 6; // first check runs ~6 h after posting
    let trend = "Early days";
    if (snapshots.length >= 3) {
      const v = snapshots.map((s) => s.views ?? 0);
      const d1 = v[v.length - 1] - v[v.length - 2];
      const d0 = v[v.length - 2] - v[v.length - 3];
      trend = d1 <= 0 ? "Flat now" : d1 >= d0 * 0.6 ? "Still growing" : "Levelling off";
    }
    lily_line = `${trend}: ${fmt(last.views ?? 0)} views ${hours} hours after posting`;
  }
  return c.json({ snapshots, lily_line });
});

// ---------- creators ----------
app.get("/creators", (c) => {
  const creators = all("SELECT * FROM creators ORDER BY updated_at DESC");
  const deals = all("SELECT d.id deal_id, d.creator_id, d.campaign_id, d.stage, c.goal, c.brief_json FROM deals d JOIN campaigns c ON c.id = d.campaign_id ORDER BY d.created_at DESC");
  return c.json(creators.map((cr) => ({
    ...cr,
    deals: deals.filter((d) => d.creator_id === cr.id).map((d) => ({ deal_id: d.deal_id, campaign_id: d.campaign_id, campaign_title: campaignTitle(d), stage: d.stage })),
  })));
});

// `cr_` prefix keeps find's GET /creators/past reachable (core is mounted first).
app.get("/creators/:id{cr_[a-z0-9]+}", (c) => {
  const creator = mustRow("creators", c.req.param("id"), "creator");
  const deals = all("SELECT * FROM deals WHERE creator_id = ? ORDER BY created_at DESC", creator.id).map((deal) => ({
    deal, campaign: withTitle(row("campaigns", deal.campaign_id)), analysis: latestAnalysis(creator.id, deal.campaign_id),
    offers: all("SELECT * FROM offers WHERE deal_id = ? ORDER BY version", deal.id),
    submissions: all("SELECT * FROM submissions WHERE deal_id = ? ORDER BY round", deal.id),
  }));
  return c.json({ creator, deals });
});

// ---------- events + stream ----------
app.get("/events", (c) => {
  const cid = c.req.query("campaign_id");
  const since = Number(c.req.query("since") ?? 0) || 0;
  const cond = ["ts > ?"];
  const params: (string | number)[] = [since];
  if (cid) { cond.push("campaign_id = ?"); params.push(cid); }
  const rows = since
    ? all(`SELECT * FROM events WHERE ${cond.join(" AND ")} ORDER BY ts, rowid LIMIT 200`, ...params)
    : all(`SELECT * FROM events WHERE ${cond.join(" AND ")} ORDER BY ts DESC, rowid DESC LIMIT 200`, ...params).reverse();
  return c.json(rows);
});

app.get("/stream", (c) =>
  streamSSE(c, async (stream) => {
    const unsubscribe = subscribe((m) => {
      stream.writeSSE({ event: m.channel, data: JSON.stringify(m.data) }).catch(() => {});
    });
    let open = true;
    stream.onAbort(() => { open = false; unsubscribe(); });
    await stream.write(": connected\n\n");
    while (open) {
      await stream.sleep(15_000);
      if (open) await stream.write(": keepalive\n\n").catch(() => { open = false; });
    }
    unsubscribe();
  }),
);

export default app;
