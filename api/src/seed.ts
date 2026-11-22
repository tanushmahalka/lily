// Orchestrator owns this file.
// `bun run seed`          wipes data/creat0r.db and fills demo data (one campaign, a creator in every stage).
// `bun run seed -- --clean` empties every table in place (safe while the API runs) and keeps only
//                          the outreach accounts, default autonomy and an empty brand: the clean demo start.
import { rmSync } from "node:fs";
import { join } from "node:path";

const CLEAN = process.argv.includes("--clean");
const DATA_DIR = join(import.meta.dir, "../../data");
if (!CLEAN) for (const f of ["creat0r.db", "creat0r.db-wal", "creat0r.db-shm"]) rmSync(join(DATA_DIR, f), { force: true });
const { db, id } = await import("./lib/db");
db.exec("PRAGMA foreign_keys = OFF"); // seed inserts ideas before their campaign

if (CLEAN) {
  const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  db.transaction(() => {
    for (const { name } of tables) db.exec(`DELETE FROM ${name}`);
    const put = (sql: string, params: any) => db.query(sql).run(params);
    put("INSERT INTO settings (key, value_json) VALUES ($k, $v)", { k: "brand", v: JSON.stringify({ name: "", logo_url: "", about: "", tone: "", website: "", country: "", language: "" }) });
    put("INSERT INTO settings (key, value_json) VALUES ($k, $v)", { k: "default_autonomy", v: JSON.stringify("human_first") });
    put("INSERT INTO accounts (id, channel, handle, speaks_as, live) VALUES ($i, 'instagram', 'ta__nush', 'Tanush', 1)", { i: id("acc") });
    put("INSERT INTO accounts (id, channel, handle, speaks_as, live) VALUES ($i, 'email', 'lily@email.makelocalads.com', 'Lily, partnerships at {brand}', 1)", { i: id("acc") });
  })();
  db.exec("PRAGMA foreign_keys = ON");
  console.log(`clean: emptied ${tables.length} tables, kept accounts + default autonomy`);
  process.exit(0);
}

