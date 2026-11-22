# Thread A — Core API plan

Status: orchestrator answers (Amendments v2) and Tanush's answers (Amendments v3) are folded in below. Waiting for "approved".

Owns `api/src/core/` only. Builds every Core (A) endpoint in CONTRACT plus the frozen exports
`setStage`, `postChat`, `createApproval` (signatures kept exactly as stubbed in `core/index.ts`).

## Libraries (no new dependencies)
- **hono**: routing, `HTTPException`, and `streamSSE` from `hono/streaming` for `GET /stream` (no hand-rolled SSE).
- **bun:sqlite** through `lib/db` (`db`, `id`, `now`, `parseRow(s)`); `db.transaction()` for multi-row writes (accept, approval decisions).
- `lib/events`: `logEvent` for every event, `publish({channel:'chat'})` for chat messages, `subscribe` for SSE.
- `../lily` `wakeLily` (fire-and-forget, errors logged, never fails the HTTP request).
- Input checks: small inline checks returning 400. No zod (orchestrator decision).

## Files
| File | Contents |
|---|---|
| `core/index.ts` | Hono app, mounts the route groups below, re-exports `setStage`, `postChat`, `createApproval`, `Stage` |
| `core/stage.ts` | `TRANSITIONS` table, `canMove(from,to)`, `setStage()`; payout creation on `completed` |
| `core/guardrails.ts` | `deriveGuardrails(budget, creatorsTarget)`, `checkTerms(terms, guardrails)` → `string[]` violations (plain words) |
| `core/approvals.ts` | `createApproval()` (gate logic), `decideApproval()` (stage effects), `enrichApproval()` for UI cards |
| `core/chat.ts` | `postChat()`, `ensureGeneralThread()`, chat routes |
| `core/routes.ts` | campaigns, ideas, choose, deals, offers, accept, escalate, context, creators, settings, accounts, payouts, perf, events, stream |

## Exports (frozen signatures)
- `setStage(dealId, stage, latestAction)`: reads deal, throws `HTTPException(409)` if the move is not in CONTRACT's table.
  Same stage = no-op that only updates `latest_action`, no event. Writes `stage`, `latest_action`, `updated_at`; logs
  `stage.changed` (summary e.g. "@mia.makes moved to Negotiating"); `declined` also logs `creator.declined` and posts a chat `update`.
  Entering `completed` creates the payout (`agreed_fee_usd`), logs `payout.created`, and calls `createApproval({kind:'payment'})`.
- `postChat({thread_id?, campaign_id?, role:'lily'|'admin', kind, body, ref?})` (amendment 1: E stores admin turns through it): missing thread_id → campaign's `chat_thread_id`, neither → General thread.
  Inserts and `publish({channel:'chat', data: message})`. Returns `{id}`.
- `createApproval({campaign_id, deal_id?, kind, ref_id?})`: gate on/off from `campaign.autonomy`, read from ONE constant `GATES` (v3.1: deal gate ON in human_first, final):

  | kind | human_first | autopilot | full_autopilot |
  |---|---|---|---|
  | shortlist | pending | auto | auto |
  | deal | pending | auto | auto |
  | video | pending | auto | auto |
  | payment | pending | pending | auto |

  Auto = row inserted `approved`, `decided_by:'lily'`, and the same stage effects as an admin approve are applied
  (e.g. deal → `awaiting_video`). Logs `approval.requested` (pending) or `approval.decided` (auto). Pending ones post a
  chat card `kind:'approval'`, `ref:{approval_id, deal_id, kind}`.

## Endpoints (all under /api) — build order
**First ~15 min (unblocks F):** `GET /campaigns`, `GET /campaigns/:id`, `GET /creators`, `GET /creators/:id`,
`GET /chat/threads`, `GET /chat/threads/:id/messages`, `GET /approvals`, `GET /settings`, `GET /accounts`, `GET /events`, `GET /stream`.

