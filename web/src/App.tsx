import { Navigate, Route, Routes } from "react-router";
import { Spinner } from "./kit/halaska-kit";
import AppShell from "./components/AppShell";
import { useCampaigns } from "./lib/queries";
import { useLiveStream } from "./lib/stream";
import Onboarding from "./pages/Onboarding";
import Chat from "./pages/Chat";
import Campaigns from "./pages/Campaigns";
import CampaignPage from "./pages/Campaign";
import Creators from "./pages/Creators";
import Settings from "./pages/Settings";

function Home() {
  const { data, isLoading, isError } = useCampaigns();
  if (isLoading) return <div style={{ padding: 40 }}><Spinner /></div>;
  if (isError || !data?.length) return <Navigate to="/onboarding" replace />;
  return <Navigate to="/campaigns" replace />;
}

export default function App() {
  useLiveStream();
  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/campaigns" element={<Campaigns />} />
        <Route path="/campaigns/:id" element={<CampaignPage />} />
        <Route path="/campaigns/:id/:tab" element={<CampaignPage />} />
        <Route path="/creators" element={<Creators />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/:threadId" element={<Chat />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
