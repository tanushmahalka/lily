# creat0r: Lily, the creator-ads agent (90-minute hackathon plan)

Status: **approved by Tanush (round 2 answers folded in).** Open questions are tracked in §6.
The interfaces every thread builds against are in `CONTRACT.md`. This file covers the what and the why.

---

## 1. The experience (what a marketing manager sees)

Principle: **actions, not dashboards.** No charts or KPI tiles. Every screen answers "what is Lily doing" and "what does Lily need from me".

### 1.1 Onboarding: one screen, three fields
- **Budget** (USD)
- **Product link**
- **Campaign goal** (free text, with suggestion chips: "Get UGC videos for ads", "Launch a new product", "Drive sales")

The button "Start with Lily" creates the campaign and opens the chat.

### 1.2 Chat with Lily: first campaign
- Lily's work shows live as steps: "Reading your product page" → "Seeing what works on Instagram for <keywords>" → "Drafting 3 ideas". These are Halaska *Thinking steps* fed by Hermes tool-progress events.
- Lily posts **3 campaign ideas** as selectable cards (Halaska *Choicebox* / *Result cards*). Each idea has:
  - name
  - the angle in one line
  - what the video looks like
  - which creators fit
  - video rules (e.g. "product clearly visible in the first 3 seconds")
  - how many creators and a rough fee per creator
- The admin picks one and presses **"Go with this"**. That is the only decision. Lily replies with one line ("On it. I'll shortlist creators and reach out. I'll ask you before any deal is final."), and the app redirects to the campaign page.

### 1.2b What Lily learns from the product link
One read of the product page (treg markdown fetch, then Gemini) gives the **brand** (name, logo, about, tone) and the **product** (title, description, price, images). The brand is saved to **Settings → Brand**, where the admin can correct it. Lily signs emails "Lily, partnerships at {brand}".

### 1.3 The platform: sidebar with 4 items
**Campaigns · Creators · Chat · Settings.** A small "needs you" dot appears on an item when an approval is waiting. That is an action count, not a metric.

**Autonomy mode** is a segmented control in the campaign header (default comes from Settings):

| Mode | The admin approves |
|---|---|
| **Human-first** | the shortlist (before any outreach), deals*, final videos, payments |
| **Autopilot** | payments only |
| **Full autopilot** | nothing. Clickable, shows "Coming soon" |

*Deals in human-first: open question §6. When a gate is off, the API records the approval as approved by Lily, so the history stays complete.

**Add creator manually** (campaign page button, or just tell Lily in chat "add @ansh"): type an Instagram handle. A manual creator counts as validated by the admin, so it skips the shortlist gate and Lily starts outreach right away (open question §6). This is how the demo runs with Ansh or Kush.

**Settings**
- **Brand**: name, logo, about, tone. Prefilled from the product link and editable.
- **Accounts**: the connected outreach accounts. Instagram @ta__nush (Lily writes *as Tanush*, first person, so it reads natural). Email lily@email.makelocalads.com (Lily writes as "Lily, partnerships at {brand}"). More accounts can be listed; only these two are live.
- **Lily**: default autonomy mode.

**Surfaces only, not live (seeded data, no jobs):**
- **After posting**: on the creator sheet, "Checked every 6 hours" with a small trend line and one sentence from Lily.
- **Payments**: a section on the campaign page listing each finished creator with the agreed amount and **Approve payment** → **Mark paid**. This is state only; no money moves.

**Campaigns → campaign page**
- Top: the brief (chosen idea + video rules) in one compact card, collapsed by default. One trust line: *"Lily can agree up to $X per creator. Every deal and every final video comes to you."*
- **Needs you** (only when something is waiting):
  - **Deal ready**: creator, terms in one sentence, **Approve** / **Ask for changes** (note to Lily).
  - **Video ready**: inline player, Lily's notes, **Approve** / **Ask for changes**.
- **Creators in this campaign**: one row each with avatar, handle, a stage pill, and Lily's latest action in one line ("Countered at $220, waiting for reply"). Rows are grouped by stage in this order:

| Stage | Pill | Who moves it |
|---|---|---|
| `shortlisted` | Shortlisted | Lily (human-first: the admin approves the shortlist before outreach) |
| `reached_out` | Reached out | Lily (first message sent) |
| `talking` | Talking | Lily (creator replied) |
| `negotiating` | Negotiating | Lily (terms on the table) |
| `deal_ready` | **Needs your OK** | Lily asks; **admin approves** |
| `awaiting_video` | Filming | admin approval moves it here |
| `video_feedback` | Feedback round | Lily (video received, iterating) |
| `video_ready` | **Needs your OK** | Lily asks; **admin approves** |
| `completed` | Done | admin approval moves it here |
| `declined` | Didn't work out (collapsed group) | Lily or the creator |

- Clicking a row opens a **sheet** with:
  - why Lily picked them (reasons in words, plus 3 of their reels)
  - the full conversation across Instagram and email in one thread, read-only, with a "Tell Lily…" box
  - offers back and forth (version list)
  - video rounds with Lily's feedback

