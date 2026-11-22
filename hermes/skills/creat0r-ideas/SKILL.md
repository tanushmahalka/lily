---
name: creat0r-ideas
description: First admin message in a new creat0r campaign chat (status ideating, no ideas yet). Read the product page, see what works on Instagram, and post 3 campaign ideas through the creat0r API.
version: 1.0.0
metadata:
  hermes:
    tags: [creat0r]
    requires_toolsets: [terminal]
---

# creat0r ideas

## When to Use
The chat context says the campaign is `ideating` and has no ideas yet. Run this in the same turn, no questions first.

## Procedure
Run **one curl per command**, with the full URL written out (no shell variables, no `&&` chains): the app turns each command into a progress line for the admin. The campaign has `budget_usd`, `product_url` and `goal` (`curl -s http://127.0.0.1:4400/api/campaigns/<campaign_id>`).

1. **Read the product page:**
   `curl -s -X POST http://127.0.0.1:4400/api/product/read -H 'Content-Type: application/json' -d '{"url":"<product_url>","campaign_id":"<campaign_id>"}'`
   → `{brand:{name, about, tone, …}, product:{title, description, price, images, category}}`.
   The "product" may be an event, a course, an app or a service, not a physical item. Shape the ideas around what it really is (for an event: attendee point of view, "why I'm going", a day-of vlog, the people you meet). Never assume a shop, shipping or unboxing unless the page sells a physical item.
2. **Creators you've worked with:** `curl -s "http://127.0.0.1:4400/api/creators/past?campaign_id=<campaign_id>"`. Mention a good past creator in `creator_profile` when one fits.
3. **What works on Instagram:** pick 1–2 short keywords from the product and goal, then for each:
   `curl -s -X POST http://127.0.0.1:4400/api/find/reels -H 'Content-Type: application/json' -d '{"campaign_id":"<campaign_id>","keyword":"<keyword>","limit":10}'`
   Look at which reels get the most views and why (format, hook, face on camera).
4. **Hard requirements from the goal:** find every hard requirement or checklist item the admin wrote in the goal ("must", "has to", "clearly visible", "no …", or a list of things the video needs). Copy each one **word for word**, one rule per item, as the first items of `video_rules` in **all 3** ideas. Do not reword, merge, split or reorder them, and don't add your own rule that repeats one of them in other words.
   Example: a goal that asks for "The Product Unconference ID card is clearly visible", "Mentions the event dates", "Speaks positively about the event" and "Encourages people to come" gives every idea exactly those 4 strings first, then any rules of your own.
5. **Write 3 different ideas** (different angles, not 3 versions of one) and post them in one call:
   ```
   curl -s -X POST http://127.0.0.1:4400/api/campaigns/<campaign_id>/ideas -H 'Content-Type: application/json' -d '{"ideas":[
     {"title":"…","angle":"one line","video_description":"what the video looks like, 1–2 sentences",
      "creator_profile":"which creators fit","keywords":["…","…"],
      "video_rules":["<hard requirement verbatim>","product clearly visible in the first 3 seconds", "…"],
      "creators_target":5,"fee_hint_usd":200}, {…}, {…}]}'
   ```
   - `keywords`: 2–4 Instagram search terms you'll use to find creators for this idea.
   - `creators_target` × `fee_hint_usd` must fit in `budget_usd` with a little room (fees are rough per creator, whole dollars).
   - `video_rules`: the goal's items first (verbatim), then at most 2 short, checkable rules of your own.
6. Reply in chat with one or two plain sentences, e.g. "Here are 3 ideas for Product Unconference 2026. Pick the one you like and I'll start finding creators." The cards appear by themselves; don't list the ideas in text.

## Pitfalls
- If `/product/read` fails, still write ideas from the goal and the URL, and tell the admin in one line that you couldn't read the page.
- If `/find/reels` returns nothing, try one other keyword, then go on.
- Posting ideas twice creates duplicates: post once.