const H = 3600_000;
const t0 = Date.now() - 30 * H;
const at = (h: number) => t0 + h * H;
const J = JSON.stringify;
const ins = (table: string, row: Record<string, unknown>) => {
  const cols = Object.keys(row);
  db.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map((c) => "$" + c).join(",")})`).run(row as any);
  return row;
};

// Settings + accounts
ins("settings", { key: "brand", value_json: J({ name: "Dewdrop", logo_url: "https://placehold.co/96x96/f4e3d7/7a4b2a?text=D", about: "Clean, fragrance-free skincare for sensitive skin.", tone: "Warm, simple, a little playful", website: "https://dewdrop.example" }) });
ins("settings", { key: "default_autonomy", value_json: J("human_first") });
ins("accounts", { id: id("acc"), channel: "instagram", handle: "ta__nush", speaks_as: "Tanush", live: 1 });
ins("accounts", { id: id("acc"), channel: "email", handle: "lily@email.makelocalads.com", speaks_as: "Lily, partnerships at {brand}", live: 1 });

// Campaign
const cmp = id("cmp");
const thread = id("thr");
const idea = (pos: number, title: string, angle: string, chosen = 0) => ins("ideas", {
  id: id("idea"), campaign_id: cmp, position: pos, title, angle,
  video_description: "Creator films a 20-30s morning routine, the serum in hand, showing texture on skin up close.",
  creator_profile: "Skincare and get-ready-with-me creators, 5k-80k followers, face on camera.",
  keywords_json: J(["sensitive skin routine", "skincare grwm", "fragrance free skincare"]),
  video_rules_json: J(["Product clearly visible in the first 3 seconds", "Show the texture on skin", "No medical claims", "Vertical 9:16, 20-40 seconds"]),
  creators_target: 6, fee_hint_usd: 200, chosen,
});
const chosen = idea(1, "Real skin, real mornings", "Unfiltered morning routines where the serum is the calm step.", 1);
idea(2, "The 7-day skin diary", "Creators post a short day-1 vs day-7 diary.");
idea(3, "Sensitive skin myths", "Creators bust one myth each, serum as the gentle answer.");
ins("chat_threads", { id: thread, title: "Dewdrop serum launch", campaign_id: cmp, created_at: at(0) });
ins("campaigns", {
  id: cmp, status: "active", autonomy: "human_first", budget_usd: 1500, product_url: "https://dewdrop.example/products/calm-serum",
  product_json: J({ title: "Calm Barrier Serum", description: "Fragrance-free ceramide serum for sensitive skin.", price: "$28", images: ["https://placehold.co/600x600/f4e3d7/7a4b2a?text=Serum"], category: "Skincare" }),
  goal: "UGC videos we can run as Meta ads", chosen_idea_id: chosen.id,
  brief_json: J({ title: chosen.title, angle: chosen.angle, video_description: chosen.video_description, creator_profile: chosen.creator_profile, keywords: JSON.parse(chosen.keywords_json as string), video_rules: JSON.parse(chosen.video_rules_json as string), creators_target: 6 }),
  guardrails_json: J({ fee_usd: { min: 80, max: 300 }, revision_rounds: { min: 1, max: 2 }, usage_rights_days: { min: 30, max: 90 }, upfront_pct: { max: 50 }, delivery_days: { min: 3, max: 14 } }),
  chat_thread_id: thread, created_at: at(0),
});

// Creators, one per stage
const people: [string, string, string, number, string][] = [
  ["mia.makes", "Mia Torres", "Skincare GRWM", 24000, "shortlisted"],
  ["glowwithpriya", "Priya Shah", "Sensitive skin tips", 41000, "reached_out"],
  ["noah.skin", "Noah Kim", "Men's skincare", 12000, "talking"],
  ["the.dewy.diaries", "Ava Brooks", "Morning routines", 67000, "negotiating"],
  ["sofi.selfcare", "Sofia Ruiz", "Self-care vlogs", 18000, "deal_ready"],
  ["kai.routines", "Kai Patel", "Minimal routines", 9000, "awaiting_video"],
  ["lena.looks", "Lena Fischer", "Makeup + skincare", 33000, "video_feedback"],
  ["jules.glow", "Jules Martin", "Skincare reviews", 52000, "video_ready"],
  ["ruby.rituals", "Ruby Chen", "Evening rituals", 28000, "completed"],
  ["max.minimal", "Max Olsen", "Minimal living", 15000, "declined"],
];
const deals: Record<string, string> = {};
people.forEach(([handle, name, niche, followers, stage], i) => {
  const cr = id("cr");
  ins("creators", { id: cr, ig_handle: handle, name, avatar_url: `https://i.pravatar.cc/150?u=${handle}`, bio: `${niche} · DM for collabs`, email: `${handle.replace(/\./g, "")}@example.com`, followers, niche, lily_note: stage === "completed" ? "Fast, showed the product well. Would book again." : null, profile_json: null, updated_at: at(1) });
  ins("analyses", { id: id("an"), creator_id: cr, campaign_id: cmp, fit: i % 3 === 2 ? "good" : "great", score_internal: 90 - i * 3, reasons_json: J(["Films her routine every morning, face on camera", "Shows products up close in most reels", "Posts about 4 times a week"]), metrics_json: J({ median_views: 8000 + i * 1500, engagement_pct: 6.1 - i * 0.2, reels_last_30d: 14 - i }), created_at: at(2) });
  for (let r = 0; r < 3; r++) ins("found_reels", { id: id("reel"), campaign_id: cmp, creator_id: cr, keyword: "skincare grwm", shortcode: `${handle}_${r}`, url: `https://www.instagram.com/reel/${handle}_${r}/`, caption: "my calm morning routine", thumbnail_url: `https://picsum.photos/seed/${handle}${r}/360/640`, views: 9000 + r * 2100, likes: 640 + r * 50, comments: 22 + r, posted_at: at(-48 * (r + 1)) });
  const dl = id("deal");
  deals[stage] = dl;
  const latest: Record<string, string> = {
    shortlisted: "Picked for her calm morning routines",
    reached_out: "Sent a first DM, waiting for a reply",
    talking: "He asked what the videos are for; I explained",
    negotiating: "Countered at $220, waiting for her reply",
    deal_ready: "Agreed $180 for one video. Needs your OK",
    awaiting_video: "Deal approved. Video due Friday",
    video_feedback: "Asked her to show the bottle in the first 3 seconds",
    video_ready: "Video looks great. Needs your OK",
    completed: "Done. Video approved",
    declined: "Said he isn't taking brand deals this month",
  };
  const fee = { deal_ready: 180, awaiting_video: 200, video_feedback: 190, video_ready: 210, completed: 200 }[stage as string] ?? null;
  ins("deals", { id: dl, campaign_id: cmp, creator_id: cr, source: "lily", stage, channel: i === 3 ? "email" : "instagram", agreed_fee_usd: fee, ig_thread_id: null, email_thread_id: null, latest_action: latest[stage], created_at: at(3), updated_at: at(4 + i) });
  if (stage !== "shortlisted") {
    ins("messages", { id: id("msg"), deal_id: dl, creator_id: cr, channel: i === 3 ? "email" : "instagram", direction: "out", body: `Hey ${name.split(" ")[0]}! Loved your morning routine reels. We're launching a fragrance-free serum and would love a short video from you. Open to it?`, external_id: null, attachments_json: "[]", suppressed: 0, created_at: at(5) });
  }
  if (!["shortlisted", "reached_out"].includes(stage)) {
    ins("messages", { id: id("msg"), deal_id: dl, creator_id: cr, channel: i === 3 ? "email" : "instagram", direction: "in", body: stage === "declined" ? "Thanks, but I'm not taking brand deals this month." : "Hi! Sounds fun. What's the budget and what do you need?", external_id: null, attachments_json: "[]", suppressed: 0, created_at: at(7) });
  }
  if (fee || stage === "negotiating") {
    const terms = { fee_usd: fee ?? 220, deliverables: "1 vertical video, 20-40s", revision_rounds: 2, usage_rights_days: 60, delivery_days: 7, upfront_pct: 50 };
    ins("offers", { id: id("off"), deal_id: dl, version: 1, by: "creator", terms_json: J({ ...terms, fee_usd: 350 }), within_guardrails: 0, violations_json: J(["Fee $350 is above the $300 limit"]), status: "superseded", created_at: at(8) });
    const off = ins("offers", { id: id("off"), deal_id: dl, version: 2, by: "lily", terms_json: J(terms), within_guardrails: 1, violations_json: "[]", status: stage === "negotiating" ? "open" : "accepted", created_at: at(9) });
    if (stage === "deal_ready") ins("approvals", { id: id("apv"), campaign_id: cmp, deal_id: dl, kind: "deal", ref_id: off.id, status: "pending", decided_by: null, admin_note: null, created_at: at(10), decided_at: null });
  }
  if (["video_feedback", "video_ready", "completed"].includes(stage)) {
    const sub = ins("submissions", { id: id("sub"), deal_id: dl, round: 1, source_url: "https://example.com/video.mp4", local_path: null, review_json: J({ verdict: stage === "video_feedback" ? "changes" : "approve", checks: [{ rule: "Product clearly visible in the first 3 seconds", passed: stage !== "video_feedback", note: stage === "video_feedback" ? "Bottle first appears at 0:06" : "Bottle in hand from 0:01" }, { rule: "Show the texture on skin", passed: true, note: "Close-up at 0:12" }, { rule: "No medical claims", passed: true, note: "" }], feedback_to_creator: "Love the light in this! One small thing: could the bottle be in shot in the first 3 seconds?", notes_for_admin: "Strong video; one fix requested." }), status: stage === "video_feedback" ? "changes" : stage === "video_ready" ? "lily_ok" : "admin_ok", created_at: at(20) });
    if (stage === "video_ready") ins("approvals", { id: id("apv"), campaign_id: cmp, deal_id: dl, kind: "video", ref_id: sub.id, status: "pending", decided_by: null, admin_note: null, created_at: at(21), decided_at: null });
  }
  if (stage === "completed") {
    const p = ins("payouts", { id: id("pay"), deal_id: dl, amount_usd: 200, status: "pending", created_at: at(24), paid_at: null });
    ins("approvals", { id: id("apv"), campaign_id: cmp, deal_id: dl, kind: "payment", ref_id: p.id, status: "pending", decided_by: null, admin_note: null, created_at: at(24), decided_at: null });
    [1200, 4300, 8800, 12100, 14900].forEach((v, k) => ins("perf_snapshots", { id: id("perf"), deal_id: dl, post_url: "https://www.instagram.com/reel/ruby_dewdrop/", views: v, likes: Math.round(v * 0.07), comments: Math.round(v * 0.004), taken_at: at(24 + k * 6) }));
  }
});

