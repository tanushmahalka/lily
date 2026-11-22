import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "./queries";
import type { ChatMessage, LilyEvent } from "./types";

type Listener = (e: LilyEvent) => void;
const listeners = new Set<Listener>();
/** Components that want the raw event feed (e.g. a live "Lily is…" line). */
export function useEventFeed(fn: Listener) {
  useEffect(() => { listeners.add(fn); return () => { listeners.delete(fn); }; }, [fn]);
}

/** One EventSource on /api/stream for the whole app. Reconnect is native. */
export function useLiveStream() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.addEventListener("event", (m) => {
      let e: LilyEvent;
      try { e = JSON.parse((m as MessageEvent).data); } catch { return; }
      listeners.forEach((l) => l(e));
      if (e.campaign_id) qc.invalidateQueries({ queryKey: qk.campaign(e.campaign_id) });
      else qc.invalidateQueries({ queryKey: ["campaign"] });
      qc.invalidateQueries({ queryKey: qk.campaigns });
      if (e.deal_id) qc.invalidateQueries({ queryKey: ["deal", e.deal_id] });
      if (/^(approval|payout|offer|video|stage|shortlist|autonomy)/.test(e.type)) qc.invalidateQueries({ queryKey: qk.approvals });
      if (/^(creator|reels|stage)/.test(e.type)) qc.invalidateQueries({ queryKey: qk.creators });
      if (/^(settings|brand)/.test(e.type)) qc.invalidateQueries({ queryKey: qk.settings });
    });

    es.addEventListener("chat", (m) => {
      let msg: ChatMessage;
      try { msg = JSON.parse((m as MessageEvent).data); } catch { return; }
      qc.setQueryData<ChatMessage[]>(qk.threadMessages(msg.thread_id), (xs) =>
        xs ? (xs.some((x) => x.id === msg.id) ? xs : [...xs, msg]) : xs);
      qc.invalidateQueries({ queryKey: qk.threads });
      if (msg.kind === "approval") qc.invalidateQueries({ queryKey: qk.approvals });
      if (msg.kind === "ideas") qc.invalidateQueries({ queryKey: ["campaign"] });
    });

    return () => es.close();
  }, [qc]);
  return connected;
}
