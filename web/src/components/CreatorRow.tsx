import { Avatar, StatusBadge, Text } from "../kit/halaska-kit";
import { STAGE_LABEL, STAGE_STATUS } from "../lib/stages";
import type { DealRow } from "../lib/types";

export default function CreatorRow({ row, onOpen }: { row: DealRow; onOpen: () => void }) {
  const { deal, creator } = row;
  return (
    <button type="button" onClick={onOpen} className="hover-row"
      style={{ all: "unset", boxSizing: "border-box", width: "100%", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f5")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
      <Avatar name={creator.name || creator.ig_handle} src={creator.avatar_url} size={32} />
      <div style={{ width: 170, flexShrink: 0, minWidth: 0 }}>
        <Text weight="medium" truncate as="div">@{creator.ig_handle}</Text>
        {deal.source === "manual" && <Text size="xs" muted as="div">Added by you</Text>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" secondary truncate as="div">{deal.latest_action || "—"}</Text>
      </div>
      <StatusBadge status={STAGE_STATUS[deal.stage]}>{STAGE_LABEL[deal.stage]}</StatusBadge>
    </button>
  );
}
