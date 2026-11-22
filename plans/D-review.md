# Thread D: Review (plan)

Owns `api/src/review/` only. No new deps in `api/package.json`.

## What it does
A creator sends a video (link in a DM/email, or an email attachment). D saves it to `data/videos/`, has Gemini watch it against the campaign's `brief.video_rules`, stores a `submissions` row with `review_json` exactly per CONTRACT, and logs events. Lily (E) reads the review, sends `feedback_to_creator` herself, and calls `lily-approve` when the video passes.

## Files
| File | Contents |
|---|---|
| `api/src/review/index.ts` | `reviewVideo` (frozen export), the 3 routes, Hono app |
| `api/src/review/fetch.ts` | `resolveSource(url)` + `download(url, destPath)`: picks the downloader per link type |
| `api/src/review/judge.ts` | `judgeVideo(localPath, brief)`: Gemini upload + structured review |

## Functions
- `reviewVideo(dealId, {source_url?, local_path?, message_id?})` → submission row (parsed)
  1. Load deal + campaign (`brief_json.video_rules`). 404-style throw if missing.
  2. Pick the file: `local_path` as is → else `message_id` → first video entry of that message's `attachments_json` (local path saved by C) → else first URL found in the message body → else `source_url`.
  3. `round = max(round)+1` for the deal. Insert submission `status:'reviewing'`; `logEvent video.received` ("Got round 2 from @kai.routines").
  4. Download to `data/videos/<sub_id>.mp4`. If not mp4/h264, transcode with `ffmpeg` so browsers can play it.
  5. `judgeVideo` → `review_json`. Status `changes` if verdict changes, else stays `reviewing` until Lily approves (see Q3).
  6. `setStage(deal, 'video_feedback', …)` when the deal is in `awaiting_video` (allowed transition; `video_feedback → video_feedback` for later rounds).
  7. `logEvent video.reviewed` ("Watched @kai's video: 3 of 4 rules pass, asked for one fix").
  8. On any failure (download/Gemini): submission status `changes`, review_json with `verdict:'changes'`, empty checks, `notes_for_admin` = the error in plain words, `feedback_to_creator` = "I couldn't open that link. Could you send it as a Drive link or the reel?". Never throws past the route; returns the row.
- `judgeVideo(path, brief)`: `gemini.uploadVideo(path)` then `gemini.json` with a schema matching `review_json`. Prompt: one check per rule (same rule text, in order), `passed:false` only when the video **clearly** breaks the rule, note with a timestamp; `verdict` is computed in code (`changes` iff any `passed:false`), not trusted from the model. `feedback_to_creator`: warm, specific, ≤3 sentences, starts with something genuinely liked, asks only for the failed rules. `notes_for_admin`: one or two lines.
- `resolveSource(url)` → `{kind, url}`, then `download`:
  | Link | Tool |
  |---|---|
  | Instagram reel/post | `treg call treg.instagram.post.detail {url}` (CLI, ~$0.001) → video URL → `curl` |
  | Google Drive | `uvx gdown --fuzzy <url> -O <dest>` (gdown not installed; uvx runs it without installing into the project) |
  | Dropbox | rewrite to `?dl=1`, then `curl -L` |
  | WeTransfer | not supported: returns the friendly failure review ("Could you send it as a Drive link or post it as a reel?") |
  | Direct `.mp4`/other | `yt-dlp -o <dest> <url>` (handles direct files and many hosts; falls back to `curl -L`) |
  All spawned with `Bun.spawn`, 120 s cap, no Instagram cookies ever.

## Routes (under /api)
- `POST /deals/:id/submissions {source_url?, message_id?}` → `reviewVideo` → `{submission}`. Synchronous (Gemini on a 30 s clip takes ~15–40 s; server idleTimeout is 255 s).
- `POST /submissions/:id/lily-approve` → requires latest review verdict `approve` (409 otherwise); submission `lily_ok`; `setStage(deal,'video_ready',"Video looks great. Needs your OK")`; `createApproval({campaign_id, deal_id, kind:'video', ref_id: sub.id})` (core decides auto-approve per autonomy); `postChat({campaign_id, role:'lily', kind:'approval', body:"@x's video is ready for your OK", ref:{approval_id, submission_id, deal_id}})` only if the approval is `pending`; `logEvent approval.requested`. Returns `{submission, approval}`.
- `GET /videos/:file` → `hono/bun` `serveStatic` rooted at `data/videos` (supports Range, so the `<video>` player can seek). Filename sanitized (basename only).

