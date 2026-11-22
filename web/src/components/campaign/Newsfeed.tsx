import { AnimatePresence, motion } from "motion/react";
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { AgentGlyph, Avatar, Badge, Button, Collapsible, Text } from "../../kit/halaska-kit";
import { usePayout } from "../../lib/mutations";
import { useEvents } from "../../lib/queries";
import { usd } from "../../lib/stages";
import type { Brief, CampaignDetail, DealRow, Guardrails, LilyEvent, Payout } from "../../lib/types";
import ApprovalCard from "../ApprovalCard";
import VideoChecklist from "./VideoChecklist";

const dayLabel = (ts: number) => (isToday(ts) ? "Today" : isYesterday(ts) ? "Yesterday" : format(ts, "EEEE, MMM d"));

/** Newsfeed: what needs you first, then everything Lily (and creators) did, newest first, live. */
export default function Newsfeed({ data, brief, guard, onOpen }: {
  data: CampaignDetail; brief: Brief; guard: Guardrails; onOpen: (dealId: string) => void;
}) {
  const c = data.campaign;
  const { data: events } = useEvents(c.id);
  const pending = data.approvals_pending ?? [];
  const byDeal = new Map(data.deals.map((r) => [r.deal.id, r]));
  const feed = [...(events ?? [])].sort((a, b) => b.ts - a.ts);
  const days: [string, LilyEvent[]][] = [];
  for (const e of feed) {
    const d = dayLabel(e.ts);
    const last = days[days.length - 1];
    if (last?.[0] === d) last[1].push(e); else days.push([d, [e]]);
  }

  return (
    <div style={{ maxWidth: 760, padding: "24px 28px 80px", display: "flex", flexDirection: "column", gap: 28 }}>
      <AnimatePresence initial={false}>
        {pending.length > 0 && (
          <motion.section key="needs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Text weight="semibold">Needs you</Text>
            <AnimatePresence initial={false}>
              {pending.map((a) => (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                  <ApprovalCard approval={a} onOpenDeal={onOpen} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>

      {c.status !== "ideating" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Text size="xs" weight="semibold" muted as="div" style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>The idea</Text>
            <Text size="lg" weight="semibold" as="div" style={{ marginTop: 2 }}>{brief.title ?? data.title ?? c.goal}</Text>
            {brief.angle && <Text size="sm" secondary as="div" style={{ marginTop: 2 }}>{brief.angle}</Text>}
          </div>
          {(brief.video_description || brief.creator_profile) && (
            <Collapsible title="The video and who makes it">
              <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingBottom: 6 }}>
                {brief.video_description && <Text size="sm" secondary as="div"><b>The video:</b> {brief.video_description}</Text>}
                {brief.creator_profile && <Text size="sm" secondary as="div"><b>Creators:</b> {brief.creator_profile}</Text>}
              </div>
            </Collapsible>
          )}
          <div>
            <Text size="sm" weight="semibold" as="div">Every video must</Text>
            <Text size="xs" muted as="div" style={{ marginBottom: 4 }}>Lily checks each video against this list before it reaches you.</Text>
            <VideoChecklist campaignId={c.id} rules={brief.video_rules ?? []} />
          </div>
          <Text size="sm" secondary as="div">
            Lily can agree up to {usd(guard.fee_usd?.max)} per creator.{" "}
            {c.autonomy === "human_first" ? "Every deal and every final video comes to you." : "Payments come to you."}
          </Text>
        </section>
      )}

      {!!data.payouts?.length && (
        <section style={{ display: "flex", flexDirection: "column" }}>
          <Text weight="semibold" as="div" style={{ marginBottom: 6 }}>Payments</Text>
          {data.payouts.map((p) => <PayoutRow key={p.id} p={p} row={byDeal.get(p.deal_id)} />)}
          <Text size="xs" muted as="div" style={{ marginTop: 6 }}>No money moves from here. Mark it paid once you've sent it.</Text>
        </section>
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <Text weight="semibold" as="div">What's happening</Text>
        {!feed.length && <Text size="sm" muted>Nothing yet. Lily's updates show up here as she works.</Text>}
        {days.map(([day, items]) => (
          <div key={day}>
            <Text size="xs" weight="semibold" muted as="div" style={{ textTransform: "uppercase", letterSpacing: 0.4, padding: "14px 0 4px" }}>{day}</Text>
            <AnimatePresence initial={false}>
              {items.map((e) => (
                <motion.div key={e.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                  <FeedRow e={e} row={e.deal_id ? byDeal.get(e.deal_id) : undefined} onOpen={onOpen} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </section>
    </div>
  );
}

function FeedRow({ e, row, onOpen }: { e: LilyEvent; row?: DealRow; onOpen: (id: string) => void }) {
  const clickable = !!row;
  const who = e.actor === "lily" ? <AgentGlyph size={26} />
    : e.actor === "creator" && row ? <Avatar name={row.creator.name || row.creator.ig_handle} src={row.creator.avatar_url} size={26} />
    : <Avatar name={e.actor === "admin" ? "You" : "System"} size={26} />;
  return (
    <div onClick={clickable ? () => onOpen(row!.deal.id) : undefined}
      onMouseEnter={(ev) => { if (clickable) ev.currentTarget.style.background = "#f4f4f3"; }}
      onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}
      style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 10px", margin: "0 -10px", borderRadius: 10, cursor: clickable ? "pointer" : "default" }}>
      {who}
      <Text size="sm" as="div" style={{ flex: 1, minWidth: 0 }}>{e.summary}</Text>
      {row && e.actor !== "creator" && <Avatar name={row.creator.name || row.creator.ig_handle} src={row.creator.avatar_url} size={20} />}
      <Text size="xs" muted style={{ flexShrink: 0 }} title={format(e.ts, "PPpp")}>{formatDistanceToNowStrict(e.ts, { addSuffix: true })}</Text>
    </div>
  );
}

function PayoutRow({ p, row }: { p: Payout; row?: DealRow }) {
  const pay = usePayout();
  const cr = row?.creator;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #f0f0f0" }}>
      <Avatar name={cr?.name || cr?.ig_handle} src={cr?.avatar_url} size={28} />
      <Text weight="medium" style={{ flex: 1 }}>@{cr?.ig_handle ?? "creator"}</Text>
      <Text style={{ fontVariantNumeric: "tabular-nums" }}>{usd(p.amount_usd)}</Text>
      {p.status === "pending" && <Button size="sm" loading={pay.isPending} onClick={() => pay.mutate({ payoutId: p.id, action: "approve" })}>Approve payment</Button>}
      {p.status === "approved" && <Button size="sm" variant="outline" loading={pay.isPending} onClick={() => pay.mutate({ payoutId: p.id, action: "paid" })}>Mark paid</Button>}
      {p.status === "paid" && <Badge variant="success">Paid{p.paid_at ? ` · ${format(p.paid_at, "MMM d")}` : ""}</Badge>}
    </div>
  );
}
