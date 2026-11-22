import { Outlet, useLocation, useNavigate } from "react-router";
import { Avatar, Button, Text } from "../kit/halaska-kit";
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
  const waiting = approvals?.length ?? 0;
  const brand = settings?.brand;

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: 220, flexShrink: 0, borderRight: "1px solid #ececec", background: "#fff", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
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
              style={{ justifyContent: "space-between" }} iconRight={n.dot && waiting ? (
                <span aria-label={`${waiting} need you`} style={{ minWidth: 20, height: 20, padding: "0 6px", borderRadius: 10, background: "#f59e0b", color: "#fff", fontSize: 11, fontWeight: 600, display: "inline-grid", placeItems: "center", boxSizing: "border-box" }}>{waiting}</span>
              ) : undefined}>
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
