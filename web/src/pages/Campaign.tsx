import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Badge, Button, Card, EmptyState, FormDialog, Skeleton, Text, TextInput } from "../kit/halaska-kit";
import CreatorsBoard, { VIEWS, type BoardView } from "../components/campaign/CreatorsBoard";
import Newsfeed from "../components/campaign/Newsfeed";
import CreatorSheet from "../components/CreatorSheet";
import { useAddCreator, useSetAutonomy } from "../lib/mutations";
import { useCampaign } from "../lib/queries";
import { AUTONOMY_LABEL, GATES, usd } from "../lib/stages";
import { useToast } from "../lib/toast";
import { field, type Autonomy, type Brief, type Guardrails } from "../lib/types";

/** /campaigns/:id (Newsfeed) and /campaigns/:id/creators, with a campaign sidebar next to the main one. */
export default function CampaignPage() {
  const { id = "", tab } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const openDeal = params.get("deal");
  const view = (VIEWS.includes(params.get("view") as BoardView) ? params.get("view") : "Kanban") as BoardView;
  const { data, isLoading, isError } = useCampaign(id);
  const setAutonomy = useSetAutonomy(id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  if (isLoading) return <div style={{ padding: 32 }}><Skeleton height={40} /><div style={{ height: 12 }} /><Skeleton height={200} /></div>;
  if (isError || !data) return <EmptyState title="Couldn't load this campaign" description="Is the API running on :4400?" />;

  const c = data.campaign;
  const brief = field<Brief>(c, "brief", {});
  const guard = field<Guardrails>(c, "guardrails", {});
  const title = data.title ?? c.title ?? brief.title ?? c.goal;
  const pending = data.approvals_pending ?? [];
  const active = data.deals.filter((r) => r.deal.stage !== "declined").length;
  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };
  const openSheet = (dealId: string | null) => setParam("deal", dealId);
  const openHandle = data.deals.find((r) => r.deal.id === openDeal)?.creator.ig_handle;
  const isCreators = tab === "creators";

  const NavItem = ({ label, to, here, count }: { label: string; to: string; here: boolean; count?: number; }) => (
    <Button variant={here ? "secondary" : "ghost"} fullWidth onClick={() => nav(to)} style={{ justifyContent: "space-between" }}
      iconRight={count ? <Badge variant={label === "Newsfeed" ? "warning" : "default"}>{count}</Badge> : undefined}>
      {label}
    </Button>
  );

  return (
    <div style={{ display: "flex", height: "100%", minHeight: "100vh" }}>
      <aside style={{ width: 280, flexShrink: 0, borderRight: "1px solid #ececec", background: "#fcfcfb", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 0, height: "100vh" }}>
        <Button variant="ghost" size="sm" onClick={() => nav("/campaigns")} style={{ alignSelf: "flex-start", marginLeft: -6 }}>← Campaigns</Button>
        <div style={{ padding: "8px 4px 16px" }}>
          <Text size="lg" weight="semibold" as="div" style={{ lineHeight: 1.25 }}>{title}</Text>
          <Text size="sm" muted as="div" style={{ marginTop: 4 }}>
            {usd(c.budget_usd)} · <a href={c.product_url} target="_blank" rel="noreferrer">{(() => { try { return new URL(c.product_url).host.replace(/^www\./, ""); } catch { return "product"; } })()} ↗</a>
          </Text>
        </div>
        <NavItem label="Newsfeed" to={`/campaigns/${id}`} here={!isCreators} count={pending.length} />
        <NavItem label="Creators" to={`/campaigns/${id}/creators`} here={isCreators} count={active} />
        <Button variant="ghost" fullWidth onClick={() => nav(`/chat/${c.chat_thread_id}`)} style={{ justifyContent: "flex-start" }}>Chat with Lily</Button>
        <div style={{ flex: 1 }} />
        <Text size="xs" weight="semibold" muted as="div" style={{ textTransform: "uppercase", letterSpacing: 0.4, padding: "0 4px 6px" }}>Lily's autonomy</Text>
        <div role="radiogroup" aria-label="Lily's autonomy" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {(Object.keys(AUTONOMY_LABEL) as Autonomy[]).map((a) => {
            const on = c.autonomy === a;
            return (
              <button key={a} type="button" role="radio" aria-checked={on}
                onClick={() => (a === "full_autopilot" ? toast("Full autopilot is coming soon") : a !== c.autonomy && setAutonomy.mutate(a))}
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 10, background: on ? "#fff" : "transparent", boxShadow: on ? "0 0 0 1px rgba(0,0,0,.08)" : "none", opacity: a === "full_autopilot" ? 0.55 : 1 }}>
                <span aria-hidden style={{ width: 14, height: 14, borderRadius: 7, border: on ? "4.5px solid #171717" : "1.5px solid #bdbdba", boxSizing: "border-box" }} />
                <Text size="sm" weight={on ? "medium" : "regular"}>{AUTONOMY_LABEL[a]}</Text>
                {a === "full_autopilot" && <Text size="xs" muted>Soon</Text>}
              </button>
            );
          })}
        </div>
        <Text size="xs" secondary as="div" style={{ padding: "6px 4px 0" }}>{GATES[c.autonomy].line}</Text>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {c.status === "ideating" ? (
          <div style={{ padding: 28, maxWidth: 640 }}>
            <Card padding={20}>
              <Text weight="semibold" as="div">Lily is drafting 3 ideas</Text>
              <Text size="sm" secondary as="div" style={{ margin: "4px 0 12px" }}>Pick one in the chat and she'll start finding creators.</Text>
              <Button onClick={() => nav(`/chat/${c.chat_thread_id}`)}>Open chat</Button>
            </Card>
          </div>
        ) : isCreators ? (
          <CreatorsBoard rows={data.deals} approvals={pending} view={view} onView={(v) => setParam("view", v === "Kanban" ? null : v)}
            onOpen={openSheet} onAdd={() => setAdding(true)} />
        ) : (
          <Newsfeed data={data} brief={brief} guard={guard} onOpen={openSheet} />
        )}
      </div>

      <AddCreatorDialog open={adding} onClose={() => setAdding(false)} campaignId={id} />
      <CreatorSheet dealId={openDeal} handle={openHandle} onClose={() => openSheet(null)} />
    </div>
  );
}

function AddCreatorDialog({ open, onClose, campaignId }: { open: boolean; onClose: () => void; campaignId: string }) {
  const add = useAddCreator(campaignId);
  const [handle, setHandle] = useState("");
  const [email, setEmail] = useState("");
  const clean = handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
  return (
    <FormDialog open={open} onClose={onClose} title="Add a creator" submitLabel="Add"
      description="Lily treats them as approved by you and reaches out right away."
      onSubmit={() => {
        if (!clean) return;
        add.mutate({ ig_handle: clean, email: email.trim() || undefined }, { onSuccess: () => { setHandle(""); setEmail(""); } });
      }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <TextInput label="Instagram handle" value={handle} onChange={setHandle} placeholder="@anshdixit03" />
        <TextInput label="Email (optional)" value={email} onChange={setEmail} placeholder="name@example.com" type="email" />
      </div>
    </FormDialog>
  );
}
