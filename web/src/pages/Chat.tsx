import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChatHistory, EmptyState, Text, ThinkingSteps, ThinkingIndicator } from "../kit/halaska-kit";
import ChatBubble from "../components/ChatBubble";
import Composer from "../components/Composer";
import ApprovalCard from "../components/ApprovalCard";
import IdeasCard from "../components/IdeasCard";
import Markdown from "../components/Markdown";
import { sendToLily } from "../lib/chatStream";
import { qk, useApprovals, useThreadMessages, useThreads } from "../lib/queries";
import { useToast } from "../lib/toast";
import { field, type ChatMessage, type ChatThread } from "../lib/types";

// StrictMode runs effects twice; never send the onboarding message twice.
const autoSent = new Set<string>();

function useViewportHeight() {
  const [h, setH] = useState(window.innerHeight);
  useEffect(() => {
    const f = () => setH(window.innerHeight);
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return h;
}

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

interface Live { admin: string; steps: string[]; text: string; sentAt: number }

export default function Chat() {
  const { threadId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const vh = useViewportHeight();
  const { data: threads } = useThreads();
  const { data: messages } = useThreadMessages(threadId);
  const [live, setLive] = useState<Live | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const thread = threads?.find((t) => t.id === threadId);

  // /chat → General, the main place to talk to Lily (CONTRACT v5 #3)
  useEffect(() => {
    if (!threadId && threads?.length) {
      const general = threads.find((t) => !t.campaign_id) ?? threads[0];
      nav(`/chat/${general.id}`, { replace: true });
    }
  }, [threadId, threads, nav]);

  const send = async (text: string) => {
    if (!threadId || !text.trim() || live) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setLive({ admin: text, steps: [], text: "", sentAt: Date.now() });
    try {
      await sendToLily(threadId, text, {
        onStep: (label) => setLive((l) => (l ? { ...l, steps: [...l.steps, label] } : l)),
        onDelta: (d) => setLive((l) => (l ? { ...l, text: l.text + d } : l)),
        onDone: (msg) => {
          if (msg) qc.setQueryData<ChatMessage[]>(qk.threadMessages(threadId), (xs) =>
            xs && !xs.some((x) => x.id === msg.id) ? [...xs, msg] : xs);
        },
      }, ac.signal);
    } catch (e: any) {
      if (e?.name !== "AbortError") toast(e?.message ?? "Lily didn't answer", "danger");
    } finally {
      await qc.invalidateQueries({ queryKey: qk.threadMessages(threadId) });
      qc.invalidateQueries({ queryKey: qk.threads });
      setLive(null);
      abortRef.current = null;
    }
  };

  // Onboarding hands over the first message (CONTRACT Amendments v2 #2)
  useEffect(() => {
    const first = (location.state as any)?.firstMessage as string | undefined;
    if (threadId && first && !autoSent.has(threadId)) {
      autoSent.add(threadId);
      nav(location.pathname, { replace: true, state: null });
      send(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const list = (messages ?? []).filter((m) => !(live && m.role === "admin" && m.body === live.admin && m.created_at >= live.sentAt - 5000));
  const h = vh - 24;
  const scrollRef = useRef<HTMLDivElement>(null);
  // follow new content while the reader is near the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [list.length, live?.text, live?.steps.length]);
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [threadId, messages === undefined]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ borderRight: "1px solid #efefed", padding: 12, background: "#fcfcfb" }}>
      <ChatHistory
        threads={(threads ?? []).map((t: ChatThread) => ({
          id: t.id, title: t.title, preview: t.preview, time: new Date(t.last_at ?? t.updated_at ?? t.created_at),
          pinned: !t.campaign_id && t.title === "General",
        }))}
        activeId={threadId}
        onSelect={(id: string) => nav(`/chat/${id}`)}
        title="Chats"
        width={256}
        height={h}
      />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {threadId ? (
          <>
            <div style={{ padding: "18px 32px 12px", borderBottom: "1px solid #efefed" }}>
              <Text size="lg" weight="semibold" as="div">{thread?.title ?? "Lily"}</Text>
              {thread?.campaign_id && (
                <button type="button" onClick={() => nav(`/campaigns/${thread.campaign_id}`)}
                  style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "#737373" }}>Open campaign →</button>
              )}
            </div>
            <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              <div style={{ maxWidth: 780, margin: "0 auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
                {!list.length && !live && <EmptyState title="Say hi to Lily" description="Ask how a campaign is going, or tell her what to do." />}
                {list.map((m) => <Turn key={m.id} m={m} campaignId={thread?.campaign_id ?? undefined} />)}
                {live && (
                  <>
                    <ChatBubble role="user" pending>{live.admin}</ChatBubble>
                    {live.steps.length > 0 || live.text ? (
                      <ChatBubble role="agent" streaming={!!live.text}>
                        {live.steps.length > 0 && (
                          <div style={{ marginBottom: live.text ? 10 : 0 }}>
                            <ThinkingSteps steps={live.steps} current={live.text ? live.steps.length : live.steps.length - 1} />
                          </div>
                        )}
                        {live.text && <Markdown text={live.text} />}
                      </ChatBubble>
                    ) : (
                      <ThinkingIndicator label="Lily is thinking" />
                    )}
                  </>
                )}
              </div>
            </div>
            <div style={{ maxWidth: 780, width: "100%", margin: "0 auto", padding: "8px 32px 24px", boxSizing: "border-box" }}>
              <Composer placeholder={thread?.campaign_id ? "Message Lily…" : "Ask Lily anything, or start a campaign: link, budget, goal…"} onSend={send} streaming={!!live} onStop={() => abortRef.current?.abort()} />
            </div>
          </>
        ) : (
          <EmptyState title="No chats yet" description="Start a campaign and Lily will open one." />
        )}
      </div>
    </div>
  );
}

function Turn({ m, campaignId }: { m: ChatMessage; campaignId?: string }) {
  const nav = useNavigate();
  const { data: approvals } = useApprovals();
  const ref = field<any>(m, "ref", null);

  if (m.role === "admin") return <ChatBubble role="user" time={time(m.created_at)}>{m.body}</ChatBubble>;

  if (m.kind === "update") {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Text size="sm" secondary style={{ background: "#f4f4f4", padding: "6px 12px", borderRadius: 999 }}>Lily: {m.body}</Text>
      </div>
    );
  }

  if (m.kind === "steps") {
    const steps: string[] = Array.isArray(ref?.steps) ? ref.steps : m.body.split("\n").filter(Boolean);
    return <ChatBubble role="agent" time={time(m.created_at)}><ThinkingSteps steps={steps} current={steps.length} /></ChatBubble>;
  }

  if (m.kind === "ideas") {
    const cid = ref?.campaign_id ?? campaignId;
    return (
      <ChatBubble role="agent" time={time(m.created_at)}>
        {m.body && <div style={{ marginBottom: 10 }}><Markdown text={m.body} /></div>}
        {cid && <IdeasCard campaignId={cid} />}
      </ChatBubble>
    );
  }

  if (m.kind === "approval") {
    const aid = ref?.approval_id ?? ref?.id;
    const a = approvals?.find((x) => x.id === aid);
    return (
      <ChatBubble role="agent" time={time(m.created_at)}>
        {m.body && <div style={{ marginBottom: 10 }}><Markdown text={m.body} /></div>}
        {a ? (
          <ApprovalCard approval={a} showCampaign onOpenDeal={(dealId) => nav(`/campaigns/${a.campaign_id}?deal=${dealId}`)} />
        ) : aid ? (
          <Text size="sm" muted>Done. Nothing waiting here.</Text>
        ) : null}
      </ChatBubble>
    );
  }

  return (
    <ChatBubble role="agent" time={time(m.created_at)}>
      <Markdown text={m.body} />
    </ChatBubble>
  );
}
