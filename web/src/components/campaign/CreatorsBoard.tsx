import { useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { Avatar, Badge, Button, SegmentedControl, StatusBadge, Text } from "../../kit/halaska-kit";
import { useDecideApproval } from "../../lib/mutations";
import { STAGE_LABEL, STAGE_STATUS, usd } from "../../lib/stages";
import { field, type Approval, type DealRow, type Stage } from "../../lib/types";
import PhotoCard from "../PhotoCard";

export type BoardView = "Kanban" | "Cards" | "List";
export const VIEWS: BoardView[] = ["Kanban", "Cards", "List"];

const COLUMNS: { label: string; stages: Stage[] }[] = [
  { label: "Shortlisted", stages: ["shortlisted"] },
  { label: "Reaching out", stages: ["reached_out", "talking"] },
  { label: "Negotiating", stages: ["negotiating"] },
  { label: "Needs your OK", stages: ["deal_ready", "video_ready"] },
  { label: "Making the video", stages: ["awaiting_video", "video_feedback"] },
  { label: "Done", stages: ["completed"] },
  { label: "Didn't work out", stages: ["declined"] },
];
const ORDER = COLUMNS.flatMap((c) => c.stages);

const FIT: Record<string, "success" | "accent" | "warning" | "danger"> = { great: "success", good: "accent", weak: "warning", excluded: "danger" };

interface Props {
  rows: DealRow[];
  approvals: Approval[];
  view: BoardView;
  onView: (v: BoardView) => void;
  onOpen: (dealId: string) => void;
  onAdd: () => void;
}

/** Creators in a campaign: Kanban (default), photo Cards, or a List. Approve right on the card. */
export default function CreatorsBoard({ rows, approvals, view, onView, onOpen, onAdd }: Props) {
  const byDeal = new Map(approvals.filter((a) => a.deal_id).map((a) => [a.deal_id!, a]));
  const shortlist = approvals.find((a) => a.kind === "shortlist");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "20px 28px 16px" }}>
        <div>
          <Text size="lg" weight="semibold" as="div">Creators</Text>
          <Text size="sm" muted as="div">{rows.filter((r) => r.deal.stage !== "declined").length} in this campaign</Text>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 240 }}><SegmentedControl options={VIEWS} value={view} onChange={onView} /></div>
          <Button variant="outline" onClick={onAdd}>Add creator</Button>
        </div>
      </div>
      {!rows.length ? (
        <Text size="sm" muted as="div" style={{ padding: "0 28px" }}>Lily is looking for creators. They'll show up here as she finds them.</Text>
      ) : view === "Kanban" ? (
        <Kanban rows={rows} byDeal={byDeal} shortlist={shortlist} onOpen={onOpen} />
      ) : view === "Cards" ? (
        <Cards rows={rows} byDeal={byDeal} onOpen={onOpen} />
      ) : (
        <List rows={rows} byDeal={byDeal} onOpen={onOpen} />
      )}
    </div>
  );
}

/** Inline approve for a deal/video gate; Review opens the big sheet. */
function QuickApprove({ approval, onOpen }: { approval?: Approval; onOpen: () => void }) {
  const decide = useDecideApproval();
  if (!approval || (approval.kind !== "deal" && approval.kind !== "video")) return null;
  const fee = approval.kind === "deal" ? field<{ fee_usd?: number }>(approval.ref, "terms", {}).fee_usd : undefined;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Text size="xs" muted as="div">{approval.kind === "deal" ? `Deal at ${usd(fee)} is ready` : "Final video is ready"}</Text>
      <div style={{ display: "flex", gap: 6 }}>
        <Button size="sm" onClick={() => decide.mutate({ approval, decision: "approve" })}>Approve</Button>
        <Button size="sm" variant="ghost" onClick={onOpen}>Review</Button>
      </div>
    </div>
  );
}

