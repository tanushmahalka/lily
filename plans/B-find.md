# Thread B: Find (plan)

Owns `api/src/find/` only. Builds the 5 endpoints in CONTRACT "Find (B)" plus the frozen export `analyzeCreator(handle, campaignId)`.

## Libraries (nothing hand-rolled that a library does)
- **treg CLI** (already installed and logged in on this Mac) via `Bun.spawn(["treg","call",id,"--method","POST","--data",json,"--header","X-Treg-Route-Max-Cost: 0.01"])`. It parses stdout JSON `{output, raw, _treg}`. The cost cap means no single call can cost more than 1 cent. No treg HTTP client or key handling of our own.
- **`lib/gemini.json`** for every model call (structured output with a `Type` schema).
- **Hono** for routes, **bun:sqlite** via `lib/db`, **`logEvent`** from `lib/events`.
- No new dependencies.

## treg endpoints and prices (looked up with `treg catalog get`, probed once)
| Job | Endpoint | Price |
|---|---|---|
| Product page → markdown | `treg.web.extract` (routed; tinyfish first at $0, then crawl4ai $0.00025, parallel $0.001 …) | $0 to $0.01, capped at $0.01 |
| Reel search by keyword | `treg.instagram.search.reels` `{q}` (anyapi served the probe: 22 reels, flat fields: username, userId, views, likes, comments, createdUtc, thumbnail, shortcode, url, caption, paidPartnership) | $0.0015 |
| Profile | `treg.instagram.user.profile` `{username}` | $0.001 to $0.0019 |
| Last 10 reels | `treg.instagram.user.reels` `{username, user_id, limit:10}` | $0.0009 to $0.002 (a miss can still charge, about $0.002, seen in the probe) |

**Cost per analysis:** about $0.003 in treg calls plus one Gemini Flash call with 10 thumbnails (about $0.002), so **about $0.005 per creator**. A shortlist of 20 is about $0.10. Product read is about $0.001 plus one Gemini call. Probe spend so far: about $0.007.

## Files
```
api/src/find/
  index.ts     Hono routes + re-export analyzeCreator (the frozen export stays here)
  treg.ts      tregCall(id, body) + normReel(raw) / normProfile(raw)   (provider-native shapes → one shape)
  product.ts   readProduct(url, campaignId?)
  analyze.ts   analyzeCreator(handle, campaignId) + computeMetrics(profile, reels) + decideFit(metrics, gemini)
```

## Functions and endpoints
### `treg.ts`
- `tregCall(id, body)` → `output`. Throws a clear error on a miss (`_treg.outcome === 'miss'`) or a non-zero exit.
- `normReel(raw)` → `{shortcode, url, caption, thumbnail_url, views, likes, comments, posted_at(ms), username, user_id, display_name, avatar_url, paid_partnership}`. It reads common aliases (`views|play_count|video_view_count`, `likes|like_count`, `createdUtc|taken_at`, `thumbnail|display_url|thumbnail_url` …) and converts string numbers.
- `normProfile(raw)` → `{username, user_id, name, bio, avatar_url, followers, public_email, is_private}`.

