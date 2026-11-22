import { useNavigate } from "react-router";
import { Badge, Button, EmptyState, Skeleton, Text } from "../kit/halaska-kit";
import { useCampaigns } from "../lib/queries";
import { AUTONOMY_LABEL, GROUP_ORDER, STAGE_LABEL, usd } from "../lib/stages";
import { field, type Stage } from "../lib/types";

export default function Campaigns() {
  const nav = useNavigate();
  const { data, isLoading } = useCampaigns();
  return (
    <div style={{ padding: "28px 32px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h1 className="page-title">Campaigns</h1>
          <Text size="sm" secondary as="div">What Lily is running for you.</Text>
        </div>
        <Button onClick={() => nav("/onboarding")}>New campaign</Button>
      </div>
      {isLoading ? <Skeleton height={240} /> : !data?.length ? (
        <EmptyState title="No campaigns yet" description="Give Lily a budget, a product link and a goal."
          action={<Button onClick={() => nav("/onboarding")}>Start with Lily</Button>} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 18 }}>
          {data.map((r) => {
            const c = r.campaign;
            const title = r.title ?? c.title ?? c.goal;
            const product = field<{ title?: string; images?: string[] }>(c, "product", {});
            const img = product.images?.[0];
            const counts = GROUP_ORDER.filter((s) => s !== "declined" && r.stage_counts?.[s])
              .map((s: Stage) => `${r.stage_counts[s]} ${STAGE_LABEL[s].toLowerCase()}`).join(" · ");
            return (
              <button key={c.id} type="button" onClick={() => nav(`/campaigns/${c.id}`)} className="lift"
                style={{ all: "unset", cursor: "pointer", borderRadius: 18, overflow: "hidden", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)" }}>
                <div style={{ position: "relative", aspectRatio: "16 / 9", background: "linear-gradient(135deg, #f1efe9, #e4e1d8)" }}>
                  {img && <img src={img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                  {!img && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#8b8676", fontWeight: 600, fontSize: 18, padding: 20, textAlign: "center" }}>{product.title ?? title}</div>}
                  {r.needs_you > 0 && <div style={{ position: "absolute", top: 12, right: 12 }}><Badge variant="warning">{r.needs_you} need{r.needs_you === 1 ? "s" : ""} you</Badge></div>}
                </div>
                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 4 }}>
                  <Text weight="semibold" as="div" truncate>{title}</Text>
                  <Text size="sm" muted as="div">{usd(c.budget_usd)} · {AUTONOMY_LABEL[c.autonomy]}</Text>
                  <Text size="sm" secondary as="div" truncate>
                    {counts || (c.status === "ideating" ? "Picking an idea with Lily" : "Lily is finding creators")}
                  </Text>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
