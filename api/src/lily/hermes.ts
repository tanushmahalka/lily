// Thread E. Talks to the Hermes API server (profile creat0r) over its OpenAI-compatible stream.
import { createParser } from "eventsource-parser";

const API_URL = process.env.HERMES_API_URL ?? "http://127.0.0.1:8642";
const API_KEY = process.env.HERMES_API_KEY ?? "";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export type HermesItem =
  | { type: "delta"; text: string }
  | { type: "step"; label: string }
  | { type: "keepalive" }
  | { type: "error"; message: string };

/** Streams one Hermes turn: text deltas, tool steps (friendly labels) and keepalives. */
export async function* streamHermes(messages: ChatMsg[], signal: AbortSignal): AsyncGenerator<HermesItem> {
  const res = await fetch(`${API_URL}/v1/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: "hermes-agent", stream: true, messages }),
  });
  if (!res.ok || !res.body) {
    yield { type: "error", message: `Hermes answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
    return;
  }

  const queue: HermesItem[] = [];
  const parser = createParser({
    onEvent(ev) {
      if (ev.data === "[DONE]") return;
      let data: any;
      try { data = JSON.parse(ev.data); } catch { return; }
      if (ev.event === "hermes.tool.progress") {
        if (data.status === "running") queue.push({ type: "step", label: friendlyStep(data.tool, data.label) });
        return;
      }
      if (ev.event) return; // hermes.status and other custom events
      if (data.error) { queue.push({ type: "error", message: String(data.error.message ?? data.error) }); return; }
      const choice = data.choices?.[0];
      const text = choice?.delta?.content;
      if (typeof text === "string" && text) queue.push({ type: "delta", text });
      if (choice?.finish_reason === "error" || choice?.finish_reason === "cancelled") {
        queue.push({ type: "error", message: `Hermes turn ended: ${choice.finish_reason}` });
      }
    },
    onComment() { queue.push({ type: "keepalive" }); },
  });

  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    parser.feed(decoder.decode(chunk, { stream: true }));
    while (queue.length) yield queue.shift()!;
  }
}

/** Turns a raw tool preview (usually a curl command) into a step a marketer understands. */
export function friendlyStep(tool: string, label = ""): string {
  const s = String(label);
  const field = (k: string) => s.match(new RegExp(`"${k}"\\s*:\\s*"([^"]+)"`))?.[1];
  if (tool === "memory") return "Making a note";
  if (s.includes("/product/read")) return "Reading your product page";
  if (s.includes("/find/reels")) return field("keyword") ? `Seeing what works on Instagram for "${field("keyword")}"` : "Seeing what works on Instagram";
  if (s.includes("/creators/past")) return "Checking creators you've worked with";
  if (s.includes("/creators/analyze")) return field("handle") ? `Looking at @${field("handle")!.replace(/^@/, "")}` : "Looking at a creator";
  if (/\/campaigns\/[^/\s]+\/ideas/.test(s)) return "Drafting 3 ideas";
  if (s.includes("/shortlist/submit")) return "Putting the shortlist together";
  if (/\/deals\/[^/\s]+\/send/.test(s)) return "Sending a message";
  if (/\/deals\/[^/\s]+\/offers/.test(s)) return "Working on the offer";
  if (/\/deals\/[^/\s]+\/escalate/.test(s)) return "Flagging a question for you";
  if (/\/deals\/[^/\s]+\/submissions/.test(s)) return "Watching the video";
  if (s.includes("/creators") && s.includes("-X POST")) return field("ig_handle") ? `Adding @${field("ig_handle")!.replace(/^@/, "")}` : "Adding a creator";
  if (/\/deals\/[^/\s]+\/context/.test(s)) return "Reading the conversation";
  if (s.includes("/approvals")) return "Checking what needs you";
  if (s.includes("/campaigns") || s.includes("/events")) return "Checking the campaign";
  if (s.includes("/settings") || s.includes("/accounts")) return "Checking your brand";
  return "Working…";
}
