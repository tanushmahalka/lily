# creat0r CONTRACT (frozen once approved; changes only via the orchestrator)

## Ports and env
| What | Where |
|---|---|
| API | `http://127.0.0.1:4400`, every route under `/api` |
| Web | `http://127.0.0.1:5180` (Vite proxies `/api` → 4400) |
| Hermes API server (profile creat0r) | `http://127.0.0.1:8642` |
| Hermes webhooks (profile creat0r) | `http://127.0.0.1:8644/webhooks/<route>` |
| ig-bridge | `http://127.0.0.1:7777` (already running, owned by another session) |

`creat0r/.env` (gitignored, loaded by the API): `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX=lily@email.makelocalads.com`, `IG_BRIDGE_URL`, `IG_BRIDGE_TOKEN?`, `IG_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `TREG_*`, `HERMES_API_URL`, `HERMES_API_KEY`, `HERMES_WEBHOOK_URL`, `HERMES_WEBHOOK_SECRET`, `DEMO_ALLOWLIST` (comma-separated IG handles and emails; empty = send to everyone).

## Layout
```
creat0r/
  PLAN.md CONTRACT.md .env plans/
  db/schema.sql db/seed.sql           (orchestrator)
  data/creat0r.db data/videos/        (runtime, gitignored)
  api/src/index.ts                    (orchestrator: mounts every module)
  api/src/lib/{db,events,gemini}.ts   (orchestrator: shared helpers)
  api/src/core/     (A)   api/src/find/    (B)   api/src/channels/ (C)
  api/src/review/   (D)   api/src/lily/    (E)
  hermes/           (E)   web/             (F)