Then:
- `PUT /settings/:key {value}` → `settings.changed`. `PATCH /campaigns/:id {autonomy}` → `autonomy.changed`; `full_autopilot` → 400 `{error:"coming_soon"}`.
- `POST /campaigns {budget_usd, product_url, goal}` → autonomy = `settings.default_autonomy`, creates its chat thread titled with the goal, `campaign.created`. Returns `{campaign, thread_id}`. Does **not** wake Lily and posts no chat message (amendment 2: F sends the first admin message to E's stream).
- `GET /campaigns` → `[{campaign, needs_you: <pending approvals count>, stage_counts: {stage: n}}]`, newest first.
- `GET /campaigns/:id` → `{campaign, title (= brief.title ?? goal), ideas, deals:[{deal, creator, analysis}], approvals_pending (enriched), payouts:[{...payout, deal_id, creator}]}`; analysis = latest for that campaign.
- `PUT /campaigns/:id/product {product_json}` → also renames the campaign's chat thread to `product_json.title` (falls back to the goal). No assumptions about price/images: v3.6's demo product is an event ticket, so only `title` is read.
- `POST /campaigns/:id/ideas {ideas}` → replaces unchosen ideas, positions 1..n, `ideas.proposed`, chat `kind:'ideas'` `ref:{campaign_id, idea_ids}`.
- `POST /campaigns/:id/choose {idea_id}` → marks chosen, `brief_json` (idea fields, same shape as seed; `video_rules` copied verbatim from the idea, so v3.7's hard rule "The Product Unconference ID card must be clearly visible in the video." reaches D and Lily unchanged), `guardrails_json` via PLAN §4, status `active`, `idea.chosen`, chat `update` "On it. I'll shortlist creators and reach out. I'll ask you before any deal is final.", `wakeLily('campaign-start', {campaign_id, phase:'find'})`.
  Formula: `max = round10(budget / creators_target × 1.2)`, `min = round10(max × 0.25)` (1500/6 → 300/80, matches seed); other bands fixed as in PLAN §4.
- `POST /campaigns/:id/shortlist/submit` → `shortlist.submitted`, `createApproval({kind:'shortlist'})`; if auto-approved → `wakeLily('admin-decision', {approval_id})`.
- `POST /deals {campaign_id, creator_id, channel}` → `shortlisted`, `creator.shortlisted`; 409 on duplicate.
- `PATCH /deals/:id {stage?, latest_action?}` → `setStage`; `deal_ready` / `video_ready` refused here (only via accept / lily-approve).
- `GET /deals/:id/context` → `{campaign, brief, guardrails, creator, analysis, reels, offers, messages, submissions, approvals}` + `deal`, `brand`, `accounts` (amendment 6; the UI creator sheet uses it too).
- `POST /deals/:id/offers {by, terms}` → `checkTerms`; `by:'lily'` + violations → 422 `{violations}` and nothing stored. Otherwise: previous open offers → `superseded`, next version stored with `within_guardrails` + violations, `offer.made` / `offer.received`. Auto-moves `reached_out|talking → negotiating`.
- `POST /deals/:id/offers/:oid/accept` → offer must be open and within guardrails (else 422, Lily escalates); offer `accepted`, `agreed_fee_usd` set, `setStage('deal_ready')`, `offer.accepted`, `createApproval({kind:'deal', ref_id: oid})`.
- `POST /deals/:id/escalate {question}` → chat `text` to the campaign thread, `ref:{deal_id}`, `deal.escalated`.
- `POST /approvals/:id {decision, note?}` (pending only, else 409) → `approval.decided`, then:
  - deal: approve → `awaiting_video`; changes → `negotiating`.
  - video: approve → submission `admin_ok`, `completed` (creates payout + payment approval); changes → submission `admin_changes`, `video_feedback`.
  - payment: approve → payout `approved`.
  - shortlist: no stage change.
  Then `wakeLily('admin-decision', {approval_id})` for shortlist/deal/video only; payment decisions don't wake Lily.
- `POST /payouts/:id/approve` → payout `approved` + its pending payment approval `approved` (same code path as above). `POST /payouts/:id/paid` → only from `approved`, `paid_at`, `payout.paid`.
- `GET /deals/:id/perf` → `{snapshots, lily_line}`; `lily_line` computed from the snapshots, e.g. "Still growing: 14.9k views 30 hours after posting" (growing / levelling off by comparing the last two deltas; `null` when no snapshots).
- `GET /approvals?status=` → `[{...approval, campaign_title, deal, creator, ref}]`, `ref` = offer | submission | payout | `{deals:[shortlisted deals with creator]}` for a shortlist. Same enrichment in `approvals_pending`.
- `GET /creators` → each row with `deals:[{deal_id, campaign_id, campaign_title, stage}]`; `GET /creators/:id` → `{creator, deals:[{deal, campaign, analysis, offers, submissions}]}`.
- `GET /chat/threads` ("General" thread, campaign_id null, created lazily on first call) · `GET /chat/threads/:id/messages` · `POST /chat/notify` → `postChat`.
- `GET /events?campaign_id&since` (since = ms epoch, ascending, limit 200) · `GET /stream` → `streamSSE`, named events: `event: event` with the event object, `event: chat` with the full chat_messages row (ref parsed); a keepalive comment every 15 s; unsubscribe on abort.

Errors: 404 unknown ids, 400 bad input, 409 illegal transition / already decided, 422 guardrail violations. Bodies `{error}` (`{violations}` for 422).

## Verification
1. `cd creat0r/api && bunx tsc --noEmit`.
2. Curl script `/tmp/a-core-check.sh` against the running API (watch mode reloads, no restart): every GET returns seeded data; `curl -N /api/stream` receives an event when I `PATCH` autonomy.
3. Flow on a fresh campaign created by POST (no Lily wake expected) (no reseed, seeded rows untouched except where noted): ideas → choose (guardrails = expected numbers) → deal → lily offer out of band (422) → in band → accept → pending deal approval (human_first) → approve → `awaiting_video`; switch to autopilot and accept on a second deal → auto-approved by lily. Illegal `PATCH` → 409. Payout approve → paid.
4. Report what works, what doesn't, and the commands.

## Amendments v3: what changes for A
- v3.1 deal gate ON in human_first: settled in `GATES`, no longer pending.
- v3.2 manual adds skip the shortlist gate: B's `POST /creators` owns it; A's only part is that a `source:'manual'` deal never appears in a shortlist approval's `ref.deals` (filter `source='lily'`).
- v3.4 allowlist / unknown senders: C's concern; nothing in A.
- v3.6 event product: thread rename reads only `product_json.title`.
- v3.7 video rule: A stores ideas' `video_rules` and copies them into the brief verbatim; no rewriting. Copying the goal's rule into ideas is Lily's job (E).
- Stub fix: `postChat`'s `role` widens from `'lily'` to `'lily'|'admin'` per Amendment v2.1 (the current stub still says `'lily'`).

## Questions
None open.
