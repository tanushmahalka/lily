import { useState } from "react";
import { Button, Text } from "../../kit/halaska-kit";
import { useSaveVideoRules } from "../../lib/mutations";

/** The rules every video is checked against. Lily and the reviewer read exactly this list. */
export default function VideoChecklist({ campaignId, rules }: { campaignId: string; rules: string[] }) {
  const save = useSaveVideoRules(campaignId);
  const [draft, setDraft] = useState("");
  const add = () => {
    const r = draft.trim();
    if (!r || rules.includes(r)) return;
    save.mutate([...rules, r]);
    setDraft("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {rules.map((r, i) => (
        <div key={r + i} className="hover-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0f0ef" }}>
          <span aria-hidden style={{ width: 16, height: 16, borderRadius: 5, border: "1.5px solid #c9c9c6", flexShrink: 0 }} />
          <Text size="sm" as="div" style={{ flex: 1 }}>{r}</Text>
          <button type="button" className="row-actions" aria-label={`Remove "${r}"`} onClick={() => save.mutate(rules.filter((x) => x !== r))}
            style={{ all: "unset", cursor: "pointer", color: "#8a8a8a", padding: "2px 6px", borderRadius: 6, fontSize: 13 }}>✕</button>
        </div>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8 }}>
        <span aria-hidden style={{ width: 16, height: 16, borderRadius: 5, border: "1.5px dashed #c9c9c6", flexShrink: 0 }} />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a rule, e.g. Mentions the event dates" aria-label="New video rule"
          style={{ flex: 1, border: "none", outline: "none", background: "transparent", font: "inherit", fontSize: 14, padding: "6px 0" }} />
        {draft.trim() && <Button size="sm" type="submit" variant="secondary">Add</Button>}
      </form>
    </div>
  );
}
