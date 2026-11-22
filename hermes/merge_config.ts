// Deep-merge hermes/config.patch.yaml into a profile config.yaml, keeping every other key.
// Usage: bun merge_config.ts <patch.yaml> <config.yaml> <creat0r_dir>
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [patchPath, configPath, creat0rDir] = process.argv.slice(2);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function merge(base: Record<string, unknown>, patch: Record<string, unknown>) {
  for (const [k, v] of Object.entries(patch)) {
    base[k] = isObj(v) && isObj(base[k]) ? merge(base[k] as Record<string, unknown>, v) : v;
  }
  return base;
}

const base = existsSync(configPath) ? ((Bun.YAML.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>) ?? {}) : {};
const patch = Bun.YAML.parse(readFileSync(patchPath, "utf8").replaceAll("__CREAT0R_DIR__", creat0rDir)) as Record<string, unknown>;
writeFileSync(configPath, Bun.YAML.stringify(merge(base, patch), null, 2));
console.log(`merged ${patchPath} -> ${configPath}`);
