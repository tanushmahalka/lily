import { Sparkline, Text } from "../kit/halaska-kit";
import { useDealPerf } from "../lib/queries";
import { compact } from "../lib/stages";

export default function AfterPosting({ dealId }: { dealId: string }) {
  const { data } = useDealPerf(dealId);
  const snaps = [...(data?.snapshots ?? [])].sort((a, b) => a.taken_at - b.taken_at);
  if (!snaps.length) return <Text size="sm" muted>Not posted yet. Lily checks every 6 hours once it's live.</Text>;
  const last = snaps[snaps.length - 1];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Sparkline data={snaps.map((s) => s.views)} width={540} height={64} />
      <Text size="sm" as="div">{compact(last.views)} views · {compact(last.likes)} likes · {compact(last.comments)} comments</Text>
      {data?.lily_line && <Text size="sm" secondary as="div">Lily: {data.lily_line}</Text>}
      <Text size="xs" muted as="div">
        Checked every 6 hours{last.post_url ? <> · <a href={last.post_url} target="_blank" rel="noreferrer">View post ↗</a></> : null}
      </Text>
    </div>
  );
}
