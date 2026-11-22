// Thread E owns this folder. Frozen export: wakeLily (see CONTRACT.md).
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, id, parseRow, parseRows, ROOT } from "../lib/db";
import { logEvent } from "../lib/events";
import { postChat } from "../core";
import { streamHermes, type ChatMsg } from "./hermes";

export type LilyRoute = "campaign-start" | "creator-message" | "admin-decision";

const WEBHOOK_URL = process.env.HERMES_WEBHOOK_URL ?? "http://127.0.0.1:8644";
const WEBHOOK_SECRET = process.env.HERMES_WEBHOOK_SECRET ?? "";

/** Signed POST to a Hermes webhook route (V2: HMAC-SHA256 hex of `${ts}.${body}`). Never throws. */
export async function wakeLily(route: LilyRoute, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${body}`).digest("hex");
  let problem = "";
  try {
    const res = await fetch(`${WEBHOOK_URL}/webhooks/${route}`, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Timestamp": ts,
        "X-Webhook-Signature-V2": signature,
        "X-Request-ID": id("wake"),
      },
    });
    if (!res.ok) problem = `Hermes answered ${res.status}`;
  } catch (e) {
    problem = e instanceof Error ? e.message : String(e);
  }
  if (!problem) return;
  console.error(`[lily] wakeLily(${route}) failed: ${problem}`);
  try {
    logEvent({
      actor: "system", type: "lily.unreachable",
      campaign_id: (payload.campaign_id as string) ?? campaignOfDeal(payload.deal_id as string) ?? null,
      deal_id: (payload.deal_id as string) ?? null,
      summary: "I couldn't wake up just now, so I'll miss this until someone restarts me",
      data: { route, payload, problem },
    });
  } catch (e) {
    console.error("[lily] could not log lily.unreachable", e);
  }
}

function campaignOfDeal(dealId?: string): string | null {
  if (!dealId) return null;
  return (db.query("SELECT campaign_id FROM deals WHERE id = ?").get(dealId) as any)?.campaign_id ?? null;
}

const SKILLS_DIR = join(ROOT, "hermes/skills");
function skill(name: string) {
  try {
    return readFileSync(join(SKILLS_DIR, name, "SKILL.md"), "utf8").replace(/^---[\s\S]*?---\s*/, "");
  } catch {
    return "";
  }
}

/** The system message for an admin chat turn: where Lily is, plus the skills this chat needs. */
function systemMessage(thread: { id: string; title: string; campaign_id: string | null }) {
  const lines = [
    `You are in the admin chat of creat0r, thread "${thread.title}" (thread_id ${thread.id}). Today is ${new Date().toDateString()}.`,
    `Your API is http://127.0.0.1:4400/api. The person writing is the admin: a marketer, not an engineer. Reply in plain words, 1–3 short sentences, never mention APIs, ids, tools or stage codes.`,
  ];
  let ideating = false;
  if (thread.campaign_id) {
    const c = db.query("SELECT * FROM campaigns WHERE id = ?").get(thread.campaign_id) as any;
    const ideaCount = (db.query("SELECT COUNT(*) AS n FROM ideas WHERE campaign_id = ?").get(thread.campaign_id) as any)?.n ?? 0;
    if (c) {
      lines.push(
        `This thread belongs to campaign ${c.id}: status ${c.status}, autonomy ${c.autonomy}, budget $${c.budget_usd}, product link ${c.product_url}, ${ideaCount} ideas, chosen idea ${c.chosen_idea_id ?? "none"}.`,
        `Campaign goal, in the admin's words: """${c.goal}"""`,
      );
      ideating = c.status === "ideating" && ideaCount === 0;
      if (ideating) lines.push(`There are no ideas yet: run the creat0r-ideas procedure below now, in this turn, without asking questions first.`);
    }
  } else {
    lines.push(`This is the General thread (no campaign). Use GET /api/campaigns to find the campaign the admin means.`);
  }
  // creat0r-ideas is always included: the admin can start a new campaign from any thread (Amendment v5 #3).
  const skills = ideating
    ? ["creat0r-context", "creat0r-ideas"]
    : ["creat0r-context", "creat0r-admin", "creat0r-ideas", "creat0r-outreach", "creat0r-negotiate"];
  lines.push("", ...skills.map((s) => `# Skill: ${s}\n${skill(s)}`));
  return lines.join("\n");
}

/** Chat rows → OpenAI messages. Card rows become one short line so Lily knows what she posted. */
function history(threadId: string): ChatMsg[] {
  const rows = parseRows<any>(
    db.query("SELECT * FROM (SELECT *, rowid AS rn FROM chat_messages WHERE thread_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 40) ORDER BY created_at, rn").all(threadId),
  );
  return rows.map((r) => ({
    role: r.role === "admin" ? "user" : "assistant",
    content: r.kind === "text" ? r.body : `[${r.kind} card] ${r.body}`,
  }));
}

const app = new Hono();

app.post("/chat/threads/:id/messages", async (c) => {
  const thread = db.query("SELECT * FROM chat_threads WHERE id = ?").get(c.req.param("id")) as any;
  if (!thread) return c.json({ error: "thread not found" }, 404);
  const b = (await c.req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof b.text === "string" ? b.text.trim() : "";
  if (!text) return c.json({ error: "text is required" }, 400);

  postChat({ thread_id: thread.id, role: "admin", kind: "text", body: text });
  const messages: ChatMsg[] = [{ role: "system", content: systemMessage(thread) }, ...history(thread.id)];

  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    const steps: string[] = [];
    let reply = "";
    let error = "";
    try {
      for await (const item of streamHermes(messages, abort.signal)) {
        if (item.type === "delta") {
          reply += item.text;
          await stream.writeSSE({ data: JSON.stringify({ type: "delta", text: item.text }) });
        } else if (item.type === "step") {
          if (steps.at(-1) === item.label) continue;
          steps.push(item.label);
          await stream.writeSSE({ data: JSON.stringify({ type: "step", label: item.label }) });
        } else if (item.type === "keepalive") {
          await stream.write(": keepalive\n\n");
        } else {
          error = item.message;
        }
      }
    } catch (e) {
      if (abort.signal.aborted) return; // the admin left; Hermes is interrupted with the fetch
      error = e instanceof Error ? e.message : String(e);
    }
    if (error) console.error(`[lily] chat turn on ${thread.id} failed: ${error}`);
    const body = reply.trim() || (error ? "Sorry, I lost my train of thought there. Could you say that again?" : "Done.");
    const { id: messageId } = postChat({ thread_id: thread.id, role: "lily", kind: "text", body, ref: { steps } });
    const message = parseRow(db.query("SELECT * FROM chat_messages WHERE id = ?").get(messageId));
    await stream.writeSSE({ data: JSON.stringify({ type: "done", message }) });
  });
});

export default app;
