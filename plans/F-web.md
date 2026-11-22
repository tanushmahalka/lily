# Thread F: Admin UI (`web/`)

Owns `web/` only. Own package. Vite + React + TypeScript, dev server `127.0.0.1:5180`, `/api` proxied to `127.0.0.1:4400`.
Status: **plan, waiting for "approved". No code written yet.**

## Libraries (library first)
| Need | Library |
|---|---|
| Every visual component | **Halaska kit**: `web/src/kit/halaska-kit.jsx` + `halaska-kit.d.ts`, curl'd from ui.halaska.com (MIT, react only) |
| Build / dev | `vite`, `@vitejs/plugin-react`, `typescript` |
| Routing | `react-router` v7 (data-less `BrowserRouter`) |
| Server state, optimistic writes | `@tanstack/react-query` |
| Motion | `motion` (`motion/react`) for row moves between stage groups, card enter/exit; respects `prefers-reduced-motion` |
| Lily's chat text | `react-markdown` + `remark-gfm` |
| POST chat stream (SSE over POST, so `EventSource` can't do it) | `eventsource-parser` |
| Live updates `GET /api/stream` | native `EventSource` (no lib needed) |
| Relative times ("4 min ago") | `date-fns` `formatDistanceToNowStrict` |

No other UI library, no CSS framework (the kit uses inline styles). Theme: light, `BrandProvider` greyscale default (see Q10).

## Screens and routes
| Route | Screen | Kit pieces |
|---|---|---|
| `/` | redirect: `/onboarding` if `GET /campaigns` is empty, else `/campaigns` | |
| `/onboarding` | Budget (`InputGroup` prefix `$`), Product link (`TextInput`), Goal (`TextArea` + 3 suggestion `Chip`s), **Start with Lily** (`Button loading`) → `POST /campaigns` → navigate `/chat/:thread_id` | Card, Heading |
| `/chat`, `/chat/:threadId` | `ChatHistory` (threads list) + `Conversation` + `ChatInput`. Message kinds: `text` → `Message` with markdown; `steps` → `ReasoningSteps`/`ThinkingSteps`; `ideas` → `IdeasCard` (Choicebox, 3 options + **Go with this**); `approval` → `ApprovalCard`; `update` → system-style `Message`. While streaming: live `ThinkingSteps` from `{type:'step'}` + `Message streaming` from `{type:'delta'}` | ChatHistory, Conversation, Message, ChatInput, Choicebox, ThinkingSteps |
| `/campaigns` | list of campaigns: name (chosen idea title or goal), status `StatusBadge`, "needs you" count, stage counts as a single line of text (not tiles) → click opens campaign | ListItem, Badge, EmptyState |
| `/campaigns/:id` | **Header**: title, `SegmentedControl` Human-first / Autopilot / Full autopilot (Full autopilot click → toast "Coming soon", value doesn't change), **Add creator** button. **Brief**: `Collapsible` (closed) with idea + video rules + trust line "Lily can agree up to $X per creator. Every deal and every final video comes to you." **Needs you** (only when pending): one `ApprovalCard` per pending approval (shortlist / deal / video / payment). **Creators in this campaign**: grouped by stage in PLAN order, row = Avatar, @handle, stage pill (`StatusBadge`), Lily's `latest_action`, `declined` group collapsed. **Payments**: one row per payout, amount, **Approve payment** → **Mark paid** | SegmentedControl, Collapsible, ListItem, Avatar, StatusBadge, Button, FormDialog, Sheet |
| `/campaigns/:id?deal=:dealId` | **Creator sheet** (`Sheet` right): why Lily picked them (fit + reasons + 3 reels as thumbnail links), one conversation IG + email merged by time (read-only `Message`s, channel tag, suppressed ones marked "not sent (demo allowlist)"), **Tell Lily…** box, offers version list (by, fee, terms in one line, within-guardrails badge, status), video rounds (player or link, checks ✓/✗ with notes, Lily's feedback), **After posting**: `Sparkline` of views + "Checked every 6 hours" + Lily's sentence | Sheet, Message, Badge, Sparkline, Accordion |
| `/creators` | everyone: avatar, handle, niche, campaign chips (`Tag` with stage), `lily_note` → click opens sheet with past engagements | ListItem, Tag, Sheet |
| `/settings` | `Tabs`: **Brand** (name, logo url + preview Avatar, about, tone; Save → `PUT /settings/brand`), **Accounts** (read-only list from `GET /accounts`, live `StatusDot`), **Lily** (`SegmentedControl` default autonomy → `PUT /settings/default_autonomy`) | Tabs, TextInput, TextArea, ListItem, StatusDot |

App shell: left sidebar with 4 items **Campaigns · Creators · Chat · Settings**, a small dot on Campaigns and Chat when `GET /approvals?status=pending` is non-empty (an action count, no metrics). Sidebar built from kit `ListItem`/`Button ghost` + `StatusDot`.

## Files
```
web/
  package.json  tsconfig.json  vite.config.ts  index.html
  src/
    main.tsx              QueryClientProvider, BrowserRouter, BrandProvider, ToastHost
    App.tsx               routes + AppShell
    kit/halaska-kit.jsx   kit/halaska-kit.d.ts   (vendored, untouched)
    lib/api.ts            fetch wrapper `api<T>(path, init)`, typed GET/POST helpers; throws on non-2xx with body
    lib/types.ts          TS types mirroring CONTRACT tables (Campaign, Idea, Deal, Creator, Analysis, Offer, Message, Submission, Approval, Payout, Perf, ChatThread, ChatMessage, Event)
    lib/queries.ts        query keys + hooks: useCampaigns, useCampaign(id), useApprovals, useCreators, useCreator(id), useDealContext(id), useDealPerf(id), useThreads, useThreadMessages(id), useSettings, useAccounts
    lib/mutations.ts      useDecideApproval (optimistic for shortlist/deal/video, pessimistic for payment), useSetAutonomy (optimistic), useChooseIdea, useAddCreator, useApprovePayout / useMarkPaid (pessimistic), useSaveSetting (optimistic), useCreateCampaign
    lib/stream.ts         useLiveStream(): one EventSource on /api/stream; on `event` → invalidate the campaign/deal/approvals/creators keys it touches; on `chat` → append into the thread's cache. Auto-reconnect is native
    lib/chatStream.ts     sendToLily(threadId, text, {onStep, onDelta, onDone}) via fetch + eventsource-parser
    lib/stages.ts         stage order, pill label, pill status color (PLAN §1.3 table)
    lib/toast.tsx         ToastHost + useToast(): renders kit `Toast` in a fixed corner (state only)
    components/AppShell.tsx      sidebar + needs-you dot
    components/ApprovalCard.tsx  one card for all 4 kinds; Approve / Ask for changes (note in TextArea); used on the campaign page and inline in chat (one action, many surfaces)
    components/IdeasCard.tsx     Choicebox of 3 ideas + Go with this
    components/CreatorRow.tsx
    components/CreatorSheet.tsx  deal sheet (campaign page)
    components/CreatorProfileSheet.tsx  creator sheet (Creators page, past engagements)
    components/VideoRound.tsx
    components/ConversationLog.tsx  merged IG + email messages
    components/AfterPosting.tsx
    pages/Onboarding.tsx  pages/Chat.tsx  pages/Campaigns.tsx  pages/Campaign.tsx
    pages/Creators.tsx    pages/Settings.tsx
```

## Endpoints I call (all from CONTRACT)
- GET: `/campaigns`, `/campaigns/:id`, `/approvals?status=pending`, `/creators`, `/creators/:id`, `/deals/:id/context`, `/deals/:id/perf`, `/chat/threads`, `/chat/threads/:id/messages`, `/settings`, `/accounts`, `/stream`
- Writes: `POST /campaigns`, `POST /campaigns/:id/choose`, `PATCH /campaigns/:id {autonomy}`, `POST /approvals/:id {decision, note?}`, `PATCH /deals/:id {stage:'declined', latest_action}` (shortlist remove), `POST /creators {ig_handle, email?, campaign_id}`, `POST /payouts/:id/approve`, `POST /payouts/:id/paid`, `PUT /settings/:key {value}`, `POST /chat/threads/:id/messages {text}` (stream)

## Optimistic rules (global standing instruction)
- Optimistic: approve/changes on shortlist, deal and video approvals (card disappears, deal stage pill moves), autonomy switch, settings save, choose idea (navigate right away). Pattern: `onMutate` cancel + snapshot + `setQueriesData` on campaign, approvals and thread caches; `onError` restore + toast; `onSettled` invalidate.
- Pessimistic: payment approval and Mark paid (button `loading` until the server answers), Add creator (server creates the deal), Create campaign (need ids back).

## Verification
1. `cd web && bun install && bunx tsc --noEmit` clean.
2. `bun run dev` → `curl -s 127.0.0.1:5180/` returns the shell; `curl -s 127.0.0.1:5180/api/campaigns` proxies.
3. Walk each screen against the seeded campaign (`cmp_giq3p5j3`, one deal per stage, 3 pending approvals) with `agent-browser --cdp 9223` screenshots of: onboarding, chat with ideas card, campaign page (Needs you + every stage group + Payments), creator sheet (deal in `video_feedback`, `completed` for After posting), Creators, Settings. Only if you want browser checks (hqads rule says no browser tests unless asked; tell me).
4. Live: approve the seeded deal approval from the chat card and see the campaign page update via SSE without reload.
Until core GETs exist (currently every `/api/*` route answers 404), I build against CONTRACT shapes and check field names against `data/creat0r.db` (read-only).

## Answers folded in (orchestrator, CONTRACT Amendments v2)
- **Onboarding (#2):** `POST /campaigns` → `{campaign, thread_id}`, navigate to `/chat/:thread_id`, then the UI sends the first admin message ("Budget $X, product <link>, goal: <goal>") to `POST /chat/threads/:id/messages`; Lily's `step` / `delta` / `done` stream back there and render as live ThinkingSteps + streaming message + the ideas card. Background runs post `kind:'update'` messages over SSE.
- **Creator sheet (#6):** `GET /deals/:id/context` (now also `deal`, `brand`, `accounts`). After posting: `GET /deals/:id/perf` → `{snapshots, lily_line}`.
- **Approval cards (#6):** every approval is `{...approval, campaign_title, deal, creator, ref}`; ref = offer | submission | payout | `{deals}` for shortlist. No client joins.
- **Shortlist (#3):** Approve all + "Ask for changes" note; quiet per-row remove (icon on hover) = `PATCH /deals/:id {stage:'declined', latest_action:'Removed from shortlist by you'}`, optimistic.
- **Payments (#5):** "Approve payment" = `POST /payouts/:id/approve` (pessimistic), also used for the payment approval card; `GET /campaigns/:id` includes `payouts`. Mark paid = `POST /payouts/:id/paid`.
- **Autonomy (#4):** Full autopilot never sent to the API (it would 400 `coming_soon`); click shows a "Coming soon" toast.
- **Titles (#6):** campaign page/list use the computed `title`; creator chips use `deals[].campaign_title`.
- **SSE (#8):** `es.addEventListener('event'|'chat')`; chat payload is the full row with `ref` parsed → appended into the thread cache (deduped by id).
- **General thread (#7):** comes from `GET /chat/threads`; no create endpoint needed.
- **Video (#12):** `<video>` from `/api/videos/<basename(local_path)>` when set, else a link. Message attachments (#9) show as kit `Attachment` chips, videos playable.
- **Suppressed sends (#3):** shown in the conversation as "Drafted, not sent (demo allowlist)".
- **Look (#10):** kit default, light only, no BrandProvider colour; brand logo + name at the top of the sidebar from `GET /settings`.
- **Tell Lily (#9 yes):** posts "About @handle: …" to the campaign's thread via the chat stream.
- **Verification (#14):** at the end, screenshots via `agent-browser --cdp 9223` in a new pinned tab, closed afterwards.

## Amendments v3 folded in (Tanush)
- **Gates (#1):** human_first = shortlist, deal, video, payment; autopilot = payment only. The autonomy `SegmentedControl` shows one helper line under it from a single `GATES` constant in `lib/stages.ts`: "You approve the shortlist, every deal, every final video and payments" / "You approve payments only". Approvals that Lily auto-decided (`decided_by:'lily'`) never appear in Needs you; the creator sheet shows them quietly in its history ("Approved by Lily (autopilot)").
- **Manual add (#2):** after Add creator the row appears in `shortlisted` with latest_action from the server; no shortlist card for it.
- **Video delivery (#3):** a video round renders `<video>` for a saved file (email attachment or downloaded link), else the link (Drive / reel) as an external link.
- **Allowlist (#4):** suppressed outbound messages stay visible in the conversation, greyed, tagged "Drafted, not sent (demo allowlist)". Inbound from unknown senders has no deal, so it never shows on a campaign; nothing to build.
- **Event as product (#6):** nothing in the UI assumes e-commerce. Product fields (price, images) are optional everywhere; the onboarding label stays "Product link" with placeholder `https://…` (no demo prefill, see Q1). Campaign title = server's computed `title`.
- **Hard video rule (#7):** the Goal field gets one hint line: "Anything the video must show? Put it here, Lily makes it a rule." The brief card lists `video_rules` verbatim. On each video round, failed checks sort first with a red ✗ and the rule text in full, so "The Product Unconference ID card must be clearly visible in the video" is the first thing you read on round 1 and a green ✓ on round 2. The video approval card shows the same checks.

## Questions
1. Onboarding prefill: should the form start empty (default) or prefilled with the demo values ($1,500, theproductfolks link, the ID-card goal) to save typing on stage? My pick: empty fields, plus the 3 goal suggestion chips from PLAN §1.1.
2. Status: at plan time every core GET (`/campaigns`, `/approvals`, `/creators`, `/chat/threads`, `/settings`, `/accounts`) still returns 404 on :4400. I'll build against CONTRACT shapes and the seeded DB; tell me when A's reads are up.
