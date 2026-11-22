// Mirrors CONTRACT.md tables + Amendments v2 enriched reads. Timestamps are epoch ms.
export type Stage =
  | "shortlisted" | "reached_out" | "talking" | "negotiating" | "deal_ready"
  | "awaiting_video" | "video_feedback" | "video_ready" | "completed" | "declined";
export type Autonomy = "human_first" | "autopilot" | "full_autopilot";
export type Channel = "instagram" | "email";

export interface Brand { name?: string; logo_url?: string; about?: string; tone?: string; website?: string }
export interface Guardrails {
  fee_usd?: { min: number; max: number };
  revision_rounds?: { min: number; max: number };
  usage_rights_days?: { min: number; max: number };
  upfront_pct?: { max: number };
  delivery_days?: { min: number; max: number };
}
export interface Brief {
  title?: string; angle?: string; video_description?: string; creator_profile?: string;
  video_rules?: string[]; creators_target?: number; fee_hint_usd?: number;
}
export interface Campaign {
  id: string; status: "ideating" | "active" | "done"; autonomy: Autonomy;
  budget_usd: number; product_url: string; product_json?: any; goal: string;
  chosen_idea_id?: string | null; brief_json?: Brief | string | null; guardrails_json?: Guardrails | string | null;
  chat_thread_id: string; created_at: number; title?: string;
}
export interface Idea {
  id: string; campaign_id: string; position: number; title: string; angle: string;
  video_description: string; creator_profile: string; keywords_json: string[] | string;
  video_rules_json: string[] | string; creators_target: number; fee_hint_usd: number; chosen: number;
}
export interface Creator {
  id: string; ig_handle: string; name?: string; avatar_url?: string; bio?: string; email?: string;
  followers?: number; niche?: string; lily_note?: string; updated_at?: number;
}
export interface Analysis {
  id: string; creator_id: string; campaign_id: string; fit: "great" | "good" | "weak" | "excluded";
  reasons_json: string[] | string; metrics_json?: any;
}
export interface Deal {
  id: string; campaign_id: string; creator_id: string; source: "lily" | "manual"; stage: Stage;
  channel: Channel; agreed_fee_usd?: number | null; latest_action?: string; created_at: number; updated_at: number;
}
export interface Terms {
  fee_usd?: number; deliverables?: string; revision_rounds?: number; usage_rights_days?: number;
  delivery_days?: number; upfront_pct?: number;
}
export interface Offer {
  id: string; deal_id: string; version: number; by: "lily" | "creator"; terms_json: Terms | string;
  within_guardrails: number; violations_json: string[] | string; status: "open" | "superseded" | "accepted" | "rejected";
  created_at: number;
}
export interface Attachment { filename: string; mime?: string; local_path?: string }
export interface Message {
  id: string; deal_id: string; creator_id: string; channel: Channel; direction: "in" | "out"; body: string;
  attachments_json?: Attachment[] | string; suppressed: number; created_at: number;
}
export interface Review {
  verdict: "approve" | "changes"; checks: { rule: string; passed: boolean; note?: string }[];
  feedback_to_creator?: string; notes_for_admin?: string;
}
export interface Submission {
  id: string; deal_id: string; round: number; source_url?: string | null; local_path?: string | null;
  review_json?: Review | string | null; status: "reviewing" | "changes" | "lily_ok" | "admin_ok" | "admin_changes";
  created_at: number;
}
export interface Payout { id: string; deal_id: string; amount_usd: number; status: "pending" | "approved" | "paid"; created_at: number; paid_at?: number | null }
export type ApprovalKind = "shortlist" | "deal" | "video" | "payment";
export interface Approval {
  id: string; campaign_id: string; deal_id?: string | null; kind: ApprovalKind; ref_id?: string | null;
  status: "pending" | "approved" | "changes"; decided_by?: "admin" | "lily" | null; admin_note?: string | null;
  created_at: number; decided_at?: number | null;
  // enriched (Amendments v2 #6)
  campaign_title?: string; deal?: Deal | null; creator?: Creator | null;
  ref?: any; // Offer | Submission | Payout | { deals: (Deal & {creator?: Creator})[] | {deal, creator}[] }
}
export interface Reel { id: string; url: string; caption?: string; thumbnail_url?: string; views?: number; likes?: number }
export interface Perf { snapshots: { id: string; views: number; likes: number; comments: number; taken_at: number; post_url?: string }[]; lily_line?: string }
export interface ChatThread { id: string; title: string; campaign_id?: string | null; created_at: number; preview?: string; updated_at?: number; last_at?: number | null }
export interface ChatMessage {
  id: string; thread_id: string; role: "admin" | "lily"; kind: "text" | "ideas" | "approval" | "update" | "steps";
  body: string; ref_json?: any; ref?: any; created_at: number;
}
export interface LilyEvent {
  id: string; ts: number; campaign_id?: string | null; deal_id?: string | null;
  actor: "lily" | "admin" | "creator" | "system"; type: string; summary: string; data_json?: any;
}
export interface Account { id: string; channel: Channel; handle: string; speaks_as: string; live: number }

export interface CampaignListRow { campaign: Campaign & { title?: string }; needs_you: number; stage_counts: Partial<Record<Stage, number>>; title?: string }
export interface DealRow { deal: Deal; creator: Creator; analysis?: Analysis | null }
export interface CampaignDetail {
  campaign: Campaign; title?: string; ideas: Idea[]; deals: DealRow[]; approvals_pending: Approval[]; payouts?: Payout[];
}
export interface DealContext {
  campaign: Campaign; brief?: Brief; guardrails?: Guardrails; creator: Creator; analysis?: Analysis | null;
  reels: Reel[]; offers: Offer[]; messages: Message[]; submissions: Submission[]; approvals: Approval[];
  deal: Deal; brand?: Brand; accounts?: Account[];
}
export interface CreatorDetail extends Creator {
  deals?: any[]; campaigns?: any[];
}
export interface CreatorListRow extends Creator {
  deals?: { deal_id: string; campaign_id: string; campaign_title: string; stage: Stage }[];
}

/** JSON columns may arrive parsed or as text; accept both. */
export function j<T>(v: T | string | null | undefined, fallback: T): T {
  if (v == null || v === "") return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v) as T; } catch { return fallback; }
}

/** A's API returns JSON columns parsed and without the `_json` suffix (`terms`, `review`, `brief`…). Accept either form. */
export function field<T>(o: any, name: string, fallback: T): T {
  if (!o) return fallback;
  return j<T>(o[name] ?? o[`${name}_json`], fallback);
}
