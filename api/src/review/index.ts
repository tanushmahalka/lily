// Thread D: video intake + Gemini review + lily-approve. Frozen export: reviewVideo (see CONTRACT.md).
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { createApproval, setStage } from "../core";
import { db, id, now, parseRow, VIDEOS_DIR } from "../lib/db";
import { logEvent } from "../lib/events";
import { download, FetchError, firstUrl, toPlayableMp4 } from "./fetch";
import { judgeVideo, type Review } from "./judge";

const fail = (status: 400 | 404 | 409, error: string) => new HTTPException(status, { res: Response.json({ error }, { status }) });
const get = (sql: string, ...p: any[]) => parseRow<any>(db.query(sql).get(...p)) ?? null;
const submission = (sid: string) => {
  const s = get("SELECT * FROM submissions WHERE id = ?", sid);
  return s && { ...s, video_url: s.local_path ? `/api/videos/${basename(s.local_path)}` : null };
};

const SEND_ANOTHER_WAY = "Could you send it as a Google Drive link, a Dropbox link, or post it and share the reel? I couldn't open this one.";

/** Pick the video: local_path, else the message's video attachment or link, else source_url. */
function pickSource(input: { source_url?: string; local_path?: string; message_id?: string }) {
  if (input.local_path) return { local: input.local_path, url: null as string | null };
  if (input.message_id) {
    const m = get("SELECT * FROM messages WHERE id = ?", input.message_id);
    if (!m) throw fail(404, "message not found");
    const att = (m.attachments ?? []).find((a: any) => String(a.mime ?? "").startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(a.filename ?? ""));
    if (att?.local_path) return { local: att.local_path as string, url: null };
    const url = firstUrl(m.body) ?? input.source_url ?? null;
    if (url) return { local: null, url };
    throw fail(400, "that message has no video attachment or link");
  }
  if (input.source_url) return { local: null, url: input.source_url };
  throw fail(400, "send source_url, local_path or message_id");
}

export async function reviewVideo(dealId: string, input: { source_url?: string; local_path?: string; message_id?: string }): Promise<any> {
  const deal = get("SELECT * FROM deals WHERE id = ?", dealId);
  if (!deal) throw fail(404, "deal not found");
  const campaign = get("SELECT * FROM campaigns WHERE id = ?", deal.campaign_id);
  const creator = get("SELECT * FROM creators WHERE id = ?", deal.creator_id);
  const brand = get("SELECT * FROM settings WHERE key = 'brand'")?.value?.name ?? "the brand";
  const who = creator?.ig_handle ? `@${creator.ig_handle}` : "the creator";
  const src = pickSource(input);

  const round = ((db.query("SELECT MAX(round) AS r FROM submissions WHERE deal_id = ?").get(dealId) as any)?.r ?? 0) + 1;
  const sid = id("sub");
  const dest = join(VIDEOS_DIR, `${sid}.mp4`);
  db.query("INSERT INTO submissions (id, deal_id, round, source_url, local_path, review_json, status, created_at) VALUES (?, ?, ?, ?, NULL, NULL, 'reviewing', ?)")
    .run(sid, dealId, round, src.url, now());
  logEvent({ campaign_id: deal.campaign_id, deal_id: dealId, actor: "creator", type: "video.received", summary: `Got round ${round} of the video from ${who}`, data: { submission_id: sid } });

  let review: Review;
  try {
    if (src.url) await download(src.url, dest);
    else if (!existsSync(src.local!)) throw new FetchError("the attachment file is missing");
    await toPlayableMp4(src.url ? dest : src.local!, dest);
    db.query("UPDATE submissions SET local_path = ? WHERE id = ?").run(dest, sid);
    review = await judgeVideo(dest, campaign?.brief?.video_rules ?? [], { brand, brief: campaign?.brief, creator: who, round });
  } catch (e: any) {
    const couldntOpen = e instanceof FetchError;
    console.error(`[review] ${sid} failed:`, e?.message ?? e);
    review = {
      verdict: "changes", checks: [],
      feedback_to_creator: couldntOpen ? SEND_ANOTHER_WAY : "Thanks for sending this! Give me a moment, I'll get back to you shortly.",
      notes_for_admin: couldntOpen ? `Couldn't open the video: ${e.message}` : `The review itself failed (${String(e?.message ?? e).slice(0, 200)}). Retry the review.`,
    };
  }

  const status = review.verdict === "changes" ? "changes" : "reviewing";
  db.query("UPDATE submissions SET review_json = ?, status = ? WHERE id = ?").run(JSON.stringify(review), status, sid);

  const failed = review.checks.filter((c) => !c.passed).length;
  const summary = review.checks.length === 0
    ? `Couldn't watch ${who}'s video: ${review.notes_for_admin}`
    : failed === 0
      ? `Watched ${who}'s video: all ${review.checks.length} rules pass`
      : `Watched ${who}'s video: ${review.checks.length - failed} of ${review.checks.length} rules pass, asked for ${failed === 1 ? "one fix" : `${failed} fixes`}`;
  if (["awaiting_video", "video_feedback", "video_ready"].includes(deal.stage)) {
    try {
      setStage(dealId, "video_feedback", failed || review.checks.length === 0 ? `Round ${round}: needs a change` : `Round ${round} looks good`);
    } catch (e: any) {
      console.error(`[review] stage move failed for ${dealId}:`, e?.message ?? e);
    }
  }
  logEvent({ campaign_id: deal.campaign_id, deal_id: dealId, actor: "lily", type: "video.reviewed", summary, data: { submission_id: sid, verdict: review.verdict } });
  return submission(sid);
}

const app = new Hono();

app.post("/deals/:id/submissions", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const sub = await reviewVideo(c.req.param("id"), { source_url: b.source_url, message_id: b.message_id });
  return c.json({ submission: sub });
});

app.post("/submissions/:id/lily-approve", (c) => {
  const s = submission(c.req.param("id"));
  if (!s) throw fail(404, "submission not found");
  if (s.review?.verdict !== "approve") throw fail(409, "this video's review asks for changes");
  if (s.status !== "reviewing") throw fail(409, `submission is already ${s.status}`);
  const deal = get("SELECT * FROM deals WHERE id = ?", s.deal_id);
  setStage(deal.id, "video_ready", "Video looks great. Needs your OK");
  db.query("UPDATE submissions SET status = 'lily_ok' WHERE id = ?").run(s.id);
  const approval = createApproval({ campaign_id: deal.campaign_id, deal_id: deal.id, kind: "video", ref_id: s.id });
  return c.json({ submission: submission(s.id), approval });
});

app.get("/videos/:file", (c) => {
  const file = Bun.file(join(VIDEOS_DIR, basename(c.req.param("file"))));
  return file.size ? new Response(file) : c.json({ error: "not found" }, 404);
});

export default app;
