import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { format } from "date-fns";
import {
  Avatar, Badge, Button, Card, Collapsible, EmptyState, FormDialog, Heading, SegmentedControl, Skeleton, Text, TextInput,
} from "../kit/halaska-kit";
import ApprovalCard from "../components/ApprovalCard";
import CreatorRow from "../components/CreatorRow";
import CreatorSheet from "../components/CreatorSheet";
import { useAddCreator, usePayout, useSetAutonomy } from "../lib/mutations";
import { useCampaign } from "../lib/queries";
import { AUTONOMY_FROM_LABEL, AUTONOMY_LABEL, GATES, GROUP_LABEL, GROUP_ORDER, usd } from "../lib/stages";
import { useToast } from "../lib/toast";
import { field, type Brief, type DealRow, type Guardrails, type Payout, type Stage } from "../lib/types";

export default function CampaignPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const openDeal = params.get("deal");
  const { data, isLoading, isError } = useCampaign(id);
  const setAutonomy = useSetAutonomy(id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<Stage, DealRow[]>();
    for (const r of data?.deals ?? []) m.set(r.deal.stage, [...(m.get(r.deal.stage) ?? []), r]);
    return GROUP_ORDER.filter((s) => m.has(s)).map((s) => [s, m.get(s)!] as const);
  }, [data?.deals]);

  if (isLoading) return <div style={{ padding: 32 }}><Skeleton height={40} /><div style={{ height: 12 }} /><Skeleton height={200} /></div>;
  if (isError || !data) return <EmptyState title="Couldn't load this campaign" description="Is the API running on :4400?" />;

  const c = data.campaign;
  const brief = field<Brief>(c, "brief", {});
  const guard = field<Guardrails>(c, "guardrails", {});
  const title = data.title ?? c.title ?? brief.title ?? c.goal;
  const pending = data.approvals_pending ?? [];
  const select = (dealId: string | null) => setParams(dealId ? { deal: dealId } : {}, { replace: true });
  const openHandle = data.deals.find((r) => r.deal.id === openDeal)?.creator.ig_handle;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 24px 80px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <Heading level={2}>{title}</Heading>
            <Text size="sm" muted as="div">
              {usd(c.budget_usd)} budget · <a href={c.product_url} target="_blank" rel="noreferrer">{(() => { try { return new URL(c.product_url).host; } catch { return c.product_url; } })()} ↗</a>
            </Text>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={() => nav(`/chat/${c.chat_thread_id}`)}>Chat</Button>
            {c.status !== "ideating" && <Button variant="outline" onClick={() => setAdding(true)}>Add creator</Button>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ width: 400, maxWidth: "100%" }}>
            <SegmentedControl
              options={Object.values(AUTONOMY_LABEL)}
              value={AUTONOMY_LABEL[c.autonomy]}
              onChange={(label: string) => {
                const a = AUTONOMY_FROM_LABEL[label];
                if (a === "full_autopilot") return toast("Full autopilot is coming soon");
                if (a !== c.autonomy) setAutonomy.mutate(a);
              }}
            />
          </div>
          <Text size="sm" secondary>{GATES[c.autonomy].line}</Text>
        </div>
      </div>

      {c.status === "ideating" ? (
        <Card padding={20}>
          <Text weight="semibold" as="div">Lily is drafting 3 ideas</Text>
          <Text size="sm" secondary as="div" style={{ margin: "4px 0 12px" }}>Pick one in the chat and she'll start finding creators.</Text>
          <Button onClick={() => nav(`/chat/${c.chat_thread_id}`)}>Open chat</Button>
        </Card>
      ) : (
        <Card padding={16}>
          <Collapsible title={`Brief · ${brief.title ?? title}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 6 }}>
              {brief.angle && <Text size="sm" as="div">{brief.angle}</Text>}
              {brief.video_description && <Text size="sm" secondary as="div"><b>The video:</b> {brief.video_description}</Text>}
              {brief.creator_profile && <Text size="sm" secondary as="div"><b>Creators:</b> {brief.creator_profile}</Text>}
              {!!brief.video_rules?.length && (
                <div>
                  <Text size="sm" weight="medium" as="div">Video rules</Text>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {brief.video_rules.map((r, i) => <li key={i}><Text size="sm">{r}</Text></li>)}
                  </ul>
                </div>
              )}
            </div>
          </Collapsible>
          <Text size="sm" secondary as="div">
            Lily can agree up to {usd(guard.fee_usd?.max)} per creator.{" "}
            {c.autonomy === "human_first" ? "Every deal and every final video comes to you." : "Payments come to you."}
          </Text>
        </Card>
      )}

      {/* Needs you */}
      <AnimatePresence initial={false}>
        {pending.length > 0 && (
          <motion.section key="needs" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
            style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Text weight="semibold">Needs you</Text>
            <AnimatePresence initial={false}>
              {pending.map((a) => (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
                  <ApprovalCard approval={a} onOpenDeal={select} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Creators by stage */}
      {c.status !== "ideating" && (
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Text weight="semibold">Creators in this campaign</Text>
          {!groups.length ? (
            <Text size="sm" muted>Lily is looking for creators. They'll show up here as she finds them.</Text>
          ) : (
            <LayoutGroup>
              {groups.map(([stage, rows]) => {
                const body = rows.map((r) => (
                  <motion.div key={r.deal.id} layoutId={r.deal.id} layout="position">
                    <CreatorRow row={r} onOpen={() => select(r.deal.id)} />
                  </motion.div>
                ));
                return stage === "declined" ? (
                  <div key={stage} style={{ marginTop: 8 }}>
                    <Collapsible title={`${GROUP_LABEL[stage]} (${rows.length})`}>{body}</Collapsible>
                  </div>
                ) : (
                  <div key={stage} style={{ marginTop: 8 }}>
                    <Text size="xs" weight="semibold" muted as="div" style={{ textTransform: "uppercase", letterSpacing: 0.4, padding: "4px 12px" }}>
                      {GROUP_LABEL[stage]} · {rows.length}
                    </Text>
                    {body}
                  </div>
                );
              })}
            </LayoutGroup>
          )}
        </section>
      )}

      {/* Payments */}
      {!!data.payouts?.length && (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Text weight="semibold">Payments</Text>
          <Card padding={6}>
            {data.payouts.map((p) => <PayoutRow key={p.id} p={p} row={data.deals.find((r) => r.deal.id === p.deal_id)} />)}
          </Card>
          <Text size="xs" muted>No money moves from here. Mark it paid once you've sent it.</Text>
        </section>
      )}

      <AddCreatorDialog open={adding} onClose={() => setAdding(false)} campaignId={id} />
      <CreatorSheet dealId={openDeal} handle={openHandle} onClose={() => select(null)} />
    </div>
  );
}

function PayoutRow({ p, row }: { p: Payout; row?: DealRow }) {
  const pay = usePayout();
  const cr = row?.creator;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
      <Avatar name={cr?.name || cr?.ig_handle} src={cr?.avatar_url} size={28} />
      <Text weight="medium" style={{ flex: 1 }}>@{cr?.ig_handle ?? "creator"}</Text>
      <Text style={{ fontVariantNumeric: "tabular-nums" }}>{usd(p.amount_usd)}</Text>
      {p.status === "pending" && (
        <Button size="sm" loading={pay.isPending} onClick={() => pay.mutate({ payoutId: p.id, action: "approve" })}>Approve payment</Button>
      )}
      {p.status === "approved" && (
        <Button size="sm" variant="outline" loading={pay.isPending} onClick={() => pay.mutate({ payoutId: p.id, action: "paid" })}>Mark paid</Button>
      )}
      {p.status === "paid" && <Badge variant="success">Paid{p.paid_at ? ` · ${format(p.paid_at, "MMM d")}` : ""}</Badge>}
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
