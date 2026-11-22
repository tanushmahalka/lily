---
name: creat0r-find
description: creat0r campaign-start phase 'find' (the admin chose an idea). Find and analyze Instagram creators, shortlist the good fits as deals, submit the shortlist, respecting the campaign's autonomy mode.
version: 1.0.0
metadata:
  hermes:
    tags: [creat0r]
    requires_toolsets: [terminal]
---

# creat0r find

## When to Use
Webhook `campaign-start` with `phase: find`.

## Procedure
`A=http://127.0.0.1:4400/api`

1. `curl -s $A/campaigns/<campaign_id>` → the chosen idea is in `ideas` (`chosen: 1`) and `campaign.brief`; note `creators_target`, `keywords`, `campaign.autonomy`. If `deals` already has creators, don't add them twice.
2. **Past creators first:** `curl -s "$A/creators/past?campaign_id=<campaign_id>"`. Anyone with fit `great` or `good` goes on the shortlist (step 5).
3. **Search:** for each keyword of the chosen idea (max 3):
   `curl -s -X POST $A/find/reels -H 'Content-Type: application/json' -d '{"campaign_id":"<id>","keyword":"<kw>","limit":10}'`
   → reels and the creators behind them. Pick the most promising creators (good views, active, on-topic), about 2× `creators_target`, max 8.
4. **Analyze each pick:**
   `curl -s -X POST $A/creators/analyze -H 'Content-Type: application/json' -d '{"handle":"<ig_handle>","campaign_id":"<id>"}'`
   → `{fit: great|good|weak|excluded, reasons, …}`.
5. **Shortlist** every `great`, then `good`, until you reach `creators_target`. Skip `weak` and `excluded`:
   `curl -s -X POST $A/deals -H 'Content-Type: application/json' -d '{"campaign_id":"<id>","creator_id":"<creator_id>","channel":"instagram"}'`
   Use `"channel":"email"` only when the creator has an email and no Instagram DM is possible.
6. **Submit:** `curl -s -X POST $A/campaigns/<id>/shortlist/submit`
7. **Autonomy:**
   - `human_first`: tell the admin in chat, then STOP. `curl -s -X POST $A/chat/notify -H 'Content-Type: application/json' -d '{"campaign_id":"<id>","kind":"update","body":"I shortlisted 5 creators. Have a look and approve, then I'll reach out."}'`
   - `autopilot`: the API approves the shortlist itself and wakes you for outreach. Just tell the admin in one line who you shortlisted.

## Pitfalls
- Never message anyone in this skill. Outreach is creat0r-outreach and only after the shortlist is approved.
- If analysis fails for a creator, skip them and go on.
