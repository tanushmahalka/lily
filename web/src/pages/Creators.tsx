import { useMemo, useState } from "react";
import { EmptyState, SearchInput, Skeleton, Text } from "../kit/halaska-kit";
import CreatorProfileSheet from "../components/CreatorProfileSheet";
import PhotoCard from "../components/PhotoCard";
import { useCreators } from "../lib/queries";
import { STAGE_LABEL } from "../lib/stages";
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
    <div style={{ padding: "28px 32px 64px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <h1 className="page-title">Creators</h1>
          <Text size="sm" secondary as="div">Everyone Lily has shortlisted or worked with. She checks this list first on every new campaign.</Text>
        </div>
        <div style={{ width: 260 }}><SearchInput value={q} onChange={setQ} placeholder="Search creators" shortcut="" /></div>
      </div>
      {isLoading ? <Skeleton height={240} /> : !rows.length ? (
        <EmptyState title={q ? "No one matches" : "No creators yet"} description={q ? "Try another name." : "Lily adds creators here as she finds them."} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 }}>
          {rows.map((c) => (
            <PhotoCard key={c.id} creator={c} onOpen={() => setOpen(c)} line={c.lily_note || undefined}
              footer={c.deals?.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {c.deals.map((d) => (
                    <Text key={d.deal_id} size="xs" muted as="div" truncate>{d.campaign_title} · {STAGE_LABEL[d.stage]}</Text>
                  ))}
                </div>
              ) : undefined} />
          ))}
        </div>
      )}
      <CreatorProfileSheet row={open} onClose={() => setOpen(null)} />
    </div>
  );
}
