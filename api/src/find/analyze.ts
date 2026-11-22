import { db, id, now, parseRow } from "../lib/db";
import { logEvent } from "../lib/events";
import { json, Type } from "../lib/gemini";
import { normProfile, normReel, reelList, tregCall, type Profile, type Reel } from "./treg";

export const cleanHandle = (h: string) =>
  h.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").split(/[/?#]/)[0].toLowerCase();

/** Insert or update a creator by handle. Never blanks a field that is already set. */
export function upsertCreator(handle: string, f: {
  ig_user_id?: string | null; name?: string | null; avatar_url?: string | null; bio?: string | null;
  email?: string | null; followers?: number | null; niche?: string | null; profile_json?: string | null;
} = {}) {
  db.query(
    `INSERT INTO creators (id, ig_handle, ig_user_id, name, avatar_url, bio, email, followers, niche, profile_json, updated_at)
     VALUES ($id, $h, $uid, $name, $avatar, $bio, $email, $followers, $niche, $pj, $ts)
     ON CONFLICT(ig_handle) DO UPDATE SET
       ig_user_id = COALESCE(excluded.ig_user_id, ig_user_id), name = COALESCE(excluded.name, name),
       avatar_url = COALESCE(excluded.avatar_url, avatar_url), bio = COALESCE(excluded.bio, bio),
       email = COALESCE(email, excluded.email), followers = COALESCE(excluded.followers, followers),
       niche = COALESCE(excluded.niche, niche), profile_json = COALESCE(excluded.profile_json, profile_json),
       updated_at = excluded.updated_at`,
  ).run({
    id: id("crt"), h: handle, uid: f.ig_user_id ?? null, name: f.name ?? null, avatar: f.avatar_url ?? null,
    bio: f.bio ?? null, email: f.email ?? null, followers: f.followers ?? null, niche: f.niche ?? null,
    pj: f.profile_json ?? null, ts: now(),
  });
  return parseRow(db.query("SELECT * FROM creators WHERE ig_handle = ?").get(handle));
}

