import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "../../..");
export const DATA_DIR = join(ROOT, "data");
export const VIDEOS_DIR = join(DATA_DIR, "videos");
mkdirSync(VIDEOS_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, "creat0r.db"), { create: true, strict: true });
db.exec(readFileSync(join(ROOT, "db/schema.sql"), "utf8"));

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
/** id("cmp") -> "cmp_k3f9a2x1" */
export function id(prefix: string) {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `${prefix}_${s}`;
}

export const now = () => Date.now();

/** Parse every *_json column of a row (or rows) into `<name>` without the suffix. */
export function parseRow<T = any>(row: any): T {
  if (!row) return row;
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith("_json")) out[k.slice(0, -5)] = v == null ? null : JSON.parse(v as string);
    else out[k] = v;
  }
  return out;
}
export const parseRows = <T = any>(rows: any[]) => rows.map((r) => parseRow<T>(r));
