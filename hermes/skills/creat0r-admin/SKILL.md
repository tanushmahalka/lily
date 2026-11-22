---
name: creat0r-admin
description: creat0r admin side. Act on admin decisions (shortlist, deal, video approvals or change requests, manual adds) and handle admin chat requests like "how's it going", "add @x", "drop @x", "offer @y $50 more".
version: 1.0.0
metadata:
  hermes:
    tags: [creat0r]
    requires_toolsets: [terminal]
---

# creat0r admin

## When to Use
- Webhook `admin-decision` with `{approval_id}` or `{deal_id, reason:"manual_add"}`.
- Any admin message in the chat.

## Admin decisions (webhook)
`A=http://127.0.0.1:4400/api`, `J="-H Content-Type:application/json"`

- `{deal_id, reason:"manual_add"}` → creat0r-outreach for that deal.
- `{approval_id}`: find it. `curl -s "$A/approvals?status=pending"` shows what is still waiting; a decided approval is in the deal context `approvals` (or `GET $A/campaigns/<id>` for a shortlist). Use its `kind`, `status` and `admin_note`:
  | kind | approved | changes |
  |---|---|---|
  | shortlist | creat0r-outreach for every `shortlisted` deal | the admin removed or wants different creators: read the note, adjust, tell the admin in one line |
  | deal | tell the creator it's confirmed and they can start filming (must-pass rules, delivery date). Skip if you already said it | renegotiate with the admin's note (creat0r-negotiate); tell the creator kindly you need to adjust one thing |
  | video | thank the creator, it's approved, payment follows | pass the admin's note to the creator as kind, specific feedback |
  | payment | nothing to do | nothing to do |

## Admin chat
Plain words, 1–3 short sentences. No ids, APIs, stage codes or tool talk. The chat context gives you the `campaign_id` (none in the General thread: then `curl -s $A/campaigns` to find the campaign the admin means).

- **"How's it going?"**: `curl -s $A/campaigns/<id>` (and `curl -s "$A/events?campaign_id=<id>"` for recent activity). Answer in 1–3 sentences: who's talking, who's close to a deal, what needs them.
- **"Add @x"**: `curl -s -X POST $A/creators $J -d '{"ig_handle":"x","campaign_id":"<id>","wake":false}'`, then do creat0r-outreach for the new deal in this same turn. Reply "Added @x and sent them a message."
- **"Drop @x"**: find the deal in `GET $A/campaigns/<id>`, then `curl -s -X PATCH $A/deals/<deal_id> $J -d '{"stage":"declined","latest_action":"Removed by you"}'`. If you had already been talking to them, send a short kind note.
- **"Offer @y $50 more"**: read the deal context, make the new offer (`POST $A/deals/<id>/offers {"by":"lily","terms":{…}}`; a 422 means it's over the limit, so tell the admin the max), then send the creator a one-line message with the new number.
- **Approve / ask for changes from chat**: `curl -s -X POST $A/approvals/<approval_id> $J -d '{"decision":"approve"}'` or `{"decision":"changes","note":"…"}`. The API wakes you for the follow-up, so don't also message the creator here.
- **Anything you can't do**: say so in one line and offer what you can do.

## Pitfalls
- In `human_first`, don't start outreach until the shortlist approval is approved.
- Payment decisions never need a message to anyone.
