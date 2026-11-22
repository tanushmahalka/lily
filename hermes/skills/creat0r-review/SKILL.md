---
name: creat0r-review
description: creat0r creator sent a video (link in a DM/email, or an email attachment). Submit it for review, send kind specific feedback or approve it for the admin.
version: 1.0.0
metadata:
  hermes:
    tags: [creat0r]
    requires_toolsets: [terminal]
---

# creat0r review

## When to Use
A new creator message has a video link (Drive, WeTransfer, Instagram reel, YouTube, Dropbox…) or an attachment in `attachments`, and the deal is `awaiting_video` or `video_feedback`.

## Procedure
Run **one curl per command**, with the full URL written out (no shell variables, no `&&` chains): the app turns each command into a progress line for the admin.

1. `curl -s http://127.0.0.1:4400/api/deals/<deal_id>/context` → the new message (`messages`, newest last), `submissions` (earlier rounds) and the checklist `brief.video_rules` (the campaign's brief, which the admin may have edited; never the idea's copy). Every item on it is must-pass.
2. Submit the video (use the message id; it covers both links and attachments):
   `curl -s --max-time 120 -X POST http://127.0.0.1:4400/api/deals/<id>/submissions -H 'Content-Type: application/json' -d '{"message_id":"<message_id>"}'`
   Use `{"source_url":"<url>"}` only for a link that isn't in a stored message. The review takes 20–30 s: always keep `--max-time 120` and wait for the answer; never retry while it's still running (that would create a second round).
   → submission with `review = {verdict, checks:[{rule, passed, note}], feedback_to_creator, notes_for_admin}`.
3. Compare `review.checks` with `brief.video_rules`. If `verdict` is `changes`, **any check failed, or a checklist item has no passing check**: send the feedback yourself, warm and specific: what you liked, then the one thing to fix. E.g. Instagram: "this is so good!! one thing, the Product Unconference ID card needs to be clearly visible, could you reshoot that bit?" Use `feedback_to_creator` as your source, but in your own voice and length.
   `curl -s -X POST http://127.0.0.1:4400/api/deals/<id>/send -H 'Content-Type: application/json' -d '{"channel":"<deal.channel>","text":"<feedback>"}'`
   (see "Which channel to reply on" below when the video came by email)
4. If `verdict` is `approve` and every checklist item passed: approve it for the admin, then thank the creator:
   `curl -s -X POST http://127.0.0.1:4400/api/submissions/<submission_id>/lily-approve`
   Reply on `deal.channel`: "love it, thank you! just running it by the team, will confirm shortly" (prefixed with "Got your video on email!" when it came by email on an Instagram deal).
5. If the link can't be opened, ask the creator in one line for a link that's viewable without a login.

## Which channel to reply on
Always reply on the **deal's channel** (`deal.channel`), not the channel the video arrived on.
- Video arrived **by email** on an **Instagram** deal: send your reply on Instagram, as Tanush, and open it with "Got your video on email!", then the feedback or the thanks, e.g. "Got your video on email! this is so good, one thing, the Product Unconference ID card needs to be clearly visible, could you reshoot that bit?" No email reply needed.

## Pitfalls
- Never `lily-approve` a video that failed any checklist item, even if the overall verdict says approve.
- Don't list every check to the creator. One clear fix per message.