## Libraries / tools
hono (`serveStatic` from `hono/bun`), `lib/gemini` (Files API + structured output), `lib/db`, `lib/events`, yt-dlp 2026.08.19 (installed), ffmpeg/ffprobe (installed), gdown via `uvx`, treg CLI (installed at ~/.local/bin/treg).

## Cost
- treg post detail: ~$0.001 per Instagram link.
- Gemini 3.8 Flash on a 30 s video ≈ 10k input tokens: well under 1 cent per review. Nothing over 1 cent.

## Verification
1. `bunx tsc --noEmit`.
2. Download each kind once into a scratch name: a public direct mp4, a public Drive share, a Dropbox link, any public product reel (treg, ~$0.001 each, ≤$0.01 total). Tanush's own samples when they arrive.
3. `curl -X POST :4400/api/deals/<kai awaiting_video deal>/submissions -d '{"source_url":"…"}'` → submission with checks per seeded rule; deal moved to `video_feedback`.
4. `POST /submissions/:id/lily-approve` on a passing one → stage `video_ready`, pending video approval, chat card, events.
5. `curl -I -H 'Range: bytes=0-100' :4400/api/videos/<file>` → 206.
Needs thread A's `setStage/createApproval/postChat` live for steps 3–4.

## Decisions (orchestrator, CONTRACT Amendments v2)
1. Attachments: `messages.attachments_json = [{filename, mime, local_path}]`, files already in `data/videos/` (#9). I pick the first entry whose mime starts with `video/`.
2. WeTransfer dropped: friendly "send a Drive link or the reel" review.
3. A passing review stays `reviewing` until `lily-approve` sets `lily_ok` (#9).
4. Lily sends `feedback_to_creator`; D never messages creators (#9).
5. Test with any public product reel; ~$0.01 of treg OK. Tanush's samples pending.
6. Lily calls `POST /deals/:id/submissions {message_id | source_url}`; C never calls `reviewVideo` (#9).
7. No admin-UI uploads.
Also applied: `createApproval({campaign_id, deal_id, kind:'video', ref_id})` and `setStage` same-stage = no-op (#1, #3).

## Amendments v3 (applied)
1. **Must-pass rules need evidence.** The demo rule "The Product Unconference ID card must be clearly visible in the video." arrives verbatim in `brief.video_rules`. D can't tell which rules came from the goal, so every *presence* rule ("must show / be visible / mention / include") is judged on evidence: the model's internal schema has `seen_at` (timestamp or null) per rule, and a presence rule with `seen_at: null` is `passed:false` (note: "I didn't see the ID card anywhere"). Other rules (tone, length, framing) stay lenient: fail only when clearly broken. The prompt tells the model a partly hidden, blurry or half-second glimpse is not "clearly visible".
2. Demo path this must produce: Ansh round 1 (no card) → `verdict:'changes'`, deal `awaiting_video → video_feedback`, feedback like "Loved the energy at the venue! One small thing: could you show your Unconference ID card clearly for a couple of seconds?". Round 2 (card shown) → `verdict:'approve'`, Lily calls lily-approve → `video_ready` + video approval (pending in human_first, auto-approved by core in autopilot; per v3 #1 both modes gate video only in human_first, core owns that).
3. Event/non-ecommerce product (v3 #6): the prompt uses `brief` + `brand.name` generically ("the brand/event"), no "product" wording assumptions.
4. Allowlist (v3 #4) doesn't touch D: D never messages anyone.

## Tanush's answers (v3 follow-up)
1. Demo clips received (vertical, ~14 s each). A quick Gemini look (under 1 cent):
   - `WhatsApp Video 2026-11-22 at 15.32.14.mp4` = **round 1**: speaks to camera about the Unconference, **no badge**. Expected result: `changes`.
   - `WhatsApp Video 2026-11-22 at 15.32.08.mp4` = **round 2**: holds up the event pass at about 0:03–0:06 and 0:09–0:12. Expected result: `approve`.
   After approval I copy them to `data/videos/demo_r1.mp4` / `demo_r2.mp4` and use them in verification step 3.
2. Be lenient: **any badge or pass counts** as "the ID card". There's no reference photo, and the prompt says an event badge/pass/lanyard card shown legibly for a moment is enough. The evidence rule still applies: the badge has to be seen at some point, or the rule fails.

## Questions
None open.
