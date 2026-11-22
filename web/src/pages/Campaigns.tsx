import { useNavigate } from "react-router";
import { Badge, Button, Card, EmptyState, Heading, ListItem, Skeleton, StatusBadge } from "../kit/halaska-kit";
import { useCampaigns } from "../lib/queries";
import { AUTONOMY_LABEL, GROUP_ORDER, STAGE_LABEL, usd } from "../lib/stages";
import type { Stage } from "../lib/types";

export default function Campaigns() {
  const nav = useNavigate();
  const { data, isLoading } = useCampaigns();
  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Heading level={2}>Campaigns</Heading>
        <Button onClick={() => nav("/onboarding")}>New campaign</Button>
      </div>
      {isLoading ? <Skeleton height={64} /> : !data?.length ? (
        <EmptyState title="No campaigns yet" description="Give Lily a budget, a product link and a goal."
          action={<Button onClick={() => nav("/onboarding")}>Start with Lily</Button>} />
      ) : (
        <Card padding={6}>
          {data.map((r, i) => {
            const c = r.campaign;
            const title = r.title ?? c.title ?? c.goal;
            const counts = GROUP_ORDER.filter((s) => r.stage_counts?.[s])
              .map((s: Stage) => `${r.stage_counts[s]} ${STAGE_LABEL[s].toLowerCase()}`).join(" · ");
            return (
              <ListItem key={c.id} divider={i < data.length - 1} onClick={() => nav(`/campaigns/${c.id}`)}
                title={title}
                subtitle={[usd(c.budget_usd), AUTONOMY_LABEL[c.autonomy], counts || (c.status === "ideating" ? "Picking an idea" : "No creators yet")].join(" · ")}
                right={
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {r.needs_you > 0 && <Badge variant="warning">{r.needs_you} need{r.needs_you === 1 ? "s" : ""} you</Badge>}
                    <StatusBadge status={c.status === "active" ? "online" : c.status === "ideating" ? "pending" : "offline"}>{c.status}</StatusBadge>
                  </div>
                } />
            );
          })}
        </Card>
      )}
    </div>
  );
}
