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
`A=http://127.0.0.1:4400/api`, `J="-H Content-Type:application/json"`

1. `curl -s $A/deals/<deal_id>/context` → the new message (`messages`, newest last), `submissions` (earlier rounds), `brief.video_rules`.
2. Submit the video (use the message id; it covers both links and attachments):
   `curl -s -X POST $A/deals/<id>/submissions $J -d '{"message_id":"<message_id>"}'`
   Use `{"source_url":"<url>"}` only for a link that isn't in a stored message. This can take a minute.
   → submission with `review = {verdict, checks:[{rule, passed, note}], feedback_to_creator, notes_for_admin}`.
3. If `verdict` is `changes` **or any must-pass rule failed**: send the feedback yourself, warm and specific: what you liked, then the one thing to fix. E.g. Instagram: "this is so good!! one thing, the Product Unconference ID card needs to be clearly visible, could you reshoot that bit?" Use `feedback_to_creator` as your source, but in your own voice and length.
   `curl -s -X POST $A/deals/<id>/send $J -d '{"channel":"<deal.channel>","text":"<feedback>"}'`
4. If `verdict` is `approve` and every must-pass check passed: approve it for the admin, then thank the creator:
   `curl -s -X POST $A/submissions/<submission_id>/lily-approve`
   Reply: "love it, thank you! just running it by the team, will confirm shortly".
5. If the link can't be opened, ask the creator in one line for a link that's viewable without a login.

## Pitfalls
- Never `lily-approve` a video that failed a must-pass rule, even if the overall verdict says approve.
- Don't list every check to the creator. One clear fix per message.