**Creators**
- Everyone Lily has shortlisted or worked with. Each row shows avatar, handle, niche, campaign chips with their stage, and one line from Lily ("Fast, showed the product well. Would book again").
- Clicking a row opens a sheet with their past engagements.
- This list is also how Lily "keeps" creators: at the start of every new campaign she checks it first.

**Chat**
- The main way the admin talks to Lily. A Halaska chat with history sidebar: one thread per campaign plus a general thread.
- Lily also posts here on her own: deal ready, video ready, "creator X declined", questions she needs answered. Approval cards appear inline in the chat too and use the same action as the campaign page.
- The admin can ask anything: "how's the skincare campaign going?", "drop @x", "offer @y $50 more".

### 1.4 Look and feel
- **Library first, always.** Pull in pre-built pieces (kit components, shadcn, motion, a markdown renderer) before writing anything from scratch.
- **Halaska UI kit** (`github.com/Halaska-Studio/ui`, MIT, one React file built on the shadcn base) for all components: Chat Input, Conversation, Message, Thinking Steps, Choicebox, Result Cards, Sheet, Status badge, Avatar, Empty, Toast, Approval-card pattern, Task rows.
- Vite + React. No other UI library.

---

## 2. System design

```
 Admin UI (web/, Vite :5180)
        │  REST + SSE
        ▼
 creat0r API (api/, Bun + Hono + bun:sqlite, :4400) ── the memory and the rules
   ├─ core: campaigns, ideas, deals, offers, approvals, chat store, events, stage machine, guardrails
   ├─ find: product page reader, reel search (treg), creator analysis (treg + Gemini), past creators
   ├─ channels: Instagram (ig-bridge :7777) + email (AgentMail lily@email.makelocalads.com), inbound, demo allowlist
   ├─ review: video intake (link or email attachment) + Gemini review against the video rules
   └─ lily: proxy admin chat → Hermes API server; fire Hermes webhooks on events
        │                                   ▲
        ▼ local HTTP only                   │ curl from skills
 Hermes, profile "creat0r" (persona Lily)
   ├─ API server :8642  (admin chat, streamed)
   ├─ webhook routes :8644  (campaign-start, creator-message, admin-decision)
   └─ skills: creat0r-context, creat0r-ideas, creat0r-find, creat0r-outreach,
              creat0r-negotiate, creat0r-review, creat0r-admin
```

### Decisions and why
1. **The database is the memory, not Hermes memory.** Creators, reels, offers and messages live in SQLite. Hermes memory stays small (tone, lessons learned).
2. **Context comes from a per-deal file, not one shared chat.** Every inbound creator message starts a fresh Hermes run whose first call is `GET /api/deals/:id/context`. That file holds the brief, the guardrails, the analysis, every offer, every message on both channels and every video round. Creators can't see each other's terms, and context never overflows. Hermes `coalesce` on `deal_id` merges a burst of messages into one run.
3. **Rules are enforced in code.** The API rejects any offer from Lily that falls outside the guardrails (422 + the reasons). If a creator insists on something outside the bands, Lily escalates to the admin in chat. Every deal and every final video needs the admin regardless.
4. **Structured output, rendered by the UI.** Lily never puts ideas or approvals in free text for the UI to parse. She writes them through the API (`POST /ideas`, `POST /offers`, …), and the chat message only points at the record. The UI renders cards from records.
5. **One action, many surfaces.** Approve from the campaign page or from the chat card: it's the same endpoint.
6. **No public URL needed.** ig-bridge posts webhooks to localhost, and AgentMail is polled every 10 s. No tunnel.
7. **Autopilot.** Lily sends messages to creators herself. Only deals and final videos wait for the admin.

### Out of scope for the 90 minutes (approved by Tanush)
WhatsApp. A live 6-hour performance job and real payouts: both exist only as UI surfaces on seeded data. Full autopilot ("coming soon").

### Model
Lily runs on Hermes, profile `creat0r`, model **claude-opus-5-5**, reasoning **medium**, with the Anthropic API key in `creat0r/.env`.

---

## 3. Creator analysis (`POST /api/creators/analyze`)

Inputs: treg profile + last 10 reels, plus one Gemini call over captions and thumbnails against the chosen idea.

| Signal | How | Why |
|---|---|---|
| Followers / tier | profile | Rough price band |
| Reels in last 30 days | reel dates | Active creators deliver |
| Median views (last 10) | reels | What a video really gets; followers can be bought |
| Views ÷ followers | | Is the audience alive |
| Engagement | median (likes+comments) ÷ views | Do people care |
| Consistency | median ÷ mean views | Is the average carried by one viral hit |
| Content fit | Gemini | Category, format, face on camera, fits the idea |
| Shows products well | Gemini | The video rules usually demand it |
| Has done brand deals | #ad / paid partnership in captions | Easier to close |
| Brand safety | Gemini | Gate: unsafe = excluded |

Output: `fit` = `great | good | weak`, plus 2–4 reasons in plain words. A 0–100 score is stored for sorting but **never shown**.

---

## 4. Guardrails (Lily derives them, the admin sees one line)

When the idea is chosen, the API derives these from the budget and the idea's creator count:

