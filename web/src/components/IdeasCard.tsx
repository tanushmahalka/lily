import { useState } from "react";
import { useNavigate } from "react-router";
import { Badge, Button, Card, Choicebox, Skeleton, Text } from "../kit/halaska-kit";
import { useChooseIdea } from "../lib/mutations";
import { useCampaign } from "../lib/queries";
import { usd } from "../lib/stages";
import { field, type Idea } from "../lib/types";

function IdeaDetail({ idea }: { idea: Idea }) {
  const rules = field<string[]>(idea, "video_rules", []);
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 2 }}>
      <span>{idea.angle}</span>
      <span><b>The video:</b> {idea.video_description}</span>
      <span><b>Creators:</b> {idea.creator_profile}</span>
      {rules.length > 0 && <span><b>Video rules:</b> {rules.join(" · ")}</span>}
    </span>
  );
}

/** Lily's 3 ideas as a Choicebox + "Go with this". The only decision in onboarding. */
export default function IdeasCard({ campaignId }: { campaignId: string }) {
  const nav = useNavigate();
  const { data, isLoading } = useCampaign(campaignId);
  const choose = useChooseIdea(campaignId);
  const ideas = [...(data?.ideas ?? [])].sort((a, b) => a.position - b.position);
  const chosenId = data?.campaign.chosen_idea_id ?? ideas.find((i) => i.chosen)?.id ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const value = chosenId ?? pick;

  if (isLoading) return <Skeleton height={180} />;
  if (!ideas.length) return null;

  return (
    <Card padding={16} style={{ maxWidth: 640 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text weight="semibold">Pick one idea</Text>
          {chosenId && <Badge variant="success">Chosen</Badge>}
        </div>
        <Choicebox
          value={value}
          onChange={(id: string) => { if (!chosenId) setPick(id); }}
          options={ideas.map((i) => ({
            id: i.id,
            title: i.title,
            description: <IdeaDetail idea={i} />,
            meta: `${i.creators_target} × ~${usd(i.fee_hint_usd)}`,
          }))}
        />
        {chosenId ? (
          <div><Button variant="secondary" onClick={() => nav(`/campaigns/${campaignId}`)}>Open campaign</Button></div>
        ) : (
          <div>
            <Button disabled={!pick} onClick={() => { if (!pick) return; choose.mutate(pick); nav(`/campaigns/${campaignId}`); }}>
              Go with this
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
