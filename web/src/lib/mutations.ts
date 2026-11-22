import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { patch, post, put } from "./api";
import { qk, type Settings } from "./queries";
import { useToast } from "./toast";
import type { Approval, Autonomy, Campaign, CampaignDetail, CampaignListRow, Stage } from "./types";

type Snap = [QueryKey, unknown][];
async function snapshot(qc: QueryClient, keys: QueryKey[]): Promise<Snap> {
  await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));
  return keys.flatMap((k) => qc.getQueriesData({ queryKey: k }));
}
function restore(qc: QueryClient, snap?: Snap) {
  // newest-first so overlapping keys end on the oldest (pre-mutation) value
  snap?.slice().reverse().forEach(([k, v]) => qc.setQueryData(k, v));
}
const errText = (e: any) => e?.message ?? "Something went wrong";

function patchDealStage(qc: QueryClient, dealId: string | null | undefined, stage: Stage, latest: string) {
  if (!dealId) return;
  qc.setQueriesData<CampaignDetail>({ queryKey: ["campaign"] }, (d) =>
    d?.deals
      ? { ...d, deals: d.deals.map((r) => (r.deal.id === dealId ? { ...r, deal: { ...r.deal, stage, latest_action: latest } } : r)) }
      : d,
  );
}
function dropApproval(qc: QueryClient, id: string) {
  qc.setQueryData<Approval[]>(qk.approvals, (xs) => xs?.filter((a) => a.id !== id));
  qc.setQueriesData<CampaignDetail>({ queryKey: ["campaign"] }, (d) =>
    d?.approvals_pending ? { ...d, approvals_pending: d.approvals_pending.filter((a) => a.id !== id) } : d,
  );
}

const NEXT: Record<string, Record<"approve" | "changes", [Stage, string] | null>> = {
  deal: { approve: ["awaiting_video", "Deal approved. Waiting for the video"], changes: ["negotiating", "You asked for changes to the deal"] },
  video: { approve: ["completed", "Done. Video approved"], changes: ["video_feedback", "You asked for changes to the video"] },
  shortlist: { approve: null, changes: null },
  payment: { approve: null, changes: null },
};

/** Approve / ask for changes. Optimistic for shortlist, deal and video. Payment goes through usePayout (pessimistic). */
export function useDecideApproval() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { approval: Approval; decision: "approve" | "changes"; note?: string }) =>
      post(`/approvals/${v.approval.id}`, { decision: v.decision, note: v.note || undefined }),
    onMutate: async ({ approval, decision }) => {
      const snap = await snapshot(qc, [qk.approvals, ["campaign"]]);
      dropApproval(qc, approval.id);
      const next = NEXT[approval.kind]?.[decision];
      if (next) patchDealStage(qc, approval.deal_id ?? approval.deal?.id, next[0], next[1]);
      toast(decision === "approve" ? "Approved. Lily's on it." : "Sent your note to Lily.", "success");
      return { snap };
    },
    onError: (e, _v, ctx) => { restore(qc, ctx?.snap); toast(errText(e), "danger"); },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.approvals }),
      qc.invalidateQueries({ queryKey: ["campaign"] }),
      qc.invalidateQueries({ queryKey: qk.campaigns }),
      qc.invalidateQueries({ queryKey: ["deal"] }),
    ]),
  });
}

/** Payouts wait for the server (money surface). */
export function usePayout() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { payoutId: string; action: "approve" | "paid" }) => post(`/payouts/${v.payoutId}/${v.action}`),
    onSuccess: (_d, v) => toast(v.action === "approve" ? "Payment approved" : "Marked as paid", "success"),
    onError: (e) => toast(errText(e), "danger"),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.approvals }),
      qc.invalidateQueries({ queryKey: ["campaign"] }),
      qc.invalidateQueries({ queryKey: qk.campaigns }),
    ]),
  });
}