// Chat + events
const chat = (role: string, kind: string, body: string, h: number, ref?: unknown) => ins("chat_messages", { id: id("cm"), thread_id: thread, role, kind, body, ref_json: ref ? J(ref) : null, created_at: at(h) });
chat("admin", "text", "Budget $1500, product https://dewdrop.example/products/calm-serum, goal: UGC videos we can run as Meta ads", 0);
chat("lily", "ideas", "I read your product page and looked at what's working for sensitive-skin creators. Here are three ways to run this:", 0.1, { campaign_id: cmp });
chat("admin", "text", "Go with Real skin, real mornings", 0.2);
chat("lily", "update", "On it. I'll shortlist creators and show you the list before I reach out to anyone.", 0.21);
const ev = (h: number, actor: string, type: string, summary: string, deal?: string) => ins("events", { id: id("evt"), ts: at(h), campaign_id: cmp, deal_id: deal ?? null, actor, type, summary, data_json: null });
ev(0, "admin", "campaign.created", "Campaign created");
ev(0.1, "lily", "ideas.proposed", "Proposed 3 campaign ideas");
ev(0.2, "admin", "idea.chosen", "Chose \"Real skin, real mornings\"");
ev(2, "lily", "reels.found", "Found 48 reels for \"skincare grwm\"");
ev(5, "lily", "message.sent", "Messaged @glowwithpriya on Instagram", deals.reached_out);
ev(9, "lily", "offer.made", "Countered @the.dewy.diaries at $220", deals.negotiating);
ev(10, "lily", "approval.requested", "Deal with @sofi.selfcare is ready for your OK", deals.deal_ready);
ev(21, "lily", "approval.requested", "Video from @jules.glow is ready for your OK", deals.video_ready);

db.exec("PRAGMA foreign_keys = ON");
console.log(`seeded campaign ${cmp} (thread ${thread}) with ${people.length} creators`);
