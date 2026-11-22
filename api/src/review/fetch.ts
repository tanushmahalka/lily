// Gets a creator's video onto disk with existing tools: yt-dlp, gdown (via uvx), curl, treg, ffmpeg.
import { existsSync, statSync, unlinkSync } from "node:fs";

export type SourceKind = "instagram" | "drive" | "dropbox" | "wetransfer" | "direct";

/** A failure Lily can explain to the creator; `message` is for the admin. */
export class FetchError extends Error {}

export function sourceKind(url: string): SourceKind {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.endsWith("instagram.com")) return "instagram";
  if (host === "drive.google.com" || host === "docs.google.com") return "drive";
  if (host.endsWith("dropbox.com")) return "dropbox";
  if (host.endsWith("wetransfer.com") || host === "we.tl") return "wetransfer";
  return "direct";
}

/** First http(s) URL in a message body. */
export function firstUrl(text: string | null | undefined): string | null {
  return text?.match(/https?:\/\/[^\s<>"')]+/)?.[0] ?? null;
}

async function run(cmd: string[], timeoutMs = 120_000): Promise<string> {
  const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code !== 0) throw new FetchError(`${cmd[0]} failed (${code}): ${err.trim().split("\n").slice(-2).join(" ").slice(0, 300)}`);
  return out;
}

const curl = (url: string, dest: string) => run(["curl", "-fsSL", "--max-time", "120", "-o", dest, url]);

/** Instagram post → its video URL via treg (≈$0.001). Never uses Tanush's account. */
async function instagramVideoUrl(url: string): Promise<string> {
  const out = await run(["treg", "call", "treg.instagram.post.detail", "--header", "X-Treg-Route-Max-Cost: 0.01", "--data", JSON.stringify({ url })], 90_000);
  let found: string | null = null;
  const walk = (v: any, key = ""): void => {
    if (found || v == null) return;
    if (typeof v === "string") {
      if (/^https?:\/\//.test(v) && (/video/i.test(key) || /\.mp4(\?|$)/.test(v))) found = v;
      return;
    }
    if (Array.isArray(v)) return v.forEach((x) => walk(x, key));
    if (typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  const parsed = JSON.parse(out);
  walk(parsed.output ?? parsed);
  if (!found) walk(parsed.raw);
  if (!found) throw new FetchError("that Instagram post has no video");
  return found;
}

/** Download `url` to `dest` (an .mp4 path). */
export async function download(url: string, dest: string): Promise<SourceKind> {
  const kind = sourceKind(url);
  if (existsSync(dest)) unlinkSync(dest);
  switch (kind) {
    case "wetransfer":
      throw new FetchError("WeTransfer links aren't supported");
    case "instagram":
      await curl(await instagramVideoUrl(url), dest);
      break;
    case "drive":
      await run(["uvx", "gdown", "--fuzzy", "--quiet", url, "-O", dest]);
      break;
    case "dropbox": {
      const u = new URL(url);
      u.searchParams.set("dl", "1");
      await curl(u.toString(), dest);
      break;
    }
    case "direct":
      try {
        await run(["yt-dlp", "--no-playlist", "-q", "-f", "mp4/best", "--force-overwrites", "-o", dest, url]);
      } catch {
        await curl(url, dest);
      }
  }
  if (!existsSync(dest) || statSync(dest).size < 1000) throw new FetchError("the download came back empty");
  return kind;
}

/** Ensure `src` is a browser-playable h264 mp4 at `dest`. Throws if it isn't a video at all. */
export async function toPlayableMp4(src: string, dest: string): Promise<void> {
  let codec = "";
  try {
    codec = (await run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", src], 30_000)).trim();
  } catch {
    throw new FetchError("that file isn't a video");
  }
  if (!codec) throw new FetchError("that file isn't a video");
  if (codec === "h264" && src.toLowerCase().endsWith(".mp4")) {
    if (src !== dest) await Bun.write(dest, Bun.file(src));
    return;
  }
  const tmp = `${dest}.tmp.mp4`;
  await run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-movflags", "+faststart", tmp], 240_000);
  await Bun.write(dest, Bun.file(tmp));
  unlinkSync(tmp);
}
