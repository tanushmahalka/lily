import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "./queries";
import type { ChatMessage, LilyEvent } from "./types";

/** One EventSource on /api/stream for the whole app. Reconnect is native. */
export function useLiveStream() {
  const qc = useQueryClient();
  useEffect(() => {
    const es = new EventSource("/api/stream");

    es.addEventListener("event", (m) => {
      let e: LilyEvent;
      try { e = JSON.parse((m as MessageEvent).data); } catch { return; }
      if (e.campaign_id) qc.setQueryData<LilyEvent[]>(qk.events(e.campaign_id), (xs) =>
        xs ? (xs.some((x) => x.id === e.id) ? xs : [...xs, e]) : xs);
      if (e.campaign_id) qc.invalidateQueries({ queryKey: qk.campaign(e.campaign_id) });
      else qc.invalidateQueries({ queryKey: ["campaign"] });
      qc.invalidateQueries({ queryKey: qk.campaigns });
      if (e.deal_id) qc.invalidateQueries({ queryKey: ["deal", e.deal_id] });
      if (/^(approval|payout|offer|video|stage|shortlist|autonomy)/.test(e.type)) qc.invalidateQueries({ queryKey: qk.approvals });
      if (/^(creator|reels|stage)/.test(e.type)) qc.invalidateQueries({ queryKey: qk.creators });
      if (e.type === "thread.renamed") qc.invalidateQueries({ queryKey: qk.threads });
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
}