export function saveReel(campaignId: string | null, creatorId: string, keyword: string | null, r: Reel) {
  const exists = campaignId
    ? db.query("SELECT 1 FROM found_reels WHERE campaign_id = ? AND shortcode = ?").get(campaignId, r.shortcode)
    : db.query("SELECT 1 FROM found_reels WHERE campaign_id IS NULL AND shortcode = ?").get(r.shortcode);
  if (exists) return;
  db.query(
    `INSERT INTO found_reels (id, campaign_id, creator_id, keyword, shortcode, url, caption, thumbnail_url, views, likes, comments, posted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(id("rel"), campaignId, creatorId, keyword, r.shortcode, r.url, r.caption, r.thumbnail_url, r.views, r.likes, r.comments, r.posted_at);
}

// ---------- metrics (PLAN §3, all in code) ----------
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const tierOf = (f: number) => (f < 10e3 ? "nano" : f < 100e3 ? "micro" : f < 500e3 ? "mid" : f < 1e6 ? "macro" : "mega");
const AD_TAG = /#(ad|ads|sponsored|partner|paidpartnership|collab)\b|paid partnership/i;

export function computeMetrics(profile: Profile, reels: Reel[]) {
  const followers = profile.followers ?? 0;
  const views = reels.map((r) => r.views).filter((v): v is number => v != null);
  const medianViews = median(views);
  const meanViews = views.length ? views.reduce((a, b) => a + b, 0) / views.length : 0;
  const eng = reels.filter((r) => r.views).map((r) => ((r.likes ?? 0) + (r.comments ?? 0)) / r.views!);
  const monthAgo = Date.now() - 30 * 864e5;
  return {
    followers,
    tier: tierOf(followers),
    reels_checked: reels.length,
    reels_30d: reels.filter((r) => r.posted_at && r.posted_at >= monthAgo).length,
    median_views: Math.round(medianViews),
    views_per_follower: followers ? +(medianViews / followers).toFixed(2) : 0,
    engagement: +median(eng).toFixed(4),
    consistency: meanViews ? +(medianViews / meanViews).toFixed(2) : 0,
    brand_deals: reels.some((r) => r.paid_partnership || (r.caption && AD_TAG.test(r.caption))),
  };
}
export type Metrics = ReturnType<typeof computeMetrics>;

type Judgment = {
  category: string; format: string; face_on_camera: boolean;
  content_fit: "strong" | "some" | "none"; can_deliver_checklist: boolean;
  brand_safe: boolean; safety_note: string; reasons: string[];
  country: string | null; city: string | null; language: string | null;
  market_match: "match" | "mismatch" | "unclear"; market_reason: string;
};

const judgmentSchema = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING },
    format: { type: Type.STRING },
    face_on_camera: { type: Type.BOOLEAN },
    content_fit: { type: Type.STRING, enum: ["strong", "some", "none"] },
    can_deliver_checklist: { type: Type.BOOLEAN },
    brand_safe: { type: Type.BOOLEAN },
    safety_note: { type: Type.STRING },
    reasons: { type: Type.ARRAY, items: { type: Type.STRING } },
    country: { type: Type.STRING, nullable: true },
    city: { type: Type.STRING, nullable: true },
    language: { type: Type.STRING, nullable: true },
    market_match: { type: Type.STRING, enum: ["match", "mismatch", "unclear"] },
    market_reason: { type: Type.STRING },
  },
  required: ["category", "format", "face_on_camera", "content_fit", "can_deliver_checklist", "brand_safe", "safety_note", "reasons", "country", "city", "language", "market_match", "market_reason"],
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function decideFit(m: Metrics, j: Judgment) {
  if (!j.brand_safe) return { fit: "excluded" as const, score: 0 };
  const score = Math.round(
    35 * ({ strong: 1, some: 0.5, none: 0 }[j.content_fit] ?? 0) +
    20 * clamp(m.views_per_follower) +
    15 * clamp(m.engagement / 0.05) +
    10 * clamp(m.consistency) +
    10 * clamp(m.reels_30d / 8) +
    5 * (j.can_deliver_checklist ? 1 : 0) +
    5 * (m.brand_deals ? 1 : 0),
  );
  return { fit: score >= 70 ? ("great" as const) : score >= 45 ? ("good" as const) : ("weak" as const), score };
}

const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
function numberReason(m: Metrics) {
  if (!m.reels_checked) return null;
  if (m.views_per_follower >= 1) return `Reels get about ${short(m.median_views)} views, more than their ${short(m.followers)} followers`;
  if (m.reels_30d >= 6) return `Posts often: ${m.reels_30d} reels in the last 30 days`;
  if (m.consistency < 0.3) return `Views are uneven: one or two hits carry the average`;
  return `Reels usually get about ${short(m.median_views)} views`;
}

/** The checklist we check videos against: the brief's (admin-editable) or else the chosen idea's. */
function campaignContext(campaignId: string | null) {
  if (!campaignId) return null;
  const c = parseRow(db.query("SELECT * FROM campaigns WHERE id = ?").get(campaignId));
  if (!c) throw new Error(`Campaign ${campaignId} not found`);
  const idea = c.chosen_idea_id ? parseRow(db.query("SELECT * FROM ideas WHERE id = ?").get(c.chosen_idea_id)) : null;
  return {
    goal: c.goal, product: c.product,
    idea: idea && { title: idea.title, angle: idea.angle, video: idea.video_description, creator_profile: idea.creator_profile },
    checklist: (c.brief?.video_rules as string[] | undefined) ?? (idea?.video_rules as string[] | undefined) ?? [],
  };
}

export function brandMarket(): { country: string | null; language: string | null } {
  const row = db.query("SELECT value_json FROM settings WHERE key = 'brand'").get() as { value_json: string } | null;
  const b = row ? JSON.parse(row.value_json) : {};
  return { country: b?.country || null, language: b?.language || null };
}

async function thumbs(reels: Reel[]) {
  const got = await Promise.all(reels.slice(0, 10).map(async (r) => {
    if (!r.thumbnail_url) return null;
    try {
      const res = await fetch(r.thumbnail_url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      return { data: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType: res.headers.get("content-type")?.split(";")[0] || "image/jpeg" };
    } catch { return null; }
  }));
  return got.filter((x): x is { data: string; mimeType: string } => !!x);
}

export class AnalysisError extends Error {
  constructor(public kind: "private" | "not_found" | "treg_error", message: string) { super(message); }
}

function storeAnalysis(creatorId: string, campaignId: string | null, fit: string, score: number, reasons: string[], metrics: unknown) {
  if (campaignId) db.query("DELETE FROM analyses WHERE creator_id = ? AND campaign_id = ?").run(creatorId, campaignId);
  else db.query("DELETE FROM analyses WHERE creator_id = ? AND campaign_id IS NULL").run(creatorId);
  const aid = id("ana");
  db.query(
    `INSERT INTO analyses (id, creator_id, campaign_id, fit, score_internal, reasons_json, metrics_json, created_at) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(aid, creatorId, campaignId, fit, score, JSON.stringify(reasons), JSON.stringify(metrics), now());
  return parseRow(db.query("SELECT * FROM analyses WHERE id = ?").get(aid));
}

/** Record a failed analysis so the admin sees why (Amendments v4 #3: fit 'excluded', first reason "Analysis failed: …"). */
function recordFailure(handle: string, campaignId: string | null, err: AnalysisError) {
  const creator = upsertCreator(handle);
  logEvent({ campaign_id: campaignId, actor: "lily", type: "creator.analyzed", summary: `Couldn't analyze @${handle}: ${err.message}`, data: { creator_id: creator.id, error: err.kind } });
  storeAnalysis(creator.id, campaignId, "excluded", 0, [`Analysis failed: ${err.message}`], { error: err.kind });
}

export async function analyzeCreator(handleIn: string, campaignId: string | null): Promise<any> {
  const handle = cleanHandle(handleIn);
  try {
    return await runAnalysis(handle, campaignId);
  } catch (e) {
    const err = e instanceof AnalysisError ? e : new AnalysisError("treg_error", `couldn't read @${handle} on Instagram`);
    if (!(e instanceof AnalysisError)) console.error("[find] analyze failed", handle, (e as Error).message);
    recordFailure(handle, campaignId, err);
    throw err;
  }
}

async function runAnalysis(handle: string, campaignId: string | null) {
  const ctx = campaignContext(campaignId);
  const market = brandMarket();
  const known = db.query("SELECT ig_user_id FROM creators WHERE ig_handle = ?").get(handle) as { ig_user_id: string | null } | null;

  const [profOut, reelsOut] = await Promise.allSettled([
    tregCall("treg.instagram.user.profile", { username: handle }),
    known?.ig_user_id ? tregCall("treg.instagram.user.reels", { username: handle, user_id: known.ig_user_id, limit: 10 }) : Promise.resolve(null),
  ]);
  const profile = profOut.status === "fulfilled" ? normProfile(profOut.value) : null;
  if (!profile) throw new AnalysisError("not_found", `couldn't find @${handle} on Instagram`);
  if (profile.is_private) throw new AnalysisError("private", "the account is private");

  let rawReels = reelsOut.status === "fulfilled" && reelsOut.value ? reelList(reelsOut.value) : null;
  if (!rawReels?.length) {
    rawReels = reelList(await tregCall("treg.instagram.user.reels", { username: handle, user_id: profile.user_id, limit: 10 }).catch(() => []));
  }
  const reels = rawReels.map(normReel).filter((r): r is Reel => !!r)
    .sort((a, b) => (b.posted_at ?? 0) - (a.posted_at ?? 0)).slice(0, 10);

  const metrics = computeMetrics(profile, reels);
  const images = await thumbs(reels);
  const captions = reels.map((r, i) => `${i + 1}. ${r.caption?.slice(0, 300) ?? "(no caption)"} [${r.views ?? "?"} views]`).join("\n");

  const j = await json<Judgment>({
    schema: judgmentSchema as any,
    inline: images,
    prompt: `You're helping a brand pick Instagram creators for a paid creator video. Judge @${handle} from their profile, the thumbnails of their recent reels (attached) and the captions.

Profile: ${profile.name ?? ""}. Bio: ${profile.bio ?? "(none)"}. Followers: ${metrics.followers}.
Recent reels:
${captions || "(none found)"}

${ctx ? `Campaign goal: ${ctx.goal}
Product: ${JSON.stringify(ctx.product ?? {})}
${ctx.idea ? `Chosen idea: ${JSON.stringify(ctx.idea)}` : ""}
Video checklist the creator's video must pass:
${ctx.checklist.length ? ctx.checklist.map((r) => `- ${r}`).join("\n") : "- (none yet)"}` : "No campaign yet: judge them as a creator for brand videos in general."}

Brand's target market: country ${market.country ?? "(not set)"}, language ${market.language ?? "(not set)"}.

Return:
- country, city, language: where the creator is based and the language they mostly post in, guessed from bio, captions and on-screen text in the thumbnails; null if you can't tell.
- market_match: "match" if they clearly reach the brand's target market, "mismatch" if they clearly don't (based in another country, or a language the audience doesn't speak; a language common in the target country, like Hindi or Hinglish for India, is fine), "unclear" otherwise or if the market isn't set.
- market_reason: one short plain line about where and in what language they post, e.g. "Posts in English from Bengaluru" or "Posts in Spanish from Mexico".
- category: their content niche in 1-3 words. format: their usual video format in a few words.
- face_on_camera: do they appear and talk on camera.
- content_fit: how well their content suits this campaign (strong / some / none).
- can_deliver_checklist: could they make a video that passes every checklist item, judging by how they film (on camera, speaking to camera, showing things clearly, upbeat recommendations).
- brand_safe: false only for clearly unsafe content (hate, explicit, violence, scams). safety_note: one short line.
- reasons: 2-3 short reasons in plain words a marketing manager would say, e.g. "Talks to camera and has shared event recaps before". No scores, no jargon.`,
  });

  const decided = decideFit(metrics, j);
  const mismatch = j.market_match === "mismatch" && (market.country || market.language);
  const fit = mismatch && decided.fit !== "excluded" ? ("weak" as const) : decided.fit;
  const score = mismatch ? Math.min(decided.score, 44) : decided.score;
  const nr = numberReason(metrics);
  const marketLine = j.market_reason?.trim()
    ? (mismatch ? `Outside your market: ${j.market_reason.trim()}` : j.market_reason.trim())
    : null;
  const reasons = [...(marketLine && (mismatch || j.market_match === "match") ? [marketLine] : []),
    ...(j.reasons ?? []).slice(0, 2), ...(nr ? [nr] : [])].slice(0, 4);
  if (fit === "excluded") reasons.unshift(`Not brand safe: ${j.safety_note}`);

  const creator = upsertCreator(handle, {
    ig_user_id: profile.user_id, name: profile.name, avatar_url: profile.avatar_url ?? reels[0]?.avatar_url ?? null,
    bio: profile.bio, email: profile.public_email, followers: profile.followers, niche: j.category,
    profile_json: JSON.stringify({ ...profile, format: j.format, face_on_camera: j.face_on_camera }),
  });
  for (const r of reels) saveReel(campaignId, creator.id, null, r);

  const analysis = storeAnalysis(creator.id, campaignId, fit, score, reasons.slice(0, 4), {
    ...metrics, content_fit: j.content_fit, can_deliver_checklist: j.can_deliver_checklist,
    face_on_camera: j.face_on_camera, format: j.format, safety_note: j.safety_note,
    country: j.country, city: j.city, language: j.language, market_match: j.market_match,
  });
  logEvent({
    campaign_id: campaignId, actor: "lily", type: "creator.analyzed",
    summary: `Looked at @${handle}: ${fit} fit. ${reasons[0] ?? ""}`.trim(),
    data: { creator_id: creator.id, analysis_id: analysis.id, fit },
  });
  return { ...analysis, creator: parseRow(db.query("SELECT * FROM creators WHERE id = ?").get(creator.id)) };
}
