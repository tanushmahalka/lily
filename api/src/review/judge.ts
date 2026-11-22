// Gemini watches the video and checks each video rule from the campaign brief.
import { json, Type, uploadVideo } from "../lib/gemini";

export type Review = {
  verdict: "approve" | "changes";
  checks: { rule: string; passed: boolean; note: string }[];
  feedback_to_creator: string;
  notes_for_admin: string;
};

type ModelCheck = { rule: string; must_be_seen: boolean; seen_at: string | null; passed: boolean; note: string };
type ModelReview = { liked: string; checks: ModelCheck[]; feedback_to_creator: string; notes_for_admin: string };

const schema = {
  type: Type.OBJECT,
  properties: {
    liked: { type: Type.STRING, description: "One specific thing that genuinely works in this video." },
    checks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          rule: { type: Type.STRING, description: "The rule text, copied exactly." },
          must_be_seen: { type: Type.BOOLEAN, description: "True if the rule asks for something to be shown, visible, said, mentioned or included." },
          seen_at: { type: Type.STRING, nullable: true, description: "m:ss where the required thing is clearly seen or heard, or null if it never is." },
          passed: { type: Type.BOOLEAN },
          note: { type: Type.STRING, description: "One short sentence, with a timestamp when useful." },
        },
        required: ["rule", "must_be_seen", "seen_at", "passed", "note"],
        propertyOrdering: ["rule", "must_be_seen", "seen_at", "passed", "note"],
      },
    },
    feedback_to_creator: { type: Type.STRING },
    notes_for_admin: { type: Type.STRING },
  },
  required: ["liked", "checks", "feedback_to_creator", "notes_for_admin"],
  propertyOrdering: ["liked", "checks", "feedback_to_creator", "notes_for_admin"],
};

function prompt(rules: string[], ctx: { brand: string; brief: any; creator: string; round: number }) {
  return `You are Lily, who runs creator partnerships for ${ctx.brand}. ${ctx.creator} sent round ${ctx.round} of a sponsored video. Watch it and check it against the brief's video rules.

What the video is meant to be: ${ctx.brief?.title ?? ""}. ${ctx.brief?.angle ?? ""} ${ctx.brief?.video_description ?? ""}

Video rules, one check each, in this order, rule text copied exactly:
${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

How to judge:
- Be lenient. Creators are real people, not ad agencies. A rule fails only when the video clearly breaks it. If you're unsure, it passes.
- Rules that ask for something to be shown, visible, said or included pass only if you actually see or hear it; give the m:ss in seen_at. Accept any reasonable version of the thing (for an "ID card", any event badge, pass or lanyard card counts) as long as it's shown legibly for a moment, not hidden or a blur.
- Length and format rules: allow a few seconds either way.

feedback_to_creator: written to the creator by Lily. Warm, specific, at most 3 short sentences, no bullet points, no "As per the brief". Start with something you genuinely liked. If any rule failed, ask only for those fixes, concretely and kindly. If everything passed, thank them and say it's going to the team for a final look.
notes_for_admin: one or two plain lines for the brand owner about this round.`;
}

/** Review `path` against `rules`. The verdict is computed here, not trusted from the model. */
export async function judgeVideo(path: string, rules: string[], ctx: { brand: string; brief: any; creator: string; round: number }): Promise<Review> {
  const file = await uploadVideo(path);
  const r = await json<ModelReview>({ prompt: prompt(rules, ctx), schema: schema as any, files: [file] });

  let overridden = false;
  const checks = rules.map((rule, i) => {
    const c = r.checks.find((x) => x.rule.trim() === rule.trim()) ?? r.checks[i];
    if (!c) return { rule, passed: true, note: "Couldn't judge this one; letting it pass." };
    // Evidence rule: something that must be seen but was never seen fails.
    let passed = c.passed;
    if (c.must_be_seen && !c.seen_at && passed) { passed = false; overridden = true; }
    return { rule, passed, note: c.note };
  });
  const verdict = checks.some((c) => !c.passed) ? "changes" : "approve";

  let feedback = r.feedback_to_creator;
  if (overridden) {
    const failed = checks.filter((c) => !c.passed).map((c) => c.rule);
    const fix = await json<{ feedback_to_creator: string }>({
      prompt: `You are Lily from ${ctx.brand}. Write a warm message to ${ctx.creator} about their video, at most 3 short sentences. Start with this thing you liked: "${r.liked}". Then kindly ask them to fix: ${failed.join("; ")}. No bullet points.`,
      schema: { type: Type.OBJECT, properties: { feedback_to_creator: { type: Type.STRING } }, required: ["feedback_to_creator"] } as any,
    });
    feedback = fix.feedback_to_creator;
  }
  return { verdict, checks, feedback_to_creator: feedback, notes_for_admin: r.notes_for_admin };
}
