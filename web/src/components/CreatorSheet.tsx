import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Avatar, Badge, Button, Divider, Sheet, Skeleton, StatusBadge, Text, TextArea } from "../kit/halaska-kit";
import { sendToLily } from "../lib/chatStream";
import { qk, useDealContext } from "../lib/queries";
import { compact, STAGE_LABEL, STAGE_STATUS, termsLine } from "../lib/stages";
import { useToast } from "../lib/toast";
import { field, type Account, type DealContext, type Terms } from "../lib/types";
import AfterPosting from "./AfterPosting";
import ApprovalCard from "./ApprovalCard";
import ConversationLog from "./ConversationLog";
import VideoRound from "./VideoRound";

const FIT: Record<string, ["success" | "accent" | "warning" | "danger", string]> = {
  great: ["success", "Great fit"], good: ["accent", "Good fit"], weak: ["warning", "Weak fit"], excluded: ["danger", "Excluded"],
};

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <Text size="xs" weight="semibold" muted style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</Text>
      {children}
    </section>
  );
}

export function speaksAsFor(accounts: Account[] | undefined, brandName?: string) {
  return (ch: "instagram" | "email") => {
    const a = accounts?.find((x) => x.channel === ch);
    const s = a?.speaks_as ?? (ch === "instagram" ? "Tanush" : "Lily");
    return s.replace("{brand}", brandName || "the brand");
  };
}

/** The deal sheet on the campaign page. Title starts with "@" so index.css widens the kit Sheet. */
export default function CreatorSheet({ dealId, handle, onClose }: { dealId: string | null; handle?: string; onClose: () => void }) {
  const { data, isLoading } = useDealContext(dealId);
  const title = data?.creator ? `@${data.creator.ig_handle}` : handle ? `@${handle}` : "@";
  return (
    <Sheet open={!!dealId} onClose={onClose} title={title}>
      {isLoading || !data ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={40} /><Skeleton height={120} /><Skeleton height={200} />
        </div>
      ) : (
        <DealBody ctx={data} />
      )}
    </Sheet>
  );
}

