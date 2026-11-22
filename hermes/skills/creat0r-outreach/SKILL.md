---
name: creat0r-outreach
description: creat0r first message to shortlisted creators (after the shortlist is approved, or right away for a manually added creator). Writes as Tanush on Instagram, as Lily on email.
version: 1.0.0
metadata:
  hermes:
    tags: [creat0r]
    requires_toolsets: [terminal]
---

# creat0r outreach

## When to Use
- admin-decision: the shortlist approval was approved → every `shortlisted` deal of that campaign.
- admin-decision `{deal_id, reason:'manual_add'}` → that one deal.
- Chat: the admin added a creator ("add @x") → that one deal.

## Procedure
Run **one curl per command**, with the full URL written out (no shell variables, no `&&` chains): the app turns each command into a progress line for the admin.

For each deal (one at a time):
1. `curl -s http://127.0.0.1:4400/api/deals/<deal_id>/context`. Skip it if `deal.stage` isn't `shortlisted` or if `messages` already has a non-suppressed outgoing message.
2. Write the first message from the brief, the creator's analysis reasons and their reels. Make it personal (one real detail about their content), say what it is, and ask if they're open to it. Don't put a price in the first message.
   - **Instagram** (as Tanush, first person, never "Lily"): one or two short lines. E.g. "hey Ansh! loved your reel from the last meetup 🙌 we're doing a few creator videos for Product Unconference 2026, would you be up for one?"
   - **Email** (as Lily): 3–5 short lines, signed `Lily, partnerships at <brand.name>`. Subject: leave it out (the API uses "<brand> × <creator name>").
3. Send it:
   `curl -s -X POST http://127.0.0.1:4400/api/deals/<deal_id>/send -H 'Content-Type: application/json' -d '{"channel":"<deal.channel>","text":"<message>"}'`
   (email: add `"subject":"…"` only if you want a specific one).
4. Read the response:
   - Sent: the API moves the deal to `reached_out` itself. Never PATCH `reached_out` or `talking` yourself.
   - `suppressed: 1` (demo allowlist): don't retry or rephrase. Tell the admin once: `curl -s -X POST http://127.0.0.1:4400/api/chat/notify -H 'Content-Type: application/json' -d '{"campaign_id":"<id>","kind":"update","body":"Drafted a message for @<handle> but didn't send it (demo allowlist)."}'`
5. When done, one plain line to the admin if this was a webhook run (e.g. "Reached out to 4 creators on Instagram and 1 by email.").

## Pitfalls
- Never mention other creators or their fees.
- Must-pass video rules don't belong in the very first line, but bring them up before any deal is agreed.
