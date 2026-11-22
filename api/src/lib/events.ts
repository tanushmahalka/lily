import { db, id, now } from "./db";

export type Actor = "lily" | "admin" | "creator" | "system";
export type StreamMessage = { channel: "event" | "chat"; data: unknown };

const listeners = new Set<(m: StreamMessage) => void>();
/** Subscribe to the live hub (used by GET /api/stream). Returns an unsubscribe fn. */
export function subscribe(fn: (m: StreamMessage) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function publish(m: StreamMessage) {
  for (const fn of listeners) fn(m);
}

export function logEvent(e: {
  campaign_id?: string | null; deal_id?: string | null; actor: Actor;
  type: string; summary: string; data?: unknown;
}) {
  const row = {
    id: id("evt"), ts: now(), campaign_id: e.campaign_id ?? null, deal_id: e.deal_id ?? null,
    actor: e.actor, type: e.type, summary: e.summary, data_json: e.data === undefined ? null : JSON.stringify(e.data),
  };
  db.query(
    `INSERT INTO events (id, ts, campaign_id, deal_id, actor, type, summary, data_json)
     VALUES ($id, $ts, $campaign_id, $deal_id, $actor, $type, $summary, $data_json)`,
  ).run(row);
  const event = { ...row, data: e.data ?? null };
  delete (event as any).data_json;
  publish({ channel: "event", data: event });
  return event;
}
