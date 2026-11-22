// PLAN §4: guardrails derived from the budget and the chosen idea's creator count.
export type Range = { min?: number; max?: number };
export type Guardrails = {
  fee_usd: Range; revision_rounds: Range; usage_rights_days: Range; upfront_pct: Range; delivery_days: Range;
};

const round10 = (n: number) => Math.round(n / 10) * 10;

export function deriveGuardrails(budgetUsd: number, creatorsTarget: number): Guardrails {
  const max = round10((budgetUsd / Math.max(1, creatorsTarget)) * 1.2);
  return {
    fee_usd: { min: round10(max * 0.25), max },
    revision_rounds: { min: 1, max: 2 },
    usage_rights_days: { min: 30, max: 90 },
    upfront_pct: { max: 50 },
    delivery_days: { min: 3, max: 14 },
  };
}

const FIELDS: [keyof Guardrails, (v: number) => string, (v: number) => string][] = [
  ["fee_usd", (v) => `Fee $${v}`, (v) => `$${v}`],
  ["revision_rounds", (v) => `${v} revision round${v === 1 ? "" : "s"}`, (v) => `${v}`],
  ["usage_rights_days", (v) => `${v} days of usage rights`, (v) => `${v} days`],
  ["upfront_pct", (v) => `${v}% upfront`, (v) => `${v}%`],
  ["delivery_days", (v) => `Delivery in ${v} days`, (v) => `${v} days`],
];

/** Plain-words violations, e.g. "Fee $350 is above the $300 limit". Missing terms are not violations. */
export function checkTerms(terms: Record<string, unknown>, g: Guardrails): string[] {
  const out: string[] = [];
  for (const [key, label, unit] of FIELDS) {
    const v = terms[key];
    if (typeof v !== "number") continue;
    const r = g[key] ?? {};
    if (r.max != null && v > r.max) out.push(`${label(v)} is above the ${unit(r.max)} limit`);
    if (r.min != null && v < r.min) out.push(`${label(v)} is below the ${unit(r.min)} minimum`);
  }
  return out;
}
