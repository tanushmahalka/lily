// Shared inbound pipeline: store -> match creator + active deal -> logEvent -> stage -> wakeLily.
import { db, id, now, parseRow } from "../lib/db";
import { logEvent } from "../lib/events";
import { setStage } from "../core";
import { wakeLily } from "../lily";
import { isAllowed } from "./allowlist";

export type Channel = "instagram" | "email";
export type Attachment = { filename: string; mime: string; local_path: string | null };

const ACTIVE = `stage NOT IN ('completed','declined')`;
const label = (ch: Channel) => (ch === "instagram" ? "Instagram" : "email");

export function insertMessage(m: {
  deal_id: string | null; creator_id: string | null; channel: Channel; direction: "in" | "out";
  body: string; external_id: string | null; attachments?: Attachment[]; suppressed?: boolean;
}) {
  const row = {
    id: id("msg"), deal_id: m.deal_id, creator_id: m.creator_id, channel: m.channel, direction: m.direction,
    body: m.body, external_id: m.external_id, attachments_json: JSON.stringify(m.attachments ?? []),
    suppressed: m.suppressed ? 1 : 0, created_at: now(),
  };
  db.query(
    `INSERT INTO messages (id, deal_id, creator_id, channel, direction, body, external_id, attachments_json, suppressed, created_at)
     VALUES ($id, $deal_id, $creator_id, $channel, $direction, $body, $external_id, $attachments_json, $suppressed, $created_at)`,
  ).run(row);
  return parseRow(row);
}

export const alreadyStored = (channel: Channel, externalId: string) =>
  !!db.query(`SELECT 1 FROM messages WHERE channel = ? AND external_id = ?`).get(channel, externalId);

/** setStage is core's (A). A failure there must never lose a message we already sent or stored. */
export function safeSetStage(dealId: string, stage: any, latestAction: string) {
  try {
    setStage(dealId, stage, latestAction);
  } catch (e) {
    console.warn(`[channels] setStage(${dealId}, ${stage}) failed:`, (e as Error).message);
  }
}

function findCreator(channel: Channel, from: string, senderId: string | undefined, threadRef: string): any {
  const f = from.trim().toLowerCase().replace(/^@/, "");
  const threadCol = channel === "instagram" ? "ig_thread_id" : "email_thread_id";
  const direct = channel === "instagram"
    ? db.query(`SELECT * FROM creators WHERE lower(ig_handle) = ? OR (ig_user_id IS NOT NULL AND ig_user_id = ?)`).get(f, senderId ?? "")
    : db.query(`SELECT * FROM creators WHERE lower(email) = ?`).get(f);
  if (direct) return direct;
  return db.query(`SELECT c.* FROM creators c JOIN deals d ON d.creator_id = c.id WHERE d.${threadCol} = ? LIMIT 1`).get(threadRef);
}

function findActiveDeal(channel: Channel, creatorId: string, threadRef: string): any {
  const threadCol = channel === "instagram" ? "ig_thread_id" : "email_thread_id";
  return (
    db.query(`SELECT * FROM deals WHERE creator_id = ? AND ${threadCol} = ? AND ${ACTIVE} ORDER BY updated_at DESC LIMIT 1`).get(creatorId, threadRef) ??
    db.query(`SELECT * FROM deals WHERE creator_id = ? AND ${ACTIVE} ORDER BY updated_at DESC LIMIT 1`).get(creatorId)
  );
}

export async function handleInbound(m: {
  channel: Channel; from: string; sender_id?: string; body: string; external_id: string;
  thread_ref: string; attachments?: Attachment[];
}) {
  if (alreadyStored(m.channel, m.external_id)) return { duplicate: true };

  const creator = findCreator(m.channel, m.from, m.sender_id, m.thread_ref);
  const deal = creator ? findActiveDeal(m.channel, creator.id, m.thread_ref) : null;

  if (creator && m.channel === "instagram" && m.sender_id && !creator.ig_user_id)
    db.query(`UPDATE creators SET ig_user_id = ?, updated_at = ? WHERE id = ?`).run(m.sender_id, now(), creator.id);
  if (deal) {
    const col = m.channel === "instagram" ? "ig_thread_id" : "email_thread_id";
    if (!deal[col]) db.query(`UPDATE deals SET ${col} = ? WHERE id = ?`).run(m.thread_ref, deal.id);
  }

  const message = insertMessage({
    deal_id: deal?.id ?? null, creator_id: creator?.id ?? null, channel: m.channel, direction: "in",
    body: m.body, external_id: m.external_id, attachments: m.attachments,
  });

  const who = creator ? (m.channel === "instagram" ? `@${creator.ig_handle}` : creator.name ?? creator.email) : m.from;
  const allowed = !!creator && isAllowed(creator);
  const files = m.attachments?.filter((a) => a.local_path).length ?? 0;
  logEvent({
    campaign_id: deal?.campaign_id ?? null, deal_id: deal?.id ?? null, actor: "creator", type: "message.received",
    summary: !creator
      ? `New ${label(m.channel)} message from ${m.from} (not a creator we know)`
      : `${who} replied on ${label(m.channel)}${files ? ` with ${files} video${files > 1 ? "s" : ""}` : ""}`,
    data: { message_id: message.id, channel: m.channel, woke_lily: !!deal && allowed },
  });

  // Unknown sender, no active deal, or not on the demo allowlist: stored and logged, Lily stays asleep.
  if (!deal || !allowed) return { message, woke: false };

  safeSetStage(deal.id, deal.stage === "reached_out" ? "talking" : deal.stage, `Replied on ${label(m.channel)}`);
  wakeLily("creator-message", { deal_id: deal.id, message_id: message.id }).catch((e) =>
    console.error("[channels] wakeLily failed:", (e as Error).message),
  );
  return { message, woke: true };
}