function Kanban({ rows, byDeal, shortlist, onOpen }: {
  rows: DealRow[]; byDeal: Map<string, Approval>; shortlist?: Approval; onOpen: (id: string) => void;
}) {
  const decide = useDecideApproval();
  const [showDeclined, setShowDeclined] = useState(false);
  const cols = COLUMNS.filter((c) => c.stages[0] !== "declined" || rows.some((r) => r.deal.stage === "declined"));
  return (
    <LayoutGroup>
      <div style={{ flex: 1, minHeight: 0, overflowX: "auto", display: "flex", gap: 14, padding: "0 28px 28px", alignItems: "flex-start" }}>
        {cols.map((col) => {
          const items = rows.filter((r) => col.stages.includes(r.deal.stage));
          const declined = col.stages[0] === "declined";
          const needs = col.label === "Needs your OK" && items.length > 0;
          return (
            <section key={col.label} style={{
              width: declined && !showDeclined ? 180 : 244, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
              background: needs ? "#fff8eb" : "#f3f3f2", borderRadius: 18, padding: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px" }}>
                <Text size="sm" weight="semibold">{col.label} <Text size="sm" muted>{items.length}</Text></Text>
                {declined && (
                  <Button size="sm" variant="ghost" onClick={() => setShowDeclined((s) => !s)}>{showDeclined ? "Hide" : "Show"}</Button>
                )}
              </div>
              {col.stages[0] === "shortlisted" && shortlist && items.length > 0 && (
                <Button size="sm" fullWidth onClick={() => decide.mutate({ approval: shortlist, decision: "approve" })}>
                  Approve shortlist · start outreach
                </Button>
              )}
              {(!declined || showDeclined) && items.map((r) => (
                <motion.div key={r.deal.id} layoutId={r.deal.id} layout="position">
                  <PhotoCard
                    creator={r.creator}
                    stage={col.stages.length > 1 ? r.deal.stage : undefined}
                    ratio="16 / 10"
                    dim={declined}
                    onOpen={() => onOpen(r.deal.id)}
                    line={r.deal.latest_action}
                    footer={<QuickApprove approval={byDeal.get(r.deal.id)} onOpen={() => onOpen(r.deal.id)} />}
                  />
                </motion.div>
              ))}
              {!items.length && <Text size="xs" muted as="div" style={{ padding: "6px 4px 10px" }}>Nobody here yet</Text>}
            </section>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

function Cards({ rows, byDeal, onOpen }: { rows: DealRow[]; byDeal: Map<string, Approval>; onOpen: (id: string) => void }) {
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.deal.stage) - ORDER.indexOf(b.deal.stage));
  return (
    <div style={{ padding: "0 28px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, overflowY: "auto" }}>
      {sorted.map((r) => (
        <motion.div key={r.deal.id} layout>
          <PhotoCard creator={r.creator} stage={r.deal.stage} dim={r.deal.stage === "declined"} onOpen={() => onOpen(r.deal.id)}
            line={r.deal.latest_action} footer={<QuickApprove approval={byDeal.get(r.deal.id)} onOpen={() => onOpen(r.deal.id)} />} />
        </motion.div>
      ))}
    </div>
  );
}

function List({ rows, byDeal, onOpen }: { rows: DealRow[]; byDeal: Map<string, Approval>; onOpen: (id: string) => void }) {
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.deal.stage) - ORDER.indexOf(b.deal.stage));
  const grid = "minmax(200px, 1.2fr) 150px minmax(220px, 2fr) 80px 90px 170px";
  const head = { fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" as const, color: "#8a8a8a" };
  return (
    <div style={{ overflow: "auto", padding: "0 0 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: 16, padding: "8px 28px", borderBottom: "1px solid #ececec", ...head }}>
        <span>Creator</span><span>Stage</span><span>Lily's latest</span><span>Fit</span><span>Fee</span><span />
      </div>
      {sorted.map((r) => {
        const a = byDeal.get(r.deal.id);
        return (
          <div key={r.deal.id} onClick={() => onOpen(r.deal.id)} className="hover-row"
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f6f6f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            style={{ display: "grid", gridTemplateColumns: grid, gap: 16, alignItems: "center", padding: "10px 28px", borderBottom: "1px solid #f1f1f1", cursor: "pointer", opacity: r.deal.stage === "declined" ? 0.55 : 1 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
              <Avatar name={r.creator.name || r.creator.ig_handle} src={r.creator.avatar_url} size={32} />
              <Text weight="medium" truncate>@{r.creator.ig_handle}</Text>
            </div>
            <div><StatusBadge status={STAGE_STATUS[r.deal.stage]}>{STAGE_LABEL[r.deal.stage]}</StatusBadge></div>
            <Text size="sm" secondary truncate as="div">{r.deal.latest_action || "—"}</Text>
            <div>{r.analysis ? <Badge variant={FIT[r.analysis.fit]}>{r.analysis.fit}</Badge> : <Text size="sm" muted>—</Text>}</div>
            <Text size="sm">{usd(r.deal.agreed_fee_usd)}</Text>
            <div onClick={(e) => e.stopPropagation()}><QuickApprove approval={a} onOpen={() => onOpen(r.deal.id)} /></div>
          </div>
        );
      })}
    </div>
  );
}
