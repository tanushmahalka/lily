// treg CLI wrapper + provider-shape normalisers. Every call is capped at $0.01.
export async function tregCall(id: string, body: Record<string, unknown>): Promise<any> {
  const proc = Bun.spawn(
    ["treg", "call", id, "--data", JSON.stringify(body), "--header", "X-Treg-Route-Max-Cost: 0.01"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  if (code !== 0) throw new Error(`treg ${id} failed: ${(err || out).trim().slice(0, 300)}`);
  let parsed: any;
  try { parsed = JSON.parse(out); } catch { throw new Error(`treg ${id}: unreadable output`); }
  if (parsed?._treg?.outcome && parsed._treg.outcome !== "hit") throw new Error(`treg ${id}: ${parsed._treg.outcome}`);
  return parsed.output ?? parsed;
}

const num = (...vals: unknown[]): number | null => {
  for (const v of vals) {
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const str = (...vals: unknown[]): string | null => {
  for (const v of vals) if (typeof v === "string" && v) return v;
  return null;
};

/** Instagram media ids encode the post time: (id >> 23) + epoch offset. */
const timeFromMediaId = (mediaId: unknown) => {
  try {
    const ms = Number(BigInt(String(mediaId).split("_")[0]) >> 23n) + 1314220021721;
    return ms > 1.3e12 && ms < Date.now() + 864e5 ? ms : null;
  } catch { return null; }
};
const toMs = (v: unknown) => {
  const n = num(v);
  if (n != null) return n < 1e12 ? n * 1000 : n;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
};

export type Reel = {
  shortcode: string; url: string; caption: string | null; thumbnail_url: string | null;
  views: number | null; likes: number | null; comments: number | null; posted_at: number | null;
  username: string | null; user_id: string | null; display_name: string | null; avatar_url: string | null;
  paid_partnership: boolean;
};

export function normReel(r: any): Reel | null {
  const user = r.user ?? r.owner ?? r.author ?? {};
  const shortcode = str(r.shortcode, r.code, r.short_code);
  const url = str(r.url, r.permalink) ?? (shortcode ? `https://www.instagram.com/reel/${shortcode}/` : null);
  if (!shortcode || !url) return null;
  const capt = r.caption;
  return {
    shortcode, url,
    caption: str(typeof capt === "object" ? capt?.text : capt, r.text, r.description),
    thumbnail_url: str(r.thumbnail, r.thumbnail_url, r.display_url, r.cover, r.image_url),
    views: num(r.views, r.plays, r.play_count, r.video_play_count, r.video_view_count, r.view_count),
    likes: num(r.likes, r.like_count, r.likesCount),
    comments: num(r.comments, r.comment_count, r.commentsCount),
    posted_at: toMs(r.createdUtc ?? r.taken_at ?? r.timestamp ?? r.created_at ?? r.posted_at) ?? timeFromMediaId(r.id ?? r.pk),
    username: str(r.username, r.ownerUsername, user.username),
    user_id: str(String(r.userId ?? r.user_id ?? r.ownerId ?? user.id ?? user.pk ?? "") || null),
    display_name: str(r.full_name, r.ownerFullName, user.full_name),
    avatar_url: str(r.profile_pic_url, user.profile_pic_url, user.profile_pic_url_hd),
    paid_partnership: Boolean(r.paidPartnership ?? r.is_paid_partnership ?? r.paid_partnership),
  };
}

export const reelList = (out: any): any[] =>
  Array.isArray(out) ? out : out?.reels ?? out?.items ?? out?.rows ?? out?.results ?? out?.data ?? [];

export type Profile = {
  username: string; user_id: string | null; name: string | null; bio: string | null; avatar_url: string | null;
  followers: number | null; public_email: string | null; is_private: boolean;
};

export function normProfile(out: any): Profile | null {
  const p = out?.user ?? out?.profile ?? out?.data ?? out;
  const username = str(p?.username);
  if (!username) return null;
  return {
    username,
    user_id: str(String(p.user_id ?? p.id ?? p.pk ?? "") || null),
    name: str(p.full_name, p.name),
    bio: str(p.biography, p.bio),
    avatar_url: str(p.profile_pic_url_hd, p.profile_pic_url, p.avatar_url),
    followers: num(p.followers, p.follower_count, p.followers_count, p.edge_followed_by?.count),
    public_email: str(p.public_email, p.business_email, p.email),
    is_private: Boolean(p.is_private),
  };
}
