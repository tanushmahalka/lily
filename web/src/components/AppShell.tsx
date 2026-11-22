import { Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Button, StatusDot, Text } from "../kit/halaska-kit";
import { useApprovals, useSettings } from "../lib/queries";

const NAV = [
  { to: "/campaigns", label: "Campaigns", dot: true },
  { to: "/creators", label: "Creators", dot: false },
  { to: "/chat", label: "Chat", dot: true },
  { to: "/settings", label: "Settings", dot: false },
];

export default function AppShell() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const { data: settings } = useSettings();
  const { data: approvals } = useApprovals();
  const waiting = (approvals?.length ?? 0) > 0;
  const brand = settings?.brand;

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 220, flexShrink: 0, borderRight: "1px solid #ececec", background: "#fff", padding: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
          <Avatar name={brand?.name || "creat0r"} src={brand?.logo_url} size={28} />
          <div style={{ minWidth: 0 }}>
            <Text weight="semibold" truncate>{brand?.name || "creat0r"}</Text>
            <Text size="xs" muted as="div">with Lily</Text>
          </div>
        </div>
        {NAV.map((n) => {
          const active = pathname.startsWith(n.to);
          return (
            <Button key={n.to} variant={active ? "secondary" : "ghost"} fullWidth onClick={() => nav(n.to)}
              style={{ justifyContent: "space-between" }} iconRight={n.dot && waiting ? <StatusDot status="pending" size={7} label="Needs you" /> : undefined}>
              {n.label}
            </Button>
          );
        })}
        <div style={{ flex: 1 }} />
        <Button variant="outline" fullWidth onClick={() => nav("/onboarding")}>New campaign</Button>
      </aside>
      <main style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