export function useSetAutonomy(campaignId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (autonomy: Autonomy) => patch(`/campaigns/${campaignId}`, { autonomy }),
    onMutate: async (autonomy) => {
      const snap = await snapshot(qc, [qk.campaign(campaignId), qk.campaigns]);
      qc.setQueryData<CampaignDetail>(qk.campaign(campaignId), (d) => (d ? { ...d, campaign: { ...d.campaign, autonomy } } : d));
      qc.setQueryData<CampaignListRow[]>(qk.campaigns, (xs) =>
        xs?.map((r) => (r.campaign.id === campaignId ? { ...r, campaign: { ...r.campaign, autonomy } } : r)));
      return { snap };
    },
    onError: (e, _v, ctx) => { restore(qc, ctx?.snap); toast(errText(e), "danger"); },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.campaign(campaignId) }),
      qc.invalidateQueries({ queryKey: qk.approvals }),
    ]),
  });
}

/** Remove from shortlist = move to declined (Amendments v2 #3). Optimistic. */
export function useDeclineDeal() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (dealId: string) => patch(`/deals/${dealId}`, { stage: "declined", latest_action: "Removed from shortlist by you" }),
    onMutate: async (dealId) => {
      const snap = await snapshot(qc, [["campaign"], qk.approvals]);
      patchDealStage(qc, dealId, "declined", "Removed from shortlist by you");
      // also drop them from any pending shortlist card
      const strip = (a: Approval) =>
        a.kind === "shortlist" && Array.isArray(a.ref?.deals)
          ? { ...a, ref: { ...a.ref, deals: a.ref.deals.filter((d: any) => (d.deal?.id ?? d.id) !== dealId) } }
          : a;
      qc.setQueryData<Approval[]>(qk.approvals, (xs) => xs?.map(strip));
      qc.setQueriesData<CampaignDetail>({ queryKey: ["campaign"] }, (d) =>
        d?.approvals_pending ? { ...d, approvals_pending: d.approvals_pending.map(strip) } : d);
      return { snap };
    },
    onError: (e, _v, ctx) => { restore(qc, ctx?.snap); toast(errText(e), "danger"); },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: ["campaign"] }),
      qc.invalidateQueries({ queryKey: qk.approvals }),
    ]),
  });
}

export function useChooseIdea(campaignId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (ideaId: string) => post(`/campaigns/${campaignId}/choose`, { idea_id: ideaId }),
    onMutate: async (ideaId) => {
      const snap = await snapshot(qc, [qk.campaign(campaignId)]);
      qc.setQueryData<CampaignDetail>(qk.campaign(campaignId), (d) =>
        d ? {
          ...d,
          campaign: { ...d.campaign, chosen_idea_id: ideaId, status: "active" },
          ideas: d.ideas.map((i) => ({ ...i, chosen: i.id === ideaId ? 1 : 0 })),
        } : d);
      return { snap };
    },
    onError: (e, _v, ctx) => { restore(qc, ctx?.snap); toast(errText(e), "danger"); },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.campaign(campaignId) }),
      qc.invalidateQueries({ queryKey: qk.campaigns }),
    ]),
  });
}

/** Server creates the deal: wait for it. */
export function useAddCreator(campaignId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { ig_handle: string; email?: string }) => post(`/creators`, { ...v, campaign_id: campaignId }),
    onSuccess: (_d, v) => toast(`Added @${v.ig_handle}. Lily will reach out.`, "success"),
    onError: (e) => toast(errText(e), "danger"),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.campaign(campaignId) }),
      qc.invalidateQueries({ queryKey: qk.creators }),
    ]),
  });
}

export function useSaveSetting() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { key: string; value: unknown }) => put(`/settings/${v.key}`, { value: v.value }),
    onMutate: async ({ key, value }) => {
      const snap = await snapshot(qc, [qk.settings]);
      qc.setQueryData<Settings>(qk.settings, (s) => ({ ...(s ?? {}), [key]: value }));
      toast("Saved", "success");
      return { snap };
    },
    onError: (e, _v, ctx) => { restore(qc, ctx?.snap); toast(errText(e), "danger"); },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.settings }),
  });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (v: { budget_usd: number; product_url: string; goal: string }) =>
      post<{ campaign: Campaign; thread_id: string }>(`/campaigns`, v),
    onError: (e) => toast(errText(e), "danger"),
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: qk.campaigns }),
      qc.invalidateQueries({ queryKey: qk.threads }),
    ]),
  });
}
