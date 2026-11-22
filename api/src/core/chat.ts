import { Hono } from "hono";
import { db, id, now, parseRow } from "../lib/db";
import { publish } from "../lib/events";
import { all, body, fail, mustRow, one } from "./util";

export type ChatKind = "text" | "ideas" | "approval" | "update" | "steps";
const KINDS: ChatKind[] = ["text", "ideas", "approval", "update", "steps"];

export function ensureGeneralThread(): string {
  const g = one<{ id: string }>("SELECT id FROM chat_threads WHERE campaign_id IS NULL AND title = 'General' ORDER BY created_at LIMIT 1");
  if (g) return g.id;
  const tid = id("thr");
  db.query("INSERT INTO chat_threads (id, title, campaign_id, created_at) VALUES (?, 'General', NULL, ?)").run(tid, now());
  return tid;
}

function resolveThread(threadId?: string | null, campaignId?: string | null): string {
  if (threadId) return mustRow("chat_threads", threadId, "thread").id;
  if (campaignId) {
    const c = mustRow("campaigns", campaignId, "campaign");
    if (c.chat_thread_id) return c.chat_thread_id;
  }
  return ensureGeneralThread();
}

export function postChat(m: {
  thread_id?: string; campaign_id?: string; role: "lily" | "admin"; kind: ChatKind; body: string; ref?: unknown;
}): { id: string } {
  const thread_id = resolveThread(m.thread_id, m.campaign_id);
  const r = {
    id: id("cm"), thread_id, role: m.role, kind: m.kind, body: m.body,
    ref_json: m.ref === undefined ? null : JSON.stringify(m.ref), created_at: now(),
  };
  db.query(`INSERT INTO chat_messages (id, thread_id, role, kind, body, ref_json, created_at)
            VALUES ($id, $thread_id, $role, $kind, $body, $ref_json, $created_at)`).run(r);
  publish({ channel: "chat", data: parseRow(r) });
  return { id: r.id };
}

const chat = new Hono();

chat.get("/chat/threads", (c) => {
  ensureGeneralThread();
  return c.json(all(`
    SELECT t.*, (SELECT MAX(created_at) FROM chat_messages m WHERE m.thread_id = t.id) AS last_at
    FROM chat_threads t ORDER BY COALESCE(last_at, t.created_at) DESC`));
});

chat.get("/chat/threads/:id/messages", (c) => {
  mustRow("chat_threads", c.req.param("id"), "thread");
  return c.json(all("SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at, rowid", c.req.param("id")));
});

chat.post("/chat/notify", async (c) => {
  const b = await body(c);
  if (typeof b.body !== "string" || !b.body.trim()) throw fail(400, { error: "body is required" });
  const kind = (b.kind ?? "text") as ChatKind;
  if (!KINDS.includes(kind)) throw fail(400, { error: `kind must be one of ${KINDS.join(", ")}` });
  const { id: mid } = postChat({ thread_id: b.thread_id, campaign_id: b.campaign_id, role: "lily", kind, body: b.body, ref: b.ref });
  return c.json(one("SELECT * FROM chat_messages WHERE id = ?", mid));
});

export default chat;
