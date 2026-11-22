// ig-bridge client (127.0.0.1:7777). Plain fetch: the bridge has no SDK.
const BASE = () => process.env.IG_BRIDGE_URL || "http://127.0.0.1:7777";

async function bridge<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.IG_BRIDGE_TOKEN) headers.authorization = `Bearer ${process.env.IG_BRIDGE_TOKEN}`;
  const res = await fetch(`${BASE()}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`ig-bridge ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export const igFollow = (username: string) =>
  bridge<{ userId: string; result: "following" | "requested" }>("/follow", { username });

export function igSend(m: { to?: string; threadId?: string; text: string }) {
  const target = m.threadId ? { threadId: m.threadId } : { to: m.to };
  return bridge<{ messageId: string; sentAt: number; threadId: string; userId: string }>("/messages", { ...target, text: m.text });
}

/** ig-bridge webhook payload (README). */
export type IgWebhook = {
  event: string;
  thread: { id: string; title?: string; isGroup?: boolean };
  message: {
    id: string; threadId: string; at: number; type: string; text?: string | null; shareUrl?: string | null;
    sender: { igid: string; username: string; name?: string };
  };
};
