import { useState } from "react";
import { Avatar, Badge, Button, Card, IconButton, Text, TextArea } from "../kit/halaska-kit";
import { useDecideApproval, useDeclineDeal, usePayout } from "../lib/mutations";
import { termsLine, usd } from "../lib/stages";
import { field, type Approval, type Creator, type Deal, type Offer, type Payout, type Submission, type Terms } from "../lib/types";
import VideoRound from "./VideoRound";

const TITLE: Record<Approval["kind"], string> = {
  shortlist: "Shortlist ready",
  deal: "Deal ready",
  video: "Video ready",
  payment: "Payment to approve",
};

/** One card for all four gates. Same action on the campaign page and inline in chat. */
export default function ApprovalCard({ approval, showCampaign, onOpenDeal }: {
  approval: Approval;
  showCampaign?: boolean;
  onOpenDeal?: (dealId: string) => void;
}) {
  const decide = useDecideApproval();
  const payout = usePayout();
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const c = approval.creator;
  const dealId = approval.deal_id ?? approval.deal?.id;

  if (approval.status !== "pending") {
    return (
      <Card padding={14}>
        <Text size="sm" secondary>
          {TITLE[approval.kind]} · {approval.status === "approved"
            ? approval.decided_by === "lily" ? "approved by Lily (autopilot)" : "approved"
            : "you asked for changes"}
        </Text>
      </Card>
    );
  }

  const approve = () => {
    if (approval.kind === "payment") {
      const pid = approval.ref_id ?? (approval.ref as Payout | undefined)?.id;
      if (pid) payout.mutate({ payoutId: pid, action: "approve" });
      return;
    }
    decide.mutate({ approval, decision: "approve" });
  };
  const sendChanges = () => {
    decide.mutate({ approval, decision: "changes", note: note.trim() });
    setAsking(false); setNote("");
  };

  return (
    <Card padding={16}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {c && approval.kind !== "shortlist" && <Avatar name={c.name || c.ig_handle} src={c.avatar_url} size={32} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Text weight="semibold">{TITLE[approval.kind]}</Text>
              <Badge variant="warning">Needs you</Badge>
            </div>
            <Text size="sm" muted as="div">
              {[c && approval.kind !== "shortlist" ? `@${c.ig_handle}` : null, showCampaign ? approval.campaign_title : null].filter(Boolean).join(" · ")}
            </Text>
          </div>
          {dealId && onOpenDeal && approval.kind !== "shortlist" && (
            <Button size="sm" variant="ghost" onClick={() => onOpenDeal(dealId)}>Open</Button>
          )}
        </div>

        <Body approval={approval} onOpenDeal={onOpenDeal} />

        {asking ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <TextArea value={note} onChange={setNote} rows={2}
              placeholder="What should Lily change?" aria-label="Note to Lily" />
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" onClick={sendChanges} disabled={!note.trim()}>Send to Lily</Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={approve} loading={payout.isPending}>
              {approval.kind === "payment" ? "Approve payment" : approval.kind === "shortlist" ? "Approve all" : "Approve"}
            </Button>
            {approval.kind !== "payment" && <Button variant="outline" onClick={() => setAsking(true)}>Ask for changes</Button>}
          </div>
        )}
      </div>
    </Card>
  );
}

function Body({ approval, onOpenDeal }: { approval: Approval; onOpenDeal?: (id: string) => void }) {
  const decline = useDeclineDeal();
  const ref = approval.ref;
  if (!ref) return null;

  if (approval.kind === "deal") {
    const o = ref as Offer;
    const t = field<Terms>(o, "terms", {});
    return <Text size="sm" as="div">{termsLine(t)}</Text>;
  }
  if (approval.kind === "video") return <VideoRound s={ref as Submission} compact />;
  if (approval.kind === "payment") {
    const p = ref as Payout;
    return <Text size="sm" as="div">{usd(p.amount_usd)} for @{approval.creator?.ig_handle}. Nothing moves until you mark it paid.</Text>;
  }
  // shortlist: {deals: [...]} where each item is {deal, creator} or {...deal, creator}
  const rows: { deal: Deal; creator?: Creator }[] = (ref.deals ?? []).map((d: any) => (d.deal ? d : { deal: d, creator: d.creator }));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Text size="sm" secondary as="div" style={{ marginBottom: 6 }}>
        Lily picked {rows.length} creator{rows.length === 1 ? "" : "s"}. Nobody hears from her until you approve.
      </Text>
      {rows.map(({ deal, creator }) => (
        <div key={deal.id} className="hover-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
          <Avatar name={creator?.name || creator?.ig_handle} src={creator?.avatar_url} size={24} />
          <button type="button" onClick={() => onOpenDeal?.(deal.id)}
            style={{ all: "unset", cursor: onOpenDeal ? "pointer" : "default", flex: 1, minWidth: 0 }}>
            <Text size="sm" weight="medium">@{creator?.ig_handle}</Text>{" "}
            <Text size="sm" muted>{deal.latest_action}</Text>
          </button>
          <span className="row-actions">
            <IconButton size={28} label={`Remove @${creator?.ig_handle}`} icon={<span aria-hidden>✕</span>}
              onClick={() => decline.mutate(deal.id)} />
          </span>
        </div>
      ))}
    </div>
  );
}
