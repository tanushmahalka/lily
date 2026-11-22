import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChatHistory, ChatInput, Conversation, EmptyState, Message, Text, ThinkingSteps } from "../kit/halaska-kit";
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

  // /chat → newest campaign thread (or General)
  useEffect(() => {
    if (!threadId && threads?.length) {
      const first = [...threads].sort((a, b) => (b.last_at ?? b.created_at) - (a.last_at ?? a.created_at))[0];
      nav(`/chat/${first.id}`, { replace: true });
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
  const h = vh - 32;

  return (
    <div style={{ display: "flex", gap: 16, padding: 16, height: "100vh" }}>
      <ChatHistory
        threads={(threads ?? []).map((t: ChatThread) => ({
          id: t.id, title: t.title, preview: t.preview, time: new Date(t.last_at ?? t.updated_at ?? t.created_at),
        }))}
        activeId={threadId}
        onSelect={(id: string) => nav(`/chat/${id}`)}
        title="Chats"
        width={260}
        height={h}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {threadId ? (
          <>
            <Text weight="semibold" as="div" style={{ padding: "4px 4px 0" }}>{thread?.title ?? "Lily"}</Text>
            <Conversation height={h - 150} frame typing={!!live && !live.text && !live.steps.length} typingLabel="Lily is thinking"
              emptyState={<EmptyState title="Say hi to Lily" description="Ask how a campaign is going, or tell her what to do." />}>
              {list.length || live ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {list.map((m) => <Turn key={m.id} m={m} campaignId={thread?.campaign_id ?? undefined} />)}
                  {live && (
                    <>
                      <Message role="user" name="You" text={live.admin} status="sending" />
                      {(live.steps.length > 0 || live.text) && (
                        <Message role="agent" name="Lily" streaming={!!live.text}>
                          {live.steps.length > 0 && (
                            <div style={{ marginBottom: live.text ? 10 : 0 }}>
                              <ThinkingSteps steps={live.steps} current={live.text ? live.steps.length : live.steps.length - 1} />
                            </div>
                          )}
                          {live.text && <Markdown text={live.text} />}
                        </Message>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </Conversation>
            <ChatInput
              placeholder="Message Lily…"
              suggestions={[]}
              models={[]}
              onSubmit={send}
              streaming={!!live}
              onStop={() => abortRef.current?.abort()}
            />
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

  if (m.role === "admin") return <Message role="user" name="You" text={m.body} time={time(m.created_at)} />;

  if (m.kind === "update") {
    return (
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Text size="sm" secondary style={{ background: "#f4f4f4", padding: "6px 12px", borderRadius: 999 }}>Lily: {m.body}</Text>
      </div>
    );
  }

  if (m.kind === "steps") {
    const steps: string[] = Array.isArray(ref?.steps) ? ref.steps : m.body.split("\n").filter(Boolean);
    return <Message role="agent" name="Lily" time={time(m.created_at)}><ThinkingSteps steps={steps} current={steps.length} /></Message>;
  }

  if (m.kind === "ideas") {
    const cid = ref?.campaign_id ?? campaignId;
    return (
      <Message role="agent" name="Lily" time={time(m.created_at)}>
        {m.body && <div style={{ marginBottom: 10 }}><Markdown text={m.body} /></div>}
        {cid && <IdeasCard campaignId={cid} />}
      </Message>
    );
  }

  if (m.kind === "approval") {
    const aid = ref?.approval_id ?? ref?.id;
    const a = approvals?.find((x) => x.id === aid);
    return (
      <Message role="agent" name="Lily" time={time(m.created_at)}>
        {m.body && <div style={{ marginBottom: 10 }}><Markdown text={m.body} /></div>}
        {a ? (
          <ApprovalCard approval={a} showCampaign onOpenDeal={(dealId) => nav(`/campaigns/${a.campaign_id}?deal=${dealId}`)} />
        ) : aid ? (
          <Text size="sm" muted>Done. Nothing waiting here.</Text>
        ) : null}
      </Message>
    );
  }

  return (
    <Message role="agent" name="Lily" time={time(m.created_at)}>
      <Markdown text={m.body} />
    </Message>
  );
}