```json
{ "fee_usd": { "min": 50, "max": 300 }, "revision_rounds": { "min": 1, "max": 2 },
  "usage_rights_days": { "min": 30, "max": 90 }, "upfront_pct": { "max": 50 },
  "delivery_days": { "min": 3, "max": 14 } }
```
Rule: `fee max = budget ÷ creators_target × 1.2`, rounded to $10, and `fee min = fee max × 0.25`.

---

## 5. How the threads work

Seven threads: me (orchestrator) plus A–F, each a paseo-pi session in `creat0r/`.

**Protocol, every thread, no exceptions:**
1. Read `PLAN.md`, `CONTRACT.md`, and your own section below.
2. Write `plans/<letter>-<name>.md`: what you'll build, every file, every function and endpoint, how you'll verify, and **your questions**.
3. **Stop and show the plan. Do not write code until Tanush (or the orchestrator, on his behalf) replies "approved".**
4. **Ask, don't assume.** Anything not written in PLAN/CONTRACT is a question, not a guess.
5. Write only inside the folders you own. `CONTRACT.md` is frozen: changes go through the orchestrator, who updates it and tells every thread.
6. When done: run your verification, then report what works, what doesn't, and the exact commands.

| # | Thread | Owns | Done when |
|---|---|---|---|
| 0 | **Orchestrator** | `CONTRACT.md`, `db/`, `api/src/index.ts`, `api/src/lib/` (db, events, gemini), module stubs, seed | API boots with stubs. Seed has 1 campaign with creators in every stage, so A–F can build against real data |
| A | **Core API** | `api/src/core/` | Campaigns, ideas, choose (guardrails derived), autonomy modes + the four gates, deals + stage machine, offers + guardrail check, approvals, settings + accounts, payouts + perf reads, chat store, events + SSE, deal context file |
| B | **Find** | `api/src/find/` | Product page → brand + product JSON (treg markdown, Gemini), brand saved to settings. Keyword → reels + creators saved. Analyze → fit + reasons. Past creators for a new campaign |
| C | **Channels** | `api/src/channels/` | IG follow + DM via ig-bridge, email send/reply via AgentMail, inbound IG webhook, email poller, demo allowlist, inbound → message stored → Lily woken |
| D | **Review** | `api/src/review/` | Video from a link or email attachment → saved → Gemini checks each video rule → structured review; lily-approve |
| E | **Lily (Hermes)** | `hermes/`, `api/src/lily/` | Profile `creat0r` installed by `hermes/install.sh` (Opus 5.5, medium): SOUL (Lily; writes as Tanush on his Instagram, as "Lily, partnerships at {brand}" on email), skills that respect the autonomy mode, webhook routes, API server. Chat proxy streams to the UI. Webhook dispatcher |
| F | **Admin UI** | `web/` | Onboarding → chat with ideas → campaign page (autonomy switch, stages, Needs-you cards, Add creator, Payments) → creator sheet (incl. After posting) → Creators → Chat → Settings (Brand, Accounts, Lily), all on the Halaska kit, live via SSE |

### Timeline
| Min | What |
|---|---|
| 0–10 | Orchestrator builds phase 0. A–F start at minute 2 and write plans while it runs |
| 10–15 | Tanush + orchestrator approve plans (or answer questions) |
| 15–60 | Build. Orchestrator watches every thread, answers questions, guards the contract |
| 60–75 | Integration: orchestrator runs the demo script and routes bugs to the owning thread |
| 75–90 | Polish (motion, empty states, copy), then rehearse the demo twice |

### Demo script
1. Onboarding: $1,500 · product link · "UGC videos for Meta ads".
2. Chat: Lily's steps stream, 3 ideas appear, pick one, redirect.
3. Campaign page fills live: shortlisted creators with reasons. Lily DMs our test creator on Instagram and emails a second one.
4. From a phone, the "creator" asks for $500. Lily counters inside the bands. The creator accepts → **Needs your OK** → approve.
5. The creator sends a video link. Lily gives gentle, specific feedback. Round 2 is fine → **Needs your OK** → approve → Done.
6. Creators page: the creator shows with Lily's note. A new campaign would surface them first.

## 6. Open questions (asked, not assumed)
1. **Human-first and deals:** in human-first, should the admin also approve each deal before the creator starts filming? You listed shortlist, videos and payments, but earlier said a finalised deal is when the admin checks and approves. Recommended: yes in human-first, no in autopilot.
2. **Manually added creators:** my reading is that they skip the shortlist and Lily goes straight to outreach. Confirm.
3. **Video delivery:** a link (Drive, WeTransfer, posted reel) in the Instagram DM, or an email attachment, because the bridge can't receive video files. Confirm.
4. **ig-bridge webhook:** may thread C ask the ig-bridge session to restart it with `WEBHOOK_URL=http://127.0.0.1:4400/api/inbound/instagram`?

### Cut order if late
Email inbound poller → the "Tell Lily…" box on the creator sheet → chat history sidebar. **Never cut:** ideas → choose → live campaign page, the two approval gates, and Instagram negotiation.
