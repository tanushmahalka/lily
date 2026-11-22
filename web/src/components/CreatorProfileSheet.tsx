import { useNavigate } from "react-router";
import { Avatar, ListItem, Sheet, StatusBadge, Text } from "../kit/halaska-kit";
import { useCreator } from "../lib/queries";
import { compact, STAGE_LABEL, STAGE_STATUS } from "../lib/stages";
import type { CreatorListRow, Stage } from "../lib/types";
import { Section } from "./CreatorSheet";

/** Creators page sheet: who they are and every campaign they've been part of. */
export default function CreatorProfileSheet({ row, onClose }: { row: CreatorListRow | null; onClose: () => void }) {
  const nav = useNavigate();
  const { data } = useCreator(row?.id);
  const c = { ...(row ?? {}), ...(data?.creator ?? data ?? {}) } as CreatorListRow;
  // list rows carry deals as {deal_id, campaign_id, campaign_title, stage}; the detail may carry richer rows
  const deals: { deal_id: string; campaign_id: string; campaign_title?: string; stage: Stage; latest_action?: string; agreed_fee_usd?: number }[] =
    (data?.deals ?? row?.deals ?? []).map((d: any) => ({
      deal_id: d.deal_id ?? d.id ?? d.deal?.id,
      campaign_id: d.campaign_id ?? d.deal?.campaign_id,
      campaign_title: d.campaign_title ?? d.title ?? row?.deals?.find((x) => x.deal_id === (d.deal_id ?? d.id))?.campaign_title,
      stage: d.stage ?? d.deal?.stage,
      latest_action: d.latest_action ?? d.deal?.latest_action,
      agreed_fee_usd: d.agreed_fee_usd ?? d.deal?.agreed_fee_usd,
    }));
  return (
    <Sheet open={!!row} onClose={onClose} title={row ? `@${row.ig_handle}` : "@"}>
      {row && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Avatar name={c.name || c.ig_handle} src={c.avatar_url} size={48} />
            <div>
              <Text weight="semibold" as="div">{c.name || `@${c.ig_handle}`}</Text>
              <Text size="sm" muted as="div">
                {[c.followers != null ? `${compact(c.followers)} followers` : null, c.niche, c.email].filter(Boolean).join(" · ")}
              </Text>
            </div>
          </div>
          {c.bio && <Text size="sm" secondary as="div">{c.bio}</Text>}
          {c.lily_note && <Text size="sm" as="div">Lily: {c.lily_note}</Text>}
          <Section title="Campaigns">
            {!deals.length ? <Text size="sm" muted>Not in a campaign yet.</Text> : deals.map((d, i) => (
              <ListItem key={d.deal_id ?? i} divider={i < deals.length - 1}
                onClick={d.campaign_id ? () => { onClose(); nav(`/campaigns/${d.campaign_id}?deal=${d.deal_id}`); } : undefined}
                title={d.campaign_title ?? "Campaign"}
                subtitle={d.latest_action}
                right={d.stage ? <StatusBadge status={STAGE_STATUS[d.stage]}>{STAGE_LABEL[d.stage]}</StatusBadge> : null} />
            ))}
          </Section>
        </div>
      )}
    </Sheet>
  );
}
