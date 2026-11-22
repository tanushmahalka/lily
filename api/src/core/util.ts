import { HTTPException } from "hono/http-exception";
import { db, parseRow, parseRows } from "../lib/db";

export const fail = (status: 400 | 404 | 409 | 422, body: Record<string, unknown>) =>
  new HTTPException(status, { res: Response.json(body, { status }) });

const TABLES = new Set(["campaigns", "ideas", "creators", "deals", "offers", "submissions", "approvals", "payouts", "chat_threads"]);
/** Row by id with *_json parsed, or null. */
export function row<T = any>(table: string, rowId: string | null | undefined): T | null {
  if (!rowId || !TABLES.has(table)) return null;
  return parseRow<T>(db.query(`SELECT * FROM ${table} WHERE id = ?`).get(rowId)) ?? null;
}
export function mustRow<T = any>(table: string, rowId: string | null | undefined, what = table.replace(/s$/, "")): T {
  const r = row<T>(table, rowId);
  if (!r) throw fail(404, { error: `${what} not found` });
  return r;
}
export const all = <T = any>(sql: string, ...params: any[]) => parseRows<T>(db.query(sql).all(...params) as any[]);
export const one = <T = any>(sql: string, ...params: any[]) => (parseRow<T>(db.query(sql).get(...params)) ?? null) as T | null;

export const campaignTitle = (c: { brief?: any; goal: string }) => c.brief?.title ?? c.goal;
export const at = (h: string | null | undefined) => (h ? `@${h}` : "the creator");

export function getSetting<T = any>(key: string): T | null {
  const r = db.query("SELECT value_json FROM settings WHERE key = ?").get(key) as { value_json: string } | null;
  return r ? JSON.parse(r.value_json) : null;
}

export async function body(c: { req: { json: () => Promise<any> } }): Promise<Record<string, any>> {
  try {
    const b = await c.req.json();
    if (b && typeof b === "object" && !Array.isArray(b)) return b;
  } catch {}
  throw fail(400, { error: "JSON object body required" });
}
