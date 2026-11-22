import { useEffect, useState } from "react";
import { Avatar, Badge, Button, Card, Heading, ListItem, SegmentedControl, Skeleton, StatusDot, Tabs, Text, TextArea, TextInput } from "../kit/halaska-kit";
import { useSaveSetting } from "../lib/mutations";
import { useAccounts, useSettings } from "../lib/queries";
import { AUTONOMY_FROM_LABEL, AUTONOMY_LABEL, GATES } from "../lib/stages";
import { useToast } from "../lib/toast";
import type { Autonomy, Brand } from "../lib/types";

const TABS = ["Brand", "Accounts", "Lily"];

export default function Settings() {
  const [tab, setTab] = useState("Brand");
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
      <Heading level={2}>Settings</Heading>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === "Brand" && <BrandTab />}
      {tab === "Accounts" && <AccountsTab />}
      {tab === "Lily" && <LilyTab />}
    </div>
  );
}

function BrandTab() {
  const { data, isLoading } = useSettings();
  const save = useSaveSetting();
  const [b, setB] = useState<Brand>({});
  useEffect(() => { if (data?.brand) setB(data.brand); }, [data?.brand]);
  if (isLoading) return <Skeleton height={240} />;
  const set = (k: keyof Brand) => (v: string) => setB((x) => ({ ...x, [k]: v }));
  return (
    <Card padding={20}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate({ key: "brand", value: b }); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Text size="sm" secondary as="div">Lily filled this in from your product link. She signs emails as "Lily, partnerships at {b.name || "your brand"}".</Text>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <Avatar name={b.name || "?"} src={b.logo_url} size={44} />
          <div style={{ flex: 1 }}><TextInput label="Name" value={b.name ?? ""} onChange={set("name")} /></div>
        </div>
        <TextInput label="Logo URL" value={b.logo_url ?? ""} onChange={set("logo_url")} placeholder="https://…" />
        <TextInput label="Website" value={b.website ?? ""} onChange={set("website")} placeholder="https://…" />
        <TextArea label="About" value={b.about ?? ""} onChange={set("about")} rows={3} />
        <TextInput label="Tone" value={b.tone ?? ""} onChange={set("tone")} placeholder="Warm, simple, a little playful" />
        <div><Button type="submit">Save</Button></div>
      </form>
    </Card>
  );
}

function AccountsTab() {
  const { data, isLoading } = useAccounts();
  if (isLoading) return <Skeleton height={120} />;
  return (
    <Card padding={6}>
      {(data ?? []).map((a, i) => (
        <ListItem key={a.id} divider={i < (data?.length ?? 0) - 1}
          title={a.channel === "instagram" ? `Instagram · @${a.handle}` : `Email · ${a.handle}`}
          subtitle={`Lily writes as ${a.speaks_as}`}
          right={a.live ? <StatusDot status="online" label="Live" /> : <Badge>Not connected</Badge>} />
      ))}
    </Card>
  );
}

function LilyTab() {
  const { data } = useSettings();
  const save = useSaveSetting();
  const toast = useToast();
  const current = (data?.default_autonomy as Autonomy) || "human_first";
  return (
    <Card padding={20}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Text weight="semibold">Default autonomy for new campaigns</Text>
        <div style={{ width: 400, maxWidth: "100%" }}>
          <SegmentedControl options={Object.values(AUTONOMY_LABEL)} value={AUTONOMY_LABEL[current]}
            onChange={(label: string) => {
              const a = AUTONOMY_FROM_LABEL[label];
              if (a === "full_autopilot") return toast("Full autopilot is coming soon");
              if (a !== current) save.mutate({ key: "default_autonomy", value: a });
            }} />
        </div>
        <Text size="sm" secondary>{GATES[current].line}</Text>
      </div>
    </Card>
  );
}
