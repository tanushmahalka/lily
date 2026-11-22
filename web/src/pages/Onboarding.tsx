import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Chip, Heading, InputGroup, Label, Text, TextArea, TextInput } from "../kit/halaska-kit";
import { useCreateCampaign } from "../lib/mutations";
import { useSettings } from "../lib/queries";
import { useToast } from "../lib/toast";
import type { Autonomy } from "../lib/types";

const MODES: { id: Autonomy; title: string; soon?: boolean }[] = [
  { id: "human_first", title: "Human-first" },
  { id: "autopilot", title: "Autopilot" },
  { id: "full_autopilot", title: "Full autopilot", soon: true },
];

const GOALS = ["Get UGC videos for ads", "Launch a new product", "Drive sales"];
const EXAMPLE = {
  budget: "1500",
  url: "https://www.theproductfolks.com/product-unconference-2026",
  goal: "Get creators to make short videos that make product people want to come to Product Unconference 2026. Every video must: show the Product Unconference ID card clearly, mention the event dates, speak positively about the event, and encourage people to come.",
};

export default function Onboarding() {
  const nav = useNavigate();
  const create = useCreateCampaign();
  const [budget, setBudget] = useState("");
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const toast = useToast();
  const { data: settings } = useSettings();
  const defaultMode = (settings?.default_autonomy as Autonomy) || "human_first";
  const [mode, setMode] = useState<Autonomy>("human_first");
  useEffect(() => { setMode(defaultMode === "full_autopilot" ? "human_first" : defaultMode); }, [defaultMode]);
  const amount = Number(budget.replace(/[^0-9.]/g, ""));
  const ready = amount > 0 && /^https?:\/\/\S+\.\S+/.test(url.trim()) && goal.trim().length > 2;

  const start = () => {
    if (!ready) return;
    const body = { budget_usd: amount, product_url: url.trim(), goal: goal.trim(), autonomy: mode };
    create.mutate(body, {
      onSuccess: ({ campaign, thread_id }) => {
        const first = `Budget $${amount}, product ${body.product_url}, goal: ${body.goal}`;
        nav(`/chat/${thread_id ?? campaign.chat_thread_id}`, { state: { firstMessage: first } });
      },
    });
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <Card padding={32} style={{ width: 520, maxWidth: "100%" }}>
        <form onSubmit={(e) => { e.preventDefault(); start(); }} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <Heading level={2}>Start a campaign</Heading>
              <Text secondary as="div">Lily will read your product, suggest 3 ideas and find the creators.</Text>
            </div>
            <Button type="button" size="sm" variant="ghost" style={{ whiteSpace: "nowrap", flexShrink: 0 }}
              onClick={() => { setBudget(EXAMPLE.budget); setUrl(EXAMPLE.url); setGoal(EXAMPLE.goal); }}>
              Fill with example
            </Button>
          </div>

          <InputGroup label="Budget" prefix="$" suffix="USD" value={budget} onChange={setBudget} placeholder="1,500" />
          <TextInput label="Product link" value={url} onChange={setUrl} placeholder="https://…" type="url" />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Label htmlFor="goal">Campaign goal</Label>
            <TextArea value={goal} onChange={setGoal} rows={3} aria-label="Campaign goal"
              placeholder="What should these videos do for you?" />
            <Text size="xs" muted as="div">Anything the video must show? Put it here, Lily makes it a rule.</Text>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {GOALS.map((g) => <Chip key={g} selected={goal === g} onToggle={() => setGoal(g)}>{g}</Chip>)}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Label>How much should Lily do on her own?</Label>
            <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {MODES.map((m) => {
                const on = mode === m.id;
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={on}
                    onClick={() => (m.soon ? toast("Full autopilot is coming soon") : setMode(m.id))}
                    style={{
                      all: "unset", cursor: "pointer", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "flex-start", textAlign: "left", padding: "12px 12px 10px", borderRadius: 14,
                      background: on ? "#fff" : "#f4f4f3", boxShadow: on ? "0 0 0 1.5px #171717" : "none",
                      opacity: m.soon ? 0.55 : 1, transition: "box-shadow 150ms, background 150ms",
                    }}>
                    <Text size="sm" weight="semibold" as="div">{m.title}</Text>
                    <Text size="xs" muted as="div" style={{ marginTop: 2, lineHeight: 1.4 }}>
                      {m.soon ? "Coming soon" : m.id === "human_first" ? "You OK the shortlist, deals, videos and payments" : "You OK payments only"}
                    </Text>
                  </button>
                );
              })}
            </div>
            <Text size="xs" muted as="div">You can change this anytime on the campaign.</Text>
          </div>

          <Button type="submit" size="lg" fullWidth disabled={!ready} loading={create.isPending}>Start with Lily</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => nav("/campaigns")}>Back to campaigns</Button>
        </form>
      </Card>
    </div>
  );
}
