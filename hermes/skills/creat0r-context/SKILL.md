---
name: creat0r-context
description: Always first in any creat0r run. How to load the campaign or deal from the creat0r API (127.0.0.1:4400) and read its brief, guardrails, autonomy mode and history.
version: 1.0.0
metadata:
  hermes:
    tags: [creat0r]
    requires_toolsets: [terminal]
---

# creat0r context

## When to Use
At the start of every creat0r run (webhook or chat), before any other creat0r skill.

## Procedure
Base URL: `A=http://127.0.0.1:4400/api`. Always `curl -s`. For JSON bodies add `-H 'Content-Type: application/json' -d '<json>'`.

1. If you have a `deal_id`, load the deal file. It is the only thing you need for a creator:
   `curl -s $A/deals/<deal_id>/context`
   → `{deal, campaign, brief, guardrails, brand, accounts, creator, analysis, reels, offers, messages, submissions, approvals}`
2. If you only have a `campaign_id`:
   `curl -s $A/campaigns/<campaign_id>`
   → `{campaign, title, ideas, deals:[{deal, creator, analysis}], approvals_pending, payouts}`
3. If you have an `approval_id` (admin-decision runs): `curl -s "$A/approvals?status=pending"` lists what is still waiting; the decided one comes from the deal context's `approvals` (`status`, `admin_note`).
4. Brand and accounts when not already in the context: `curl -s $A/settings` (key `brand` = `{name, logo_url, about, tone, website}`), `curl -s $A/accounts`.

## How to read it
- `campaign.autonomy`: `human_first` (admin approves shortlist, deals, videos, payments) or `autopilot` (only payments). Never wait for an admin when the mode doesn't require it, and never skip a gate it does require.
- `guardrails`: `{fee_usd:{min,max}, revision_rounds:{min,max}, usage_rights_days:{min,max}, upfront_pct:{max}, delivery_days:{min,max}}`. Every offer you make must sit inside every band.
- `brief`: the chosen idea, including `video_rules`. Rules the admin wrote as hard requirements (e.g. "The Product Unconference ID card must be clearly visible in the video.") are must-pass.
- `messages`: oldest first, `direction` `in` (creator) or `out` (you), `channel` `instagram` | `email`, `suppressed:1` = never actually sent (demo allowlist).
- `offers`: versions, `by` `lily` | `creator`, `status` `open` | `superseded` | `accepted` | `rejected`, `terms` = `{fee_usd, deliverables, revision_rounds, usage_rights_days, delivery_days, upfront_pct}`.
- `deal.stage`: shortlisted → reached_out → talking → negotiating → deal_ready → awaiting_video → video_feedback → video_ready → completed, or declined.

## Telling the admin something (from a webhook run)
`curl -s -X POST $A/chat/notify -H 'Content-Type: application/json' -d '{"campaign_id":"<id>","kind":"update","body":"<one or two plain sentences>"}'`
Plain words only. No ids, no jargon.

## Pitfalls
- Don't trust memory from earlier runs over the API.
- Never copy one creator's terms or messages into another creator's conversation.