```
Every module folder exports `default` a Hono app, and `index.ts` mounts it at `/api`. Modules call each other **only via the exported functions listed below**, never by reaching into another folder's internals.

## Shared helpers (orchestrator, `api/src/lib/`)
- `db` – a bun:sqlite singleton. `id(prefix)` → `"cmp_8f3k2"`-style ids. JSON columns end in `_json` and are stored as text.
- `logEvent({campaign_id?, deal_id?, actor, type, summary, data?})` – inserts into `events` and pushes it to the SSE hub.
- `gemini.json({model?, prompt, schema, files?})` and `gemini.uploadVideo(path)` – structured output, Files API.

## Cross-module functions (signatures are frozen)
| Owner | Function |
|---|---|
| A core | `setStage(dealId, stage, latestAction)` – enforces allowed transitions and logs an event |
| A core | `postChat({thread_id?, campaign_id?, role:'lily', kind, body, ref?})` – a missing thread_id means the campaign's thread |
| A core | `createApproval({deal_id, kind:'deal'|'video', ref_id})` |
| B find | `analyzeCreator(handle, campaignId)` → analysis row |
| C channels | `sendToCreator(dealId, {channel, text})` → message row (applies the allowlist) |
| D review | `reviewVideo(dealId, {source_url? , local_path?, message_id?})` → submission row |
| E lily | `wakeLily(route:'campaign-start'|'creator-message'|'admin-decision', payload)` – a signed POST to the Hermes webhook |

## Stages and allowed transitions
```
shortlisted → reached_out → talking → negotiating → deal_ready
deal_ready → awaiting_video        (admin approves deal)
deal_ready → negotiating           (admin asks for changes)
awaiting_video → video_feedback → video_ready
video_feedback → video_feedback    (another round)
video_ready → completed            (admin approves video)
video_ready → video_feedback       (admin asks for changes)
reached_out → negotiating         (creator replies with terms straight away)
any (not completed) → declined
Nothing else is allowed.
```
`deal_ready` is entered only via `POST /deals/:id/offers/:oid/accept`, and `video_ready` only via `POST /submissions/:id/lily-approve`.

## Tables (db/schema.sql)
- `settings(key PRIMARY KEY, value_json)` – keys: `brand` = `{name, logo_url, about, tone, website}`, `default_autonomy`
- `accounts(id, channel['instagram'|'email'], handle, speaks_as, live 0/1)` – seed: instagram `ta__nush` speaks_as "Tanush", email `lily@email.makelocalads.com` speaks_as "Lily, partnerships at {brand}"
- `campaigns(id, status['ideating'|'active'|'done'], autonomy['human_first'|'autopilot'|'full_autopilot'], budget_usd, product_url, product_json, goal, chosen_idea_id, brief_json, guardrails_json, chat_thread_id, created_at)`
- `ideas(id, campaign_id, position 1..3, title, angle, video_description, creator_profile, keywords_json, video_rules_json, creators_target, fee_hint_usd, chosen 0/1)`
- `creators(id, ig_handle UNIQUE, ig_user_id, name, avatar_url, bio, email, followers, niche, lily_note, profile_json, updated_at)`
- `found_reels(id, campaign_id, creator_id, keyword, shortcode, url, caption, thumbnail_url, views, likes, comments, posted_at)`
- `analyses(id, creator_id, campaign_id, fit['great'|'good'|'weak'|'excluded'], score_internal, reasons_json, metrics_json, created_at)`
- `deals(id, campaign_id, creator_id, source['lily'|'manual'], stage, channel['instagram'|'email'], agreed_fee_usd, ig_thread_id, email_thread_id, latest_action, created_at, updated_at, UNIQUE(campaign_id, creator_id))`
- `offers(id, deal_id, version, by['lily'|'creator'], terms_json, within_guardrails 0/1, violations_json, status['open'|'superseded'|'accepted'|'rejected'], created_at)`
  - `terms_json = {fee_usd, deliverables, revision_rounds, usage_rights_days, delivery_days, upfront_pct}`
- `messages(id, deal_id, creator_id, channel, direction['in'|'out'], body, external_id, attachments_json, suppressed 0/1, created_at)` – `suppressed=1` means the demo allowlist blocked the send
- `submissions(id, deal_id, round, source_url, local_path, review_json, status['reviewing'|'changes'|'lily_ok'|'admin_ok'|'admin_changes'], created_at)`
  - `review_json = {verdict:'approve'|'changes', checks:[{rule, passed, note}], feedback_to_creator, notes_for_admin}`
- `approvals(id, campaign_id, deal_id NULL, kind['shortlist'|'deal'|'video'|'payment'], ref_id, status['pending'|'approved'|'changes'], decided_by['admin'|'lily'], admin_note, created_at, decided_at)` – when the campaign's autonomy mode turns a gate off, the API creates the approval already `approved` with `decided_by:'lily'`
- `payouts(id, deal_id, amount_usd, status['pending'|'approved'|'paid'], created_at, paid_at)` – created when a deal reaches `completed`; surface only, no money moves
- `perf_snapshots(id, deal_id, post_url, views, likes, comments, taken_at)` – seeded only, no job
- `chat_threads(id, title, campaign_id NULL, created_at)`
- `chat_messages(id, thread_id, role['admin'|'lily'], kind['text'|'ideas'|'approval'|'update'|'steps'], body, ref_json, created_at)`
- `events(id, ts, campaign_id, deal_id, actor['lily'|'admin'|'creator'|'system'], type, summary, data_json)`

## HTTP API (all JSON, under /api)
**Core (A)**
- `GET /settings` · `PUT /settings/:key {value}` · `GET /accounts`
- `PATCH /campaigns/:id {autonomy}`
- `POST /campaigns/:id/shortlist/submit` → Lily is done shortlisting: creates the `shortlist` approval (auto-approved unless human-first) and, if auto-approved, `wakeLily('admin-decision', …)` so outreach starts
- `POST /payouts/:id/approve` · `POST /payouts/:id/paid` · `GET /deals/:id/perf`
- `POST /campaigns {budget_usd, product_url, goal}` → `{campaign, thread_id}`, then calls `wakeLily('campaign-start', {campaign_id, thread_id, phase:'ideas'})`. *Exception:* if E decides the ideas run goes through the chat stream instead, that decision is made in E's plan, approved by the orchestrator.
- `GET /campaigns` → `[{campaign, needs_you, stage_counts}]`
- `GET /campaigns/:id` → `{campaign, ideas, deals:[{deal, creator, analysis}], approvals_pending}`
- `PUT /campaigns/:id/product {product_json}`
- `POST /campaigns/:id/ideas {ideas:[3 × idea]}` → also posts a chat message `kind:'ideas'`
- `POST /campaigns/:id/choose {idea_id}` → derives brief + guardrails, status `active`, `wakeLily('campaign-start', {campaign_id, phase:'find'})`
- `POST /deals {campaign_id, creator_id, channel}` → stage `shortlisted`
- `PATCH /deals/:id {stage, latest_action}` (transitions enforced)
- `GET /deals/:id/context` → `{campaign, brief, guardrails, creator, analysis, reels, offers, messages, submissions, approvals}` – Lily's file
- `POST /deals/:id/offers {by, terms}` → 422 `{violations}` if `by:'lily'` and outside the guardrails; creator offers are always stored, with their violations
- `POST /deals/:id/offers/:oid/accept` → stage `deal_ready`, approval `deal`, chat card
- `POST /deals/:id/escalate {question}` → chat message to the admin, event
- `GET /approvals?status=pending` · `POST /approvals/:id {decision:'approve'|'changes', note?}` → moves the stage, `wakeLily('admin-decision', {approval_id})`
- `GET /creators` · `GET /creators/:id` (with deals + campaigns)
- `GET /chat/threads` · `GET /chat/threads/:id/messages` · `POST /chat/notify {campaign_id?, thread_id?, kind, body, ref?}` (Lily → admin)
- `GET /events?campaign_id&since` · `GET /stream` (SSE: `event` and `chat` messages)

**Find (B)**
- `POST /product/read {url}` → `{brand:{name, logo_url, about, tone, website}, product:{title, description, price, images[], category}}`. It fills `settings.brand` if that is empty and stores `product_json` on the campaign when `campaign_id` is passed. The page is read via treg markdown fetch, then Gemini.
- `POST /find/reels {campaign_id, keyword, limit?}` → saved reels + creators
- `POST /creators/analyze {handle, campaign_id}` → analysis
- `GET /creators/past?campaign_id=` → creators we've worked with, with fit for this campaign
- `POST /creators {ig_handle, email?, campaign_id?}` (add manually). With `campaign_id`, it also creates a deal with `source:'manual'`, which skips the shortlist gate, and calls `wakeLily('admin-decision', {deal_id, reason:'manual_add'})` so outreach starts

**Channels (C)**
- `POST /deals/:id/send {channel, text}` → message (follows on IG before the first DM)
- `POST /inbound/instagram` (ig-bridge webhook, HMAC `X-IGB-Signature`)
- Email poller (internal, every 10 s) → same pipeline: store the message → find the active deal → `logEvent` → `wakeLily('creator-message', {deal_id, message_id})`

**Review (D)**
- `POST /deals/:id/submissions {source_url? , message_id?}` → submission with review
- `POST /submissions/:id/lily-approve` → stage `video_ready`, approval `video`, chat card
- `GET /videos/:file` (serves `data/videos` to the UI player)

**Lily (E)**
- `POST /chat/threads/:id/messages {text}` → SSE stream: `{type:'step', label}`, `{type:'delta', text}`, `{type:'done', message}`. Stores both turns. Calls Hermes `/v1/chat/completions` with `stream:true`, sending the thread's history from the DB.

## Hermes webhook routes (E), payloads from the API
- `campaign-start {campaign_id, phase:'ideas'|'find'}`
- `creator-message {deal_id, message_id}` – coalesce key `deal_id`, window 20 s
- `admin-decision {approval_id} | {deal_id, reason:'manual_add'}`

## Event types (`events.type`)
`campaign.created, product.read, brand.inferred, settings.changed, autonomy.changed, shortlist.submitted, creator.added_manually, payout.created, payout.approved, payout.paid, ideas.proposed, idea.chosen, reels.found, creator.analyzed, creator.shortlisted, message.sent, message.received, message.suppressed, offer.made, offer.received, offer.accepted, deal.escalated, approval.requested, approval.decided, video.received, video.reviewed, stage.changed, creator.declined`
Each event carries a one-line human `summary`. The UI shows it verbatim, so write it like Lily talking: "Messaged @mia.makes on Instagram".

## Running (orchestrator owns these processes)
- The API runs **once**, in watch mode: `cd creat0r/api && bun --env-file=../.env --watch src/index.ts` (log: `data/api.log`). It reloads when any module file changes. Do not start a second copy, and do not kill it. If it's down, tell the orchestrator.
- Demo data: `cd creat0r/api && bun run seed` **wipes** `data/creat0r.db`. Only the orchestrator runs it; ask if you need a reseed.
- Typecheck: `cd creat0r/api && bunx tsc --noEmit`.
- Shared deps live in `api/package.json`. Ask the orchestrator before adding a dependency to `api/` (`web/` is F's own package).

## Amendments v2 (orchestrator, after the plan round). These override anything above.
1. **Signatures:** `createApproval({campaign_id, deal_id?, kind, ref_id?})` (as stubbed). `postChat({..., role:'lily'|'admin', ...})`. `sendToCreator(dealId, {channel, text, subject?})`; `subject` is used for a new email thread, defaulting to `"{brand.name} × {creator name}"`.
2. **Onboarding ideas run through the chat stream, not a webhook.** `POST /campaigns` creates the campaign and its thread, renamed to the product title once `PUT /product` lands (goal until then), and does **not** wake Lily. F sends the first admin message (budget, link, goal) to `POST /chat/threads/:id/messages`, and Lily's steps and ideas stream back there. `campaign-start` keeps only `phase:'find'` (fired by `choose`).
3. **Who moves stages:** C moves `shortlisted→reached_out` on the first **non-suppressed** send and `reached_out→talking` on the first inbound message. A suppressed send leaves the stage alone and sets `latest_action` = "Drafted, not sent (demo allowlist)". The first offer auto-moves `reached_out|talking→negotiating` (A). Lily moves `declined` via `PATCH`. `setStage` to the same stage is a no-op that only updates `latest_action`. Any non-completed stage can go to `declined`, which is also how the admin removes someone from a shortlist.
4. **Offers:** accepting a creator offer that is outside the guardrails is refused with 422, so Lily must escalate. `full_autopilot` in `PATCH /campaigns/:id` → 400 `{error:"coming_soon"}`.
5. **Approval gates by autonomy:** human_first gates shortlist, deal, video and payment. autopilot gates payment only. The deal gate in human_first is pending Tanush's confirmation, so keep the gate map in one constant. Payment decisions do not wake Lily. Approving a payout through either `POST /payouts/:id/approve` or `POST /approvals/:id` keeps both rows in sync.
6. **Enriched reads:** every approval object (in `GET /approvals` and `approvals_pending`) is `{...approval, campaign_title, deal, creator, ref}`, where `ref` = offer | submission | payout | `{deals:[…shortlisted deals with creator]}` for a shortlist. `GET /campaigns/:id` also returns `payouts` and a computed `title` (= `brief.title ?? goal`). `GET /creators` rows include `deals:[{deal_id, campaign_id, campaign_title, stage}]`. `GET /deals/:id/context` also returns `deal`, `brand` and `accounts`, and the UI's creator sheet uses it too. `GET /deals/:id/perf` → `{snapshots, lily_line}`.
7. **General chat thread:** A creates a "General" thread (campaign_id null) lazily on the first `GET /chat/threads`.
8. **SSE `GET /api/stream`:** named events. `event: event` with `data:` = the event object, and `event: chat` with `data:` = the full chat_messages row (ref parsed). A keepalive comment every 15 s.
9. **Attachments:** `messages.attachments_json` = `[{filename, mime, local_path}]`, with files saved under `data/videos/` by C. Lily calls `POST /deals/:id/submissions {message_id | source_url}`. C never calls `reviewVideo` itself. Lily sends `feedback_to_creator` herself. D never messages creators. A passing review stays `reviewing` until `lily-approve` sets `lily_ok`.
10. **Manual add:** `POST /creators {ig_handle, email?, campaign_id?, wake?=true}`. It creates a `source:'manual'` deal at `shortlisted`, runs `analyzeCreator` in the background (non-blocking) and, unless `wake:false`, calls `wakeLily('admin-decision', {deal_id, reason:'manual_add'})`. Lily passes `wake:false` when she adds a creator herself from chat.
11. **Inbound from unknown senders** (no creator or active deal): store the message and log an event, but do **not** wake Lily.
12. **New event types:** `lily.unreachable` (wakeLily failed), `message.suppressed`.
13. **lib/gemini `json()`** also accepts `inline?: {data: string /*base64*/, mimeType}[]`.
14. **Deps approved:** `agentmail` and `eventsource-parser` in `api/`. Use inline validation, no zod.
15. **Brand:** `/product/read` overwrites `settings.brand` when it's empty **or** when its `website` host differs from the product URL's host.

## Amendments v3 (Tanush's answers, binding)
1. **Deal gate is ON in human_first.** human_first gates shortlist, deal, video and payment. autopilot gates payment only. Final.
2. Manually added creators skip the shortlist gate and Lily starts outreach right away (confirmed).
3. Video delivery: a link (Drive or a posted reel) in a DM or email, or an email attachment (confirmed).
4. **DEMO_ALLOWLIST is on for the hackathon:** `DEMO_ALLOWLIST=anshdixit03,kush_2311,tanush@makelocalads.com` (set in .env). **Ansh (@anshdixit03) is the main demo creator**; Kush is the backup; tanush@makelocalads.com is the email test creator. Unknown or non-allowlisted senders never wake Lily.
5. ig-bridge will be restarted by its owner with `WEBHOOK_URL=http://127.0.0.1:4400/api/inbound/instagram` and `WEBHOOK_SECRET=$IG_WEBHOOK_SECRET`.
6. **Demo product link:** https://www.theproductfolks.com/product-unconference-2026, the event where the hackathon runs. "Product" here is an event, so brand = The Product Folks and product = Product Unconference 2026 (a ticket/registration). B and Lily must handle a non-ecommerce page.
7. **Demo video rule:** "The Product Unconference ID card must be clearly visible in the video." The admin states it in the campaign goal at onboarding. Lily copies any hard requirement in the goal **verbatim** into the `video_rules` of all 3 ideas. D treats it as a must-pass rule. In the demo, Ansh's first video leaves the card out, so Lily kindly asks for a revision; round 2 shows it.
