import { useMemo, useState } from "react";
import { Avatar, Card, EmptyState, Heading, SearchInput, Skeleton, Tag, Text } from "../kit/halaska-kit";
import CreatorProfileSheet from "../components/CreatorProfileSheet";
import { useCreators } from "../lib/queries";
import { compact, STAGE_LABEL } from "../lib/stages";
import type { CreatorListRow } from "../lib/types";

export default function Creators() {
  const { data, isLoading } = useCreators();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<CreatorListRow | null>(null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@/, "");
    return (data ?? []).filter((c) => !s || [c.ig_handle, c.name, c.niche].some((x) => x?.toLowerCase().includes(s)));
  }, [data, q]);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <Heading level={2}>Creators</Heading>
          <Text size="sm" secondary as="div">Everyone Lily has shortlisted or worked with. She checks this list first on every new campaign.</Text>
        </div>
        <div style={{ width: 240 }}><SearchInput value={q} onChange={setQ} placeholder="Search creators" shortcut="" /></div>
      </div>
      {isLoading ? <Skeleton height={64} /> : !rows.length ? (
        <EmptyState title={q ? "No one matches" : "No creators yet"} description={q ? "Try another name." : "Lily adds creators here as she finds them."} />
      ) : (
        <Card padding={6}>
          {rows.map((c, i) => (
            <button key={c.id} type="button" onClick={() => setOpen(c)}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderRadius: 10, borderBottom: i < rows.length - 1 ? "1px solid #f0f0f0" : "none" }}>
              <Avatar name={c.name || c.ig_handle} src={c.avatar_url} size={36} />
              <div style={{ width: 200, flexShrink: 0, minWidth: 0 }}>
                <Text weight="medium" truncate as="div">@{c.ig_handle}</Text>
                <Text size="xs" muted truncate as="div">{[c.niche, c.followers != null ? `${compact(c.followers)} followers` : null].filter(Boolean).join(" · ")}</Text>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {c.lily_note && <Text size="sm" secondary truncate as="div">{c.lily_note}</Text>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(c.deals ?? []).map((d) => <Tag key={d.deal_id}>{d.campaign_title} · {STAGE_LABEL[d.stage]}</Tag>)}
                </div>
              </div>
            </button>
          ))}
        </Card>
      )}
      <CreatorProfileSheet row={open} onClose={() => setOpen(null)} />
    </div>
  );
}