### `POST /product/read {url, campaign_id?}` (`product.ts`)
1. `treg.web.extract {url}` → markdown (trimmed to about 40k characters).
2. One Gemini call with a schema → `{brand:{name, logo_url, about, tone, website}, product:{title, description, price, images[], category}}`. `website` is the page's origin. Logo and images come only from URLs in the markdown.
3. If `campaign_id` is passed: `UPDATE campaigns SET product_json`. Event `product.read` ("Read your product page: Calm Serum").
4. If `settings.brand` is empty **or** its `website` host differs from the product URL's host (Amendment #15): write it. Event `brand.inferred` ("Saved your brand as Dewdrop. You can edit it in Settings").
5. Returns `{brand, product}`.
- **Non-ecommerce pages (Amendment v3 #6).** The demo link is an event page (theproductfolks.com/product-unconference-2026), so the prompt says "the product may be a physical item, software, a service or an event/ticket". `price` is a free-text string or null (the ticket price only if the page states one, never invented), `category` can be `event`, and `images` may be empty. For the demo it must return brand = The Product Folks, product = Product UnConference 2026. A free plain `curl` (no treg) confirmed the page is server-rendered HTML with the title "Product UnConference 2026 | The Product Folks", so `treg.web.extract` should get the full text without a headless browser.
- Fallback if `treg.web.extract` misses: none built (YAGNI). The endpoint returns 502 `{error}` and Lily can ask the admin.

### `POST /find/reels {campaign_id, keyword, limit=20}`
1. `treg.instagram.search.reels {q: keyword}` → normalised reels, top `limit` by views.
2. Upsert `creators` by `ig_handle` (ig_user_id, name, avatar_url; existing fields are never blanked).
3. Insert `found_reels` with campaign_id and keyword, skipping a `(campaign_id, shortcode)` that is already saved.
4. Event `reels.found` ("Found 20 reels for 'skincare routine' from 17 creators").
5. Returns `{reels:[found_reel rows], creators:[creator rows]}`. No deals are created: Lily calls core `POST /deals` for the creators she picks.

### `analyzeCreator(handle, campaignId)` + `POST /creators/analyze {handle, campaign_id}` (`analyze.ts`)
1. Profile + last 10 reels from treg, in parallel where possible (reels needs user_id for some providers, so both are passed).
2. **Metrics in code** (PLAN §3): followers, tier (nano <10k, micro <100k, mid <500k, macro <1M, mega), reels_30d, median_views, views_per_follower, engagement = median((likes+comments)/views), consistency = median/mean views, brand_deals = any `paidPartnership` or `#ad #sponsored #partner #paidpartnership` in the captions.
3. **One Gemini call**: captions and the up to 10 thumbnails (downloaded and sent as `inline` base64 via `gemini.json`, Amendment #13), plus the campaign's chosen idea (angle, video_description, creator_profile, video_rules) and the product. If there's no chosen idea yet, it uses product + goal; if `campaignId` is null, it judges the creator in general. Schema: `{category, format, face_on_camera, content_fit:'strong'|'some'|'none', shows_products_well, brand_safe, safety_note, reasons[2..4]}`.
4. **Fit in code**: `!brand_safe` → `excluded`. Otherwise `score_internal` 0–100 = content fit 35 + views/follower 20 + engagement 15 + consistency 10 + active (reels_30d) 10 + shows products 5 + brand deals 5. great ≥ 70, good ≥ 45, otherwise weak. Reasons = Gemini's plain-word reasons plus at most one number-based reason ("Her reels get about 40k views, more than her follower count"), 2–4 in total. The score is stored, never returned in the reasons.
5. Writes: update the `creators` row (followers, bio, avatar, name, niche = category, email if public and ours is empty, profile_json). Replace any earlier `analyses` row for the same (creator, campaign). Save the 10 reels into `found_reels` with `keyword = null` so the sheet's "3 of their reels" and the deal context have them.
6. Event `creator.analyzed` ("Looked at @mia.makes: great fit. Shows products up close, posts 3x a week").
7. Returns the parsed analysis row (`reasons`, `metrics` unpacked) plus `creator`.
- Errors: private or missing account → HTTP 422 `{error:"Couldn't find @x on Instagram"}`. The function throws so callers can catch.

### `GET /creators/past?campaign_id=`
Creators with a deal in **another** campaign, or a `lily_note`. Returns `[{creator, past:[{campaign_id, campaign_goal, stage, agreed_fee_usd}], analysis: <this campaign's analysis or null>}]`, with completed first. It does not analyze on the fly.

### `POST /creators {ig_handle, email?, campaign_id?, wake?=true}` (Amendment #10)
1. Normalise the handle (strip `@` and any URL). Upsert the creator. Try `treg.instagram.user.profile` to fill avatar/followers/bio, but a failure doesn't block (the demo creator may be a small or private account).
2. With `campaign_id`: insert `deals` (source `manual`, stage `shortlisted`, channel `instagram`, or `email` if only an email is given, latest_action "Added by you. Lily is reaching out"). If the deal already exists, return it without re-waking Lily. Event `creator.added_manually`. Then, unless `wake:false` (Lily adding a creator from chat), `wakeLily('admin-decision', {deal_id, reason:'manual_add'})`. Kick off `analyzeCreator` in the background without awaiting it; a failure is logged and ignored.
3. Returns `{creator, deal|null}`.

## Verification
- `cd creat0r/api && bunx tsc --noEmit`
- `curl -s -XPOST :4400/api/product/read -H 'content-type: application/json' -d '{"url":"https://www.theproductfolks.com/product-unconference-2026"}'` → brand "The Product Folks", product "Product UnConference 2026" (the demo URL, v3 #6). Plus one Shopify product page to check the ecommerce path still works.
- `curl -s -XPOST :4400/api/find/reels -d '{"campaign_id":"cmp_giq3p5j3","keyword":"skincare routine","limit":10}'` → rows in `found_reels` / `creators`
- `curl -s -XPOST :4400/api/creators/analyze -d '{"handle":"<a real handle from that search>","campaign_id":"cmp_giq3p5j3"}'` → fit + reasons; check the metrics by hand against the raw treg output
- `curl -s :4400/api/creators/past?campaign_id=cmp_giq3p5j3`
- `curl -s -XPOST :4400/api/creators -d '{"ig_handle":"@<demo creator>","campaign_id":"cmp_giq3p5j3"}'` → manual deal + `[lily] wakeLily(admin-decision)` in `data/api.log`; a second call returns the same deal
- Total verification spend: under $0.05.

## Decisions (orchestrator, round 1)
1. Brand is overwritten when it's empty or its website host differs from the product's host (#15).
2. Demo product URL (v3 #6): https://www.theproductfolks.com/product-unconference-2026, an event page.
3. Past creators return their existing analysis only.
4. Profile reels are saved to `found_reels` with `keyword = null`.
5. Manual add runs the analysis in the background. Manual deals start at `shortlisted` (#10).
6. `gemini.json` takes `inline` base64 images (#13).
7. `POST /creators` has a `wake` flag, default true (#10).

## Amendments v3: what changes for B
- #6 (event page as the product): handled in `/product/read` above, and it's the primary verification URL.
- #2 (manual add skips the shortlist, outreach starts at once): already what `POST /creators` does.
- #1, #3, #4, #5, #7: no change for B. The allowlist (#4) lives in C's send path. The ID-card rule (#7) is Lily's and D's. B only passes the chosen idea's `video_rules` into the analysis prompt, which already happens.

## Tanush's answers (round 3)
1. **Video checklist, shown to the admin and editable.** The demo checklist has four items: (a) the Product UnConference ID card is clearly visible, (b) the event dates are mentioned, (c) speaks positively, (d) encourages people to come. B uses the campaign's current checklist (the chosen idea's `video_rules`, or the brief's once it's editable) in the analysis prompt. Gemini judges "can this creator deliver this checklist" (on camera, talks to camera, does event and recommendation content) in place of a generic "shows products well". It also adds one reason in plain words, e.g. "Talks to camera and has shared event recaps before". Showing and editing the checklist is outside B (see orchestrator items below).
2. **Demo analysis uses Kush (`kush_2311`, public).** If the account is private or can't be read, the creator shows "Analysis failed: the account is private" (or "…couldn't read @x on Instagram"). The manual deal and outreach go ahead regardless.

## Needs the orchestrator (contract or schema changes, not B's to make)
1. **A failed analysis needs a stored state.** `analyses.fit` has a CHECK constraint `great|good|weak|excluded`. Proposal: add `'failed'`. B then stores `{fit:'failed', score_internal:0, reasons:["Analysis failed: the account is private"], metrics:{error:'private'|'not_found'|'treg_error'}}` and logs a `creator.analyzed` event with that line. F shows the reason in place of fit chips. `POST /creators/analyze` still answers 422 with the same message.
2. **Editable video checklist.** This needs: an A endpoint to change it (e.g. `PUT /campaigns/:id/brief {video_rules}`, writing `brief_json.video_rules`); the brief card in F rendering it as a checklist with add and remove; D reading `brief.video_rules` at review time, not the idea's copy, so the admin's edits count; and Lily's ideas skill putting the four demo items into `video_rules` (v3 #7 currently covers only the ID-card rule).

## Questions
None open for B. The two items above are waiting on the orchestrator.
