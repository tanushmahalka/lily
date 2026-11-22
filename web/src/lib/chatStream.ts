import { createParser, type EventSourceMessage } from "eventsource-parser";
import type { ChatMessage } from "./types";

export interface StreamHandlers {
  onStep?: (label: string) => void;
  onDelta?: (text: string) => void;
  onDone?: (message: ChatMessage | undefined) => void;
}

/** POST /chat/threads/:id/messages streams SSE back: {type:'step'|'delta'|'done'}. */
export async function sendToLily(threadId: string, text: string, h: StreamHandlers, signal?: AbortSignal) {
  const res = await fetch(`/api/chat/threads/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ text }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Lily didn't answer (${res.status})`);
  let done = false;
  const parser = createParser({
    onEvent(ev: EventSourceMessage) {
      let d: any;
      try { d = JSON.parse(ev.data); } catch { return; }
      const type = d.type ?? ev.event;
      if (type === "step") h.onStep?.(d.label);
      else if (type === "delta") h.onDelta?.(d.text ?? "");
      else if (type === "done") { done = true; h.onDone?.(d.message); }
    },
  });
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    parser.feed(value);
  }
  if (!done) h.onDone?.(undefined);
}
