# Testing

Three layers: automated tests (run on every change), live end-to-end runs with real platform data, and a manual UI checklist.

## 1. Automated tests: 32 passing

```bash
cd backend && npm test
```

| File | What it proves |
|---|---|
| `test/ssrf.test.js` | Private, loopback, link-local and metadata IPs are blocked; only http/https on ports 80/443; credentials in URLs rejected |
| `test/productResolver.test.js` | Product data read from JSON-LD (incl. `@graph`), Amazon page layout and Open Graph tags; URL vs keyword detection |
| `test/normalize.test.js` | Instagram, Meta and TikTok items mapped to one shape; image-only posts and ads dropped; ad nodes found anywhere in Facebook's JSON |
| `test/dedup.test.js` | Perceptual hash survives resize/re-encode, catches mirrored re-uploads; media hash ignores signed URLs; caption reposts; same Meta ad under several IDs; earlier searches hidden unless asked |
| `test/scoring.test.js` | CLIP calibration, score blend (35 % CLIP / 65 % vision model), thresholds (50 shown, 70 exact) |
| `test/brandfloor.test.js` | Fallback scoring when the vision model is busy: brand evidence floor, weak matches stay below threshold |
| `test/fallback.test.js` | Messy marketplace titles cleaned into brand-first queries and short hashtags |
| `test/pipeline.test.js` | Whole search offline with fake sources: 20 + 20 reached despite 25 % poor matches, a failing TikTok never breaks the search, a repeat search shows nothing old as new |
| `test/api.test.js` | Input validation, unsafe link blocked before queueing, background job + SSE progress, results, history, CSV export (formula-injection safe), shortlist, clear 404s |

Also verified: a **fresh clone** of the GitHub repo installs, passes all 32 tests and builds the frontend.

## 2. Live end-to-end runs (real Instagram, Meta and TikTok data)

| Scenario | Result |
|---|---|
| Keyword search, 3 categories (`npm run eval`) | ✅ 22–24 Instagram, 13–26 Meta per search, average score 70–72 ([TEST-RESULTS.md](TEST-RESULTS.md)) |
| Product link: Amazon (page layout) and Shopify (product feed) | ✅ title, brand, description and main image extracted; brain attributes shown |
| Repeat search | ✅ only new videos shown; up to 402 duplicates removed |
| Gemini overloaded (503 / 429) | ✅ switched 3.8 → 3.7 → 3.6 → 3.5 → 3.5-flash-lite automatically, then CLIP + caption fallback; no search failed |
| Apify free credit used up mid-run | ✅ only Instagram/TikTok stopped, with a clear message; Meta kept working |
| Meta Ad Library via the free browser collector | ✅ 30–60 video ads per query |
| TikTok from India | ✅ data, covers and scores arrive through the provider; detail panel explains why playback is unavailable in India |
| Unsafe URL and bad input via the API | ✅ `UNSAFE_URL` / `INVALID_INPUT` with a clear message |

## 3. Manual UI checklist

✅ = checked by hand, ⬜ = not yet checked.

| # | Check | Expected | Result |
|---|---|---|---|
| 1 | Search by product name | Live pipeline, product panel, x/20 counters, cards with score + reason | ✅ |
| 2 | Search by product link | Product title, image and brain attributes shown | ✅ |
| 3 | Open a video card | Detail panel: reason, score breakdown, attribute checks | ✅ |
| 4 | Layout at 1920, 1366, 1024 and 768 px | No overlap; sidebar becomes a menu below 1100 px | ✅ |
| 5 | Search with only an uploaded image | Results from the photo (or a clear "add a product name" message if the vision model is busy) | ✅ |
| 6 | Filters: Match, Posted, Sort, text search | Results change instantly, "Showing X of Y" updates, Reset works | ✅ |
| 7 | Repeat a search, then Show previously seen | Old videos appear with a "Seen before" badge | ✅ |
| 8 | Bookmark 2 videos, Shortlisted only, Export shortlist | Only saved videos shown; CSV downloads | ✅ |
| 9 | Export CSV for a search | CSV with platform, score, reason, link, caption | ✅ |
| 10 | Click an old search in History | Results reload | ✅ |
| 11 | TikTok toggle off, then search | Only Instagram and Meta tabs | ✅ |
| 12 | Type `http://localhost:4000` as the product link | Blocked before any fetch, with a clear red notice ("Only standard web ports are allowed" / "Internal addresses are blocked") | ✅ |
| 13 | Stop the backend and refresh | "Backend not reachable" banner | ✅ |
| 14 | Phone, tablet, laptop and desktop widths (Chrome device toolbar) | Filters fold behind a Filters button; no sideways scroll | ✅ |
| 15 | `docker compose up --build` | App on http://localhost:8080 | ⬜ |
