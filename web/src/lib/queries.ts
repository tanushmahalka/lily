import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type {
  Account, Approval, Brand, CampaignDetail, CampaignListRow, ChatMessage, ChatThread,
  CreatorListRow, DealContext, Perf,
} from "./types";

export const qk = {
  campaigns: ["campaigns"] as const,
  campaign: (id: string) => ["campaign", id] as const,
  approvals: ["approvals", "pending"] as const,
  creators: ["creators"] as const,
  creator: (id: string) => ["creator", id] as const,
  dealContext: (id: string) => ["deal", id, "context"] as const,
  dealPerf: (id: string) => ["deal", id, "perf"] as const,
  threads: ["threads"] as const,
  threadMessages: (id: string) => ["thread", id, "messages"] as const,
  settings: ["settings"] as const,
  accounts: ["accounts"] as const,
};

export const useCampaigns = () => useQuery({ queryKey: qk.campaigns, queryFn: () => api<CampaignListRow[]>("/campaigns") });
export const useCampaign = (id?: string) =>
  useQuery({ queryKey: qk.campaign(id ?? ""), queryFn: () => api<CampaignDetail>(`/campaigns/${id}`), enabled: !!id });
export const useApprovals = () =>
  useQuery({ queryKey: qk.approvals, queryFn: () => api<Approval[]>("/approvals?status=pending") });
export const useCreators = () => useQuery({ queryKey: qk.creators, queryFn: () => api<CreatorListRow[]>("/creators") });
export const useCreator = (id?: string | null) =>
  useQuery({ queryKey: qk.creator(id ?? ""), queryFn: () => api<any>(`/creators/${id}`), enabled: !!id });
export const useDealContext = (id?: string | null) =>
  useQuery({ queryKey: qk.dealContext(id ?? ""), queryFn: () => api<DealContext>(`/deals/${id}/context`), enabled: !!id });
export const useDealPerf = (id?: string | null, enabled = true) =>
  useQuery({ queryKey: qk.dealPerf(id ?? ""), queryFn: () => api<Perf>(`/deals/${id}/perf`), enabled: !!id && enabled });
export const useThreads = () => useQuery({ queryKey: qk.threads, queryFn: () => api<ChatThread[]>("/chat/threads") });
export const useThreadMessages = (id?: string) =>
  useQuery({ queryKey: qk.threadMessages(id ?? ""), queryFn: () => api<ChatMessage[]>(`/chat/threads/${id}/messages`), enabled: !!id });

export interface Settings { brand?: Brand; default_autonomy?: string; [k: string]: any }
/** GET /settings may be a {key: value} map or a list of {key, value(_json)} rows; normalise to a map. */
export const useSettings = () =>
  useQuery({
    queryKey: qk.settings,
    queryFn: async () => {
      const raw = await api<any>("/settings");
      if (!Array.isArray(raw)) return raw as Settings;
      const out: Settings = {};
      for (const r of raw) {
        const v = r.value ?? r.value_json;
        out[r.key] = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v;
      }
      return out;
    },
  });
export const useAccounts = () => useQuery({ queryKey: qk.accounts, queryFn: () => api<Account[]>("/accounts") });
