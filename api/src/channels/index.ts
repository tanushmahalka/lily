// Thread C owns this folder. Frozen export: sendToCreator; starts the email poller via startChannels().
import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, now } from "../lib/db";
import { logEvent } from "../lib/events";
import { isAllowed } from "./allowlist";
import { emailReply, emailSend, startEmail } from "./email";
import { handleInbound, insertMessage, safeSetStage, type Channel } from "./inbound";
import { igFollow, igSend, type IgWebhook } from "./instagram";

export class ChannelError extends Error {
  constructor(public status: 400 | 404 | 502, message: string) { super(message); }
}

const brandName = () => {
  const row = db.query(`SELECT value_json FROM settings WHERE key = 'brand'`).get() as any;
  return (row && JSON.parse(row.value_json)?.name) || "LocalAds";
};

export async function sendToCreator(
  dealId: string, m: { channel: Channel; text: string; subject?: string },
): Promise<any> {
  const deal = db.query(`SELECT * FROM deals WHERE id = ?`).get(dealId) as any;
  if (!deal) throw new ChannelError(404, "deal not found");
  const creator = db.query(`SELECT * FROM creators WHERE id = ?`).get(deal.creator_id) as any;
  const ch = m.channel;
  const handle = `@${creator.ig_handle}`;
  const who = ch === "instagram" ? handle : creator.name ?? creator.email;
  const base = { deal_id: deal.id, creator_id: creator.id, channel: ch, direction: "out" as const };

  if (ch === "email" && !creator.email) throw new ChannelError(400, `${handle} has no email address`);

  // Demo allowlist: store the draft, send nothing, leave the stage alone.
  if (!isAllowed(creator)) {
    const message = insertMessage({ ...base, body: m.text, external_id: null, suppressed: true });
    logEvent({
      campaign_id: deal.campaign_id, deal_id: deal.id, actor: "lily", type: "message.suppressed",
      summary: `Held a ${ch === "instagram" ? "DM" : "email"} to ${who} (not on the demo list)`,
      data: { message_id: message.id, channel: ch },
    });
    safeSetStage(deal.id, deal.stage, "Drafted, not sent (demo allowlist)");
    return message;
  }

  let body = m.text;
  let external_id: string;
  const extra: Record<string, unknown> = {};
  try {
    if (ch === "instagram") {
      const sentBefore = db.query(
        `SELECT 1 FROM messages WHERE deal_id = ? AND channel = 'instagram' AND direction = 'out' AND suppressed = 0 LIMIT 1`,
      ).get(deal.id);
      if (!deal.ig_thread_id && !sentBefore) {
        try { extra.follow = (await igFollow(creator.ig_handle)).result; }
        catch (e) { extra.follow_error = (e as Error).message; console.warn("[channels] follow failed:", extra.follow_error); }
      }
      const r = await igSend({ threadId: deal.ig_thread_id ?? undefined, to: creator.ig_handle, text: body });
      external_id = r.messageId;
      db.query(`UPDATE deals SET ig_thread_id = ? WHERE id = ?`).run(r.threadId, deal.id);
      if (r.userId && !creator.ig_user_id)
        db.query(`UPDATE creators SET ig_user_id = ?, updated_at = ? WHERE id = ?`).run(r.userId, now(), creator.id);
    } else {
      const account = db.query(`SELECT speaks_as FROM accounts WHERE channel = 'email' AND live = 1`).get() as any;
      const signer = (account?.speaks_as ?? "Lily, partnerships at {brand}").replace("{brand}", brandName());
      if (!body.includes(signer)) body = `${body.trimEnd()}\n\n— ${signer}`;
      if (!deal.email_thread_id) {
        const subject = m.subject ?? `${brandName()} × ${creator.name ?? handle}`;
        const r = await emailSend({ to: creator.email, subject, text: body });
        external_id = r.messageId;
        db.query(`UPDATE deals SET email_thread_id = ? WHERE id = ?`).run(r.threadId, deal.id);
      } else {
        const last = (db.query(
          `SELECT external_id FROM messages WHERE deal_id = ? AND channel = 'email' AND suppressed = 0 AND external_id IS NOT NULL
           ORDER BY (direction = 'in') DESC, created_at DESC LIMIT 1`,
        ).get(deal.id) as any)?.external_id;
        const r = last
          ? await emailReply({ replyToMessageId: last, to: creator.email, text: body })
          : await emailSend({ to: creator.email, subject: m.subject ?? `${brandName()} × ${creator.name ?? handle}`, text: body });
        external_id = r.messageId;
      }
    }
  } catch (e) {
    throw new ChannelError(502, (e as Error).message);
  }

  const message = insertMessage({ ...base, body, external_id });
  logEvent({
    campaign_id: deal.campaign_id, deal_id: deal.id, actor: "lily", type: "message.sent",
    summary: ch === "instagram" ? `Messaged ${handle} on Instagram` : `Emailed ${who}`,
    data: { message_id: message.id, channel: ch, ...extra },
  });
  const action = ch === "instagram" ? "Messaged on Instagram" : "Sent an email";
  safeSetStage(deal.id, deal.stage === "shortlisted" ? "reached_out" : deal.stage, action);
  return message;
}

/** Called once by index.ts at boot. */
export function startChannels(): void {
  startEmail();
}

const app = new Hono();

app.post("/deals/:id/send", async (c) => {
  const b = await c.req.json().catch(() => null) as any;
  if (!b || typeof b.text !== "string" || !b.text.trim()) return c.json({ error: "text is required" }, 400);
  const deal = db.query(`SELECT channel FROM deals WHERE id = ?`).get(c.req.param("id")) as any;
  if (!deal) return c.json({ error: "deal not found" }, 404);
  const channel = b.channel ?? deal.channel;
  if (channel !== "instagram" && channel !== "email") return c.json({ error: "channel must be instagram or email" }, 400);
  try {
    return c.json(await sendToCreator(c.req.param("id"), { channel, text: b.text, subject: b.subject }));
  } catch (e) {
    if (e instanceof ChannelError) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

app.post("/inbound/instagram", async (c) => {
  const raw = await c.req.text();
  const secret = process.env.IG_WEBHOOK_SECRET;
  if (secret) {
    const got = Buffer.from(c.req.header("x-igb-signature") ?? "");
    const want = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return c.json({ error: "bad signature" }, 401);
  }
  let p: IgWebhook;
  try { p = JSON.parse(raw); } catch { return c.json({ error: "bad json" }, 400); }
  if (p.event !== "message.received" || !p.message || p.thread?.isGroup) return c.json({ ok: true, ignored: true });
  const msg = p.message;
  const body = [msg.text, msg.shareUrl].filter(Boolean).join("\n") || `[${msg.type}]`;
  const r = await handleInbound({
    channel: "instagram", from: msg.sender.username, sender_id: msg.sender.igid, body,
    external_id: msg.id, thread_ref: p.thread?.id ?? msg.threadId,
  });
  return c.json({ ok: true, message_id: (r as any).message?.id ?? null, woke: (r as any).woke ?? false });
});

export default app;
