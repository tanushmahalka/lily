// DEMO_ALLOWLIST: comma-separated IG handles and emails. Empty = everyone is allowed.
// Read from creat0r/.env on every check, so editing the list takes effect without restarting the API.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../lib/db";

const norm = (s: string) => s.trim().toLowerCase().replace(/^@/, "");

function rawList(): string {
  try {
    const line = readFileSync(join(ROOT, ".env"), "utf8").match(/^DEMO_ALLOWLIST=(.*)$/m);
    if (line) return line[1].replace(/^["']|["']$/g, "");
  } catch {}
  return process.env.DEMO_ALLOWLIST ?? "";
}

export function isAllowed(who: { ig_handle?: string | null; email?: string | null }): boolean {
  const list = rawList().split(",").map(norm).filter(Boolean);
  if (list.length === 0) return true;
  return [who.ig_handle, who.email].some((v) => !!v && list.includes(norm(v)));
}
