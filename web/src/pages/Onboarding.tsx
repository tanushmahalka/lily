import { useState } from "react";
import { useNavigate } from "react-router";
import { Button, Card, Chip, Heading, InputGroup, Label, Text, TextArea, TextInput } from "../kit/halaska-kit";
import { useCreateCampaign } from "../lib/mutations";

const GOALS = ["Get UGC videos for ads", "Launch a new product", "Drive sales"];
const EXAMPLE = {
  budget: "1500",
  url: "https://www.theproductfolks.com/product-unconference-2026",
  goal: "Get creators to make short videos that make product people want to come to Product Unconference 2026. The Product Unconference ID card must be clearly visible in the video.",
};

export default function Onboarding() {
  const nav = useNavigate();
  const create = useCreateCampaign();
  const [budget, setBudget] = useState("");
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const amount = Number(budget.replace(/[^0-9.]/g, ""));
  const ready = amount > 0 && /^https?:\/\/\S+\.\S+/.test(url.trim()) && goal.trim().length > 2;

  const start = () => {
    if (!ready) return;
    const body = { budget_usd: amount, product_url: url.trim(), goal: goal.trim() };
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
            <Button type="button" size="sm" variant="ghost" onClick={() => { setBudget(EXAMPLE.budget); setUrl(EXAMPLE.url); setGoal(EXAMPLE.goal); }}>
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

          <Button type="submit" size="lg" fullWidth disabled={!ready} loading={create.isPending}>Start with Lily</Button>
        </form>
      </Card>
    </div>
  );
}
