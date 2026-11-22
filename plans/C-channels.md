# Thread C — Channels (plan)

Owns `api/src/channels/` only. Status: **updated for CONTRACT Amendments v2 + v3; waiting for "approved"**.

## What I build
Lily's mouth and ears: send to a creator on Instagram (ig-bridge) or email (AgentMail), and turn every creator reply on either channel into a stored message + event + a Lily wake-up.

## Libraries
- **`agentmail`** (official SDK, npm 0.5.54) for send, reply, list, get, attachment download, labels. **Needs the orchestrator's OK to add to `api/package.json`** (Q1).
- ig-bridge: plain `fetch` to its 3 endpoints (it has no SDK).
- HMAC: `node:crypto` `createHmac` + `timingSafeEqual`.
- Hono for routes. No other deps.

## Files
| File | Contents |
|---|---|
| `channels/index.ts` | Hono app (routes), `sendToCreator`, `startChannels` (frozen exports) |
| `channels/instagram.ts` | `igFollow(handle)`, `igSend({to?, threadId?, text})`, inbound payload → pipeline |
| `channels/email.ts` | AgentMail client, `emailSend(...)`, `emailReply(...)`, `pollEmail()`, attachment saver |
| `channels/inbound.ts` | shared pipeline `handleInbound({channel, from, body, external_id, thread_ref, attachments})` |
| `channels/allowlist.ts` | `isAllowed(creator)` from `DEMO_ALLOWLIST` |

## Functions / endpoints

**`sendToCreator(dealId, {channel, text})` → message row**
1. Load deal + creator + account for the channel (`accounts.live=1`), brand from `settings.brand`.
2. Allowlist: `DEMO_ALLOWLIST` empty → everyone; else match `ig_handle` (case-insensitive, `@` stripped) or `email`. Blocked → insert `messages` row `direction:'out', suppressed:1`, `logEvent message.suppressed` ("Held a DM to @x (not on the demo list)"), return it. No network call.
3. **Instagram:** if the deal has no `ig_thread_id` and no earlier non-suppressed `out` IG message → `POST /follow {username}` first (a follow error is logged but does not block the DM). Then `POST /messages` with `threadId` if known, else `to: ig_handle`. Save `messageId` as `external_id`, store returned `threadId` on `deals.ig_thread_id` and `userId` on `creators.ig_user_id`.
4. **Email:** no `email_thread_id` → `messages.send({to: creator.email, subject, text})`; else reply to the latest inbound email message in that thread (`messages.reply`), falling back to the latest message in the thread. Sign-off appended in code: `\n\n— Lily, partnerships at {brand.name}` (from `accounts.speaks_as` with `{brand}` filled). Save `thread_id` on `deals.email_thread_id`, `message_id` as `external_id`. Subject: Q3.
5. Insert `messages` row (`direction:'out'`), `logEvent message.sent` ("Messaged @mia.makes on Instagram" / "Emailed mia@… "). Send failure → throws (route returns 502 with the error), nothing stored. **No stage change** — that's Lily/core's call (Q4).

**`POST /deals/:id/send {channel, text}`** → `sendToCreator`; 400 on bad body, 404 unknown deal, 502 provider error.

**`POST /inbound/instagram`** (ig-bridge webhook)
- Verify `X-IGB-Signature: sha256=<hex>` = HMAC-SHA256(raw body, `IG_WEBHOOK_SECRET`), constant-time; 401 otherwise.
- Only `event:'message.received'`; ignore group threads. Body = `text`, or `shareUrl` when it's a share (so a reel link reaches Lily/D). Dedup on `external_id = message.id`.
- → pipeline with `from = sender.username`, `thread_ref = thread.id`, also stores `sender.igid` on the creator.

