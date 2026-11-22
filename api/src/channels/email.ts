// AgentMail (lily@email.makelocalads.com): send, reply, poll inbound, save video attachments.
import { AgentMailClient } from "agentmail";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, VIDEOS_DIR } from "../lib/db";
import { alreadyStored, handleInbound, type Attachment } from "./inbound";

const INBOX = () => process.env.AGENTMAIL_INBOX || "lily@email.makelocalads.com";
const SEEN = "creat0r-seen";
const BASELINE_MARKER = join(DATA_DIR, ".email-baseline-done");
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

let client: AgentMailClient | null = null;
const am = () => (client ??= new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY! }));

export async function emailSend(m: { to: string; subject: string; text: string }) {
  return am().inboxes.messages.send(INBOX(), { to: [m.to], subject: m.subject, text: m.text });
}

/** Reply inside an existing thread. `to` is explicit so replying to our own last message still reaches the creator. */
export async function emailReply(m: { replyToMessageId: string; to: string; text: string }) {
  return am().inboxes.messages.reply(INBOX(), m.replyToMessageId, { to: [m.to], text: m.text });
}

/** "Mia Torres <mia@x.com>" -> "mia@x.com" */
const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

async function saveAttachments(messageId: string, atts: any[] | undefined): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const a of atts ?? []) {
    const filename = a.filename ?? a.attachmentId;
    const mime = a.contentType ?? "application/octet-stream";
    const isVideo = mime.startsWith("video/") || VIDEO_EXT.test(filename);
    if (!isVideo) { out.push({ filename, mime, local_path: null }); continue; }
    const meta = await am().inboxes.messages.getAttachment(INBOX(), messageId, a.attachmentId);
    const res = await fetch(meta.downloadUrl);
    if (!res.ok) throw new Error(`attachment download ${res.status}`);
    const safe = `${messageId.replace(/[^a-z0-9]/gi, "").slice(-16)}_${filename.replace(/[^\w.-]/g, "_")}`;
    const local_path = join(VIDEOS_DIR, safe);
    writeFileSync(local_path, Buffer.from(await res.arrayBuffer()));
    out.push({ filename, mime, local_path });
  }
  return out;
}

const markSeen = (messageId: string) =>
  am().inboxes.messages.update(INBOX(), messageId, { addLabels: [SEEN], removeLabels: ["unread"] });

async function receivedUnseen() {
  const res = await am().inboxes.messages.list(INBOX(), { labels: ["received"], limit: 50 });
  return res.messages.filter((m) => !m.labels.includes(SEEN) && addressOf(m.from) !== INBOX().toLowerCase());
}

/** First start ever: label everything already in the inbox as seen, process nothing. */
async function baseline() {
  if (existsSync(BASELINE_MARKER)) return;
  for (const m of await receivedUnseen()) await markSeen(m.messageId);
  writeFileSync(BASELINE_MARKER, new Date().toISOString());
  console.log("[channels] email baseline done");
}

export async function pollEmail() {
  for (const item of (await receivedUnseen()).reverse()) {
    if (alreadyStored("email", item.messageId)) { await markSeen(item.messageId); continue; }
    const full = await am().inboxes.messages.get(INBOX(), item.messageId);
    const attachments = await saveAttachments(item.messageId, full.attachments);
    await handleInbound({
      channel: "email", from: addressOf(full.from), body: (full.extractedText ?? full.text ?? full.preview ?? "").trim(),
      external_id: full.messageId, thread_ref: full.threadId, attachments,
    });
    await markSeen(item.messageId);
  }
}

let polling = false;
export function startEmail() {
  if (!process.env.AGENTMAIL_API_KEY) return console.warn("[channels] AGENTMAIL_API_KEY missing; email poller off");
  am().inboxes.get(INBOX())
    .then((ib) => ib.displayName === "Lily" ? null : am().inboxes.update(INBOX(), { displayName: "Lily" }))
    .catch((e) => console.warn("[channels] inbox rename failed:", e.message));
  const tick = async () => {
    if (polling) return;
    polling = true;
    try { await baseline(); await pollEmail(); }
    catch (e) { console.error("[channels] email poll failed:", (e as Error).message); }
    finally { polling = false; }
  };
  tick();
  setInterval(tick, 10_000);
}