function DealBody({ ctx }: { ctx: DealContext }) {
  const { deal, creator, analysis, reels, offers, messages, submissions, approvals } = ctx;
  const reasons = field<string[]>(analysis, "reasons", []);
  const fit = analysis ? FIT[analysis.fit] : null;
  const speaksAs = speaksAsFor(ctx.accounts, ctx.brand?.name);
  const pending = approvals.filter((a) => a.status === "pending");
  const lilyDecided = approvals.filter((a) => a.status !== "pending" && a.decided_by === "lily");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, paddingBottom: 40 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Avatar name={creator.name || creator.ig_handle} src={creator.avatar_url} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text weight="semibold" as="div">{creator.name || `@${creator.ig_handle}`}</Text>
          <Text size="sm" muted as="div">
            {[creator.followers != null ? `${compact(creator.followers)} followers` : null, creator.niche,
              <a key="ig" href={`https://instagram.com/${creator.ig_handle}`} target="_blank" rel="noreferrer">Instagram ↗</a>]
              .filter(Boolean).reduce<ReactNode[]>((acc, x, i) => (i ? [...acc, " · ", x] : [x]), [])}
          </Text>
        </div>
        <StatusBadge status={STAGE_STATUS[deal.stage]}>{STAGE_LABEL[deal.stage]}</StatusBadge>
      </div>
      {deal.latest_action && <Text size="sm" secondary as="div">Lily: {deal.latest_action}</Text>}

      {pending.map((a) => (
        <ApprovalCard key={a.id} approval={{
          ...a, creator: a.creator ?? creator, deal: a.deal ?? deal,
          // context approvals may be raw rows: resolve ref from the file itself
          ref: a.ref ?? (a.kind === "deal" ? offers.find((o) => o.id === a.ref_id) : a.kind === "video" ? submissions.find((s) => s.id === a.ref_id) : undefined),
        }} />
      ))}

      <Section title={deal.source === "manual" ? "Added by you" : "Why Lily picked them"}>
        {fit && <div><Badge variant={fit[0]}>{fit[1]}</Badge></div>}
        {reasons.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {reasons.map((r, i) => <li key={i}><Text size="sm">{r}</Text></li>)}
          </ul>
        )}
        {!fit && !reasons.length && <Text size="sm" muted>Lily is looking at their reels.</Text>}
        {reels.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            {reels.slice(0, 3).map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer" title={r.caption}
                style={{ position: "relative", width: 110, aspectRatio: "9 / 16", borderRadius: 10, overflow: "hidden", background: "#eee", display: "block" }}>
                {r.thumbnail_url && <img src={r.thumbnail_url} alt={r.caption || "Reel"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                {r.views != null && (
                  <span style={{ position: "absolute", left: 6, bottom: 6, color: "#fff", fontSize: 11, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
                    ▶ {compact(r.views)}
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </Section>

      <Divider />
      <Section title="Conversation">
        <ConversationLog messages={messages} creatorName={creator.name || `@${creator.ig_handle}`} speaksAs={speaksAs} />
        <TellLily threadId={ctx.campaign.chat_thread_id} handle={creator.ig_handle} />
      </Section>

      {offers.length > 0 && (
        <>
          <Divider />
          <Section title="Offers">
            {[...offers].sort((a, b) => b.version - a.version).map((o) => {
              const t = field<Terms>(o, "terms", {});
              const v = field<string[]>(o, "violations", []);
              return (
                <div key={o.id} style={{ opacity: o.status === "superseded" ? 0.6 : 1 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <Text size="sm" weight="medium">v{o.version} · {o.by === "lily" ? "Lily" : `@${creator.ig_handle}`}</Text>
                    <Badge variant={o.status === "accepted" ? "success" : o.status === "open" ? "accent" : "default"}>{o.status}</Badge>
                    {o.within_guardrails ? <Badge variant="success">Within limits</Badge> : <Badge variant="warning">Outside limits</Badge>}
                    <Text size="xs" muted>{format(o.created_at, "MMM d")}</Text>
                  </div>
                  <Text size="sm" secondary as="div">{termsLine(t)}</Text>
                  {v.length > 0 && <Text size="xs" muted as="div">{v.join(" · ")}</Text>}
                </div>
              );
            })}
          </Section>
        </>
      )}

      {submissions.length > 0 && (
        <>
          <Divider />
          <Section title="Video">
            {[...submissions].sort((a, b) => b.round - a.round).map((s) => <VideoRound key={s.id} s={s} />)}
          </Section>
        </>
      )}

      {deal.stage === "completed" && (
        <>
          <Divider />
          <Section title="After posting"><AfterPosting dealId={deal.id} /></Section>
        </>
      )}

      {lilyDecided.length > 0 && (
        <Text size="xs" muted as="div">
          {lilyDecided.map((a) => `${a.kind[0].toUpperCase()}${a.kind.slice(1)} approved by Lily (autopilot)`).join(" · ")}
        </Text>
      )}
    </div>
  );
}

/** Posts "About @handle: …" to the campaign's chat thread. The reply lands in Chat. */
function TellLily({ threadId, handle }: { threadId: string; handle: string }) {
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const toast = useToast();
  const send = () => {
    const body = `About @${handle}: ${text.trim()}`;
    setText("");
    toast("Sent to Lily. Her reply is in Chat.", "success");
    sendToLily(threadId, body, { onDone: () => qc.invalidateQueries({ queryKey: qk.threadMessages(threadId) }) })
      .catch((e) => { toast(e.message, "danger"); setText(body.replace(`About @${handle}: `, "")); });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <TextArea value={text} onChange={setText} rows={2} placeholder="Tell Lily… (e.g. offer $50 more, or ask for a second video)" aria-label="Tell Lily" />
      <div><Button size="sm" variant="secondary" disabled={!text.trim()} onClick={send}>Send to Lily</Button></div>
    </div>
  );
}