**Email poller** (started by `startChannels()`, every 10 s, never overlapping)
- `messages.list(inbox, {labels:['unread'] / received})` → for each message not from us and not yet in `messages.external_id`: download attachments (`getAttachment`) to `data/videos/<msg_id>_<filename>` (video/* or common video extensions only; others are listed but not saved), then pipeline with `from = sender email`, `thread_ref = thread_id`, body = `extracted_text ?? text` (quoted reply stripped). Mark processed with label `creat0r-seen` (+ remove `unread`) so restarts don't replay.
- On first boot, baseline: mark everything already in the inbox as seen without processing (avoids waking Lily on old mail). Q5.

**Shared pipeline `handleInbound`**
1. Match creator: IG → `creators.ig_handle` (or `ig_user_id`); email → `creators.email` (lowercased). Fallback: deal whose `ig_thread_id` / `email_thread_id` equals `thread_ref`.
2. Match active deal: that creator's most recently updated deal with stage not in (`completed`,`declined`), preferring the one whose thread id matches. Also back-fill `deals.ig_thread_id`/`email_thread_id` if empty.
3. Insert `messages` (`direction:'in'`, `attachments_json` = `[{filename, content_type, local_path?, size}]`).
4. `logEvent message.received` ("@mia.makes replied on Instagram"); attachment present → also `video.received`? **No** — that's D's event; I only store the path (Q6).
5. `wakeLily('creator-message', {deal_id, message_id})` via E's export.
- Unknown sender / no active deal → message stored with `deal_id`/`creator_id` null, `logEvent message.received` with actor `creator` and no deal, **no wake** (Q7).

## Verification
1. `bunx tsc --noEmit`.
2. Allowlist: with a deal whose creator isn't on the list → `curl POST /api/deals/:id/send` → row with `suppressed=1`, event `message.suppressed`, no bridge call.
3. IG inbound: craft a payload, sign with `IG_WEBHOOK_SECRET` via `openssl dgst -sha256 -hmac`, `curl POST /api/inbound/instagram` → 200, message row, event; bad signature → 401. `wakeLily` call observed (E's stub/log).
4. Real IG send: one DM to a test handle Tanush names (Q2) → message on his phone; follow happened once.
5. Real email: send to an address Tanush names, reply from it with a small mp4 → within ~10 s a `messages` row with `direction:'in'`, attachment saved under `data/videos/`, event, wake.
Costs: AgentMail and ig-bridge calls are free to us (no per-call charge I know of; the plan includes them). No Gemini/treg calls.

## Decisions (orchestrator round 1, CONTRACT Amendments v2)
- `agentmail` dep approved and installed.
- Signature is now `sendToCreator(dealId, {channel, text, subject?})`; `subject` is used only for a new email thread, default `"{brand.name} × {creator.name ?? '@'+ig_handle}"`.
- **Stages (Amendment 3):** C moves `shortlisted→reached_out` on the first non-suppressed send and `reached_out→talking` on the first inbound message, via A's `setStage`. A suppressed send leaves the stage and sets `latest_action` = "Drafted, not sent (demo allowlist)" (via `setStage(dealId, sameStage, …)`, a no-op stage). Other sends/inbounds update `latest_action` only ("Messaged on Instagram" / "Replied on email").
- Email poller baselines the existing inbox at first start (label everything seen, process nothing).
- **Attachments (Amendment 9):** `attachments_json = [{filename, mime, local_path}]`, files in `data/videos/`. C never calls `reviewVideo`; Lily calls `POST /deals/:id/submissions {message_id}`.
- Unknown senders: store + event, no wake (Amendment 11).
- **HMAC:** when `IG_WEBHOOK_SECRET` is set, a missing or wrong `X-IGB-Signature` → 401; when it is unset, accept unsigned. I never touch the bridge; the orchestrator coordinates its webhook URL with the bridge owner.
- No `IG_BRIDGE_TOKEN` (confirmed). Bearer header sent only if the env var exists.
- **AgentMail inbox display name → "Lily"** via the SDK (`inboxes.update` with `displayName`), done once in `startChannels()` if it differs (idempotent), plus a one-off manual run during verification. Free call.

## Amendments v3 (Tanush's answers) — what changes for C
- **Inbound allowlist gate (v3 #4):** the same `DEMO_ALLOWLIST` check now applies to inbound too. A sender that is unknown **or** not on the allowlist → message stored + `message.received` event, **no wake, no stage move**. Only an allowlisted sender with an active deal wakes Lily. (Empty list still = everyone, but v3 says it's on for the hackathon.)
- **Video links (v3 #3):** inbound body is passed through verbatim (IG `text`, plus `shareUrl` appended when the DM is a reel/post share; email `extracted_text ?? text`), so Drive / reel links reach Lily intact. Email video attachments saved to `data/videos/` as before. C never calls D.
- **ig-bridge webhook (v3 #5):** its owner restarts it with `WEBHOOK_URL=http://127.0.0.1:4400/api/inbound/instagram`, `WEBHOOK_SECRET=$IG_WEBHOOK_SECRET`. My HMAC check matches that; I still never touch the bridge. Verification adds one live inbound DM test once it's pointed at us.
- **Deal gate on in human_first (v3 #1), demo product/video rule (v3 #6–7):** no change for C.

## Tanush's answers (round 3)
- Allowlist: `anshdixit03`, `kush_2311`, plus a test email (address still needed). Ansh is the primary live test; Kush is not tested.
- Live tests target Ansh (IG) and the test email: approved.

## Still pending
- The test email address.
- `.env` `DEMO_ALLOWLIST` is still empty; the orchestrator (owner of `.env`) needs to set `DEMO_ALLOWLIST=anshdixit03,kush_2311,<test email>`.
- The word "approved" before any code.
