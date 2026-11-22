// Thread B owns this folder. Frozen export: analyzeCreator (see CONTRACT.md).
import { Hono } from "hono";
import { db, id, now, parseRow, parseRows } from "../lib/db";
import { logEvent } from "../lib/events";
import { wakeLily } from "../lily";
import { AnalysisError, analyzeCreator, cleanHandle, saveReel, upsertCreator } from "./analyze";
import { readProduct } from "./product";
import { normReel, reelList, tregCall, type Reel } from "./treg";

export { analyzeCreator };

const app = new Hono();
const body = async (c: any) => { try { return await c.req.json(); } catch { return {}; } };
const fail = (c: any, e: unknown, status = 502) => c.json({ error: (e as Error).message }, status);

app.post("/product/read", async (c) => {
  const { url, campaign_id } = await body(c);
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) return c.json({ error: "url is required" }, 400);
  try { return c.json(await readProduct(url, campaign_id ?? null)); } catch (e) { return fail(c, e); }
});

app.post("/find/reels", async (c) => {
  const { campaign_id, keyword, limit = 20 } = await body(c);
  if (!campaign_id || !keyword) return c.json({ error: "campaign_id and keyword are required" }, 400);
  if (!db.query("SELECT 1 FROM campaigns WHERE id = ?").get(campaign_id)) return c.json({ error: "campaign not found" }, 404);
  let reels: Reel[];
  try {
    reels = reelList(await tregCall("treg.instagram.search.reels", { q: keyword }))
      .map(normReel).filter((r): r is Reel => !!r?.username)
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, Number(limit) || 20);
  } catch (e) { return fail(c, e); }

  const creators = new Map<string, any>();
  for (const r of reels) {
    const handle = cleanHandle(r.username!);
    const creator = creators.get(handle) ?? upsertCreator(handle, { ig_user_id: r.user_id, name: r.display_name, avatar_url: r.avatar_url });
    creators.set(handle, creator);
    saveReel(campaign_id, creator.id, keyword, r);
  }
  logEvent({
    campaign_id, actor: "lily", type: "reels.found",
    summary: `Found ${reels.length} reels for "${keyword}" from ${creators.size} creators`,
    data: { keyword, reels: reels.length, creators: creators.size },
  });
  const rows = reels.length
    ? parseRows(db.query(`SELECT * FROM found_reels WHERE campaign_id = ? AND shortcode IN (${reels.map(() => "?").join(",")}) ORDER BY views DESC`)
      .all(campaign_id, ...reels.map((r) => r.shortcode)))
    : [];
  return c.json({ reels: rows, creators: [...creators.values()] });
});

app.post("/creators/analyze", async (c) => {
  const { handle, campaign_id } = await body(c);
  if (!handle) return c.json({ error: "handle is required" }, 400);
  try { return c.json(await analyzeCreator(handle, campaign_id ?? null)); }
  catch (e) {
    if (e instanceof AnalysisError) return c.json({ error: `Analysis failed: ${e.message}`, kind: e.kind }, 422);
    return fail(c, e);
  }
});

app.get("/creators/past", (c) => {
  const campaignId = c.req.query("campaign_id") ?? null;
  const creators = parseRows(db.query(
    `SELECT DISTINCT cr.* FROM creators cr
     LEFT JOIN deals d ON d.creator_id = cr.id AND d.campaign_id IS NOT ?
     WHERE d.id IS NOT NULL OR cr.lily_note IS NOT NULL`,
  ).all(campaignId));
  const out = creators.map((creator) => {
    const past = db.query(
      `SELECT d.campaign_id, c.goal AS campaign_goal, d.stage, d.agreed_fee_usd FROM deals d
       JOIN campaigns c ON c.id = d.campaign_id WHERE d.creator_id = ? AND d.campaign_id IS NOT ? ORDER BY d.updated_at DESC`,
    ).all(creator.id, campaignId) as any[];
    const analysis = campaignId
      ? parseRow(db.query("SELECT * FROM analyses WHERE creator_id = ? AND campaign_id = ? ORDER BY created_at DESC LIMIT 1").get(creator.id, campaignId)) ?? null
      : null;
    return { creator, past, analysis };
  });
  const done = (x: any) => (x.past.some((p: any) => p.stage === "completed") ? 0 : 1);
  out.sort((a, b) => done(a) - done(b));
  return c.json(out);
});

app.post("/creators", async (c) => {
  const { ig_handle, email, campaign_id, wake = true } = await body(c);
  if (!ig_handle) return c.json({ error: "ig_handle is required" }, 400);
  const handle = cleanHandle(ig_handle);
  if (campaign_id && !db.query("SELECT 1 FROM campaigns WHERE id = ?").get(campaign_id)) return c.json({ error: "campaign not found" }, 404);

  // No treg call here: the response stays instant. The background analysis fills avatar, followers and bio.
  let creator = upsertCreator(handle, { email: email ?? null });
  if (email && creator.email !== email) {
    db.query("UPDATE creators SET email = ? WHERE id = ?").run(email, creator.id);
    creator = { ...creator, email };
  }
  if (!campaign_id) {
    analyzeCreator(handle, null).catch(() => {});
    return c.json({ creator, deal: null });
  }

  const existing = db.query("SELECT * FROM deals WHERE campaign_id = ? AND creator_id = ?").get(campaign_id, creator.id);
  if (existing) return c.json({ creator, deal: parseRow(existing) });

  const dealId = id("deal");
  db.query(
    `INSERT INTO deals (id, campaign_id, creator_id, source, stage, channel, latest_action, created_at, updated_at)
     VALUES (?, ?, ?, 'manual', 'shortlisted', 'instagram', ?, ?, ?)`,
  ).run(dealId, campaign_id, creator.id, "Added by you. Lily is reaching out", now(), now());
  logEvent({ campaign_id, deal_id: dealId, actor: "admin", type: "creator.added_manually", summary: `Added @${handle} to the campaign`, data: { creator_id: creator.id } });

  analyzeCreator(handle, campaign_id).catch(() => { /* recorded inside analyzeCreator */ });
  if (wake !== false) {
    wakeLily("admin-decision", { deal_id: dealId, reason: "manual_add" })
      .catch((e) => console.error("[find] wakeLily failed", (e as Error).message));
  }
  return c.json({ creator, deal: parseRow(db.query("SELECT * FROM deals WHERE id = ?").get(dealId)) });
});

export default app;
