# Test results

Five products, run end to end with `npm run eval` on 8 Oct 2026 (09:23 UTC).
Three keyword searches across three categories, one Amazon product link and one Shopify product link.

Thresholds: a video is **shown** at score ≥ 50 and labelled **exact match** at ≥ 70. Counts below are videos shown after
de-duplication against the same search and every earlier search.

## Summary

| # | Product | Input | Instagram | Meta | TikTok | Avg score | Duplicates removed | Time | Outcome |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Oversized graphic tee | Keyword (apparel) | **23 / 20** | **26 / 20** | 30 | 70 | 13 | 246 s | Both minimums met |
| 2 | Vitamin C face serum | Keyword (skincare) | **22 / 20** | 13 / 20 | 28 | 70 | 68 | 301 s | Meta shortfall, reported |
| 3 | Wireless earbuds | Keyword (electronics) | **24 / 20** | **24 / 20** | 0 | 72 | 6 | 126 s | Both minimums met |
| 4 | RiteBite Max Protein Ultimate Choco Almond bar | Amazon link | 0 / 20 | 0 / 20 | 0 | – | 402 | 87 s | Everything already seen |
| 5 | Allbirds Men's Tree Runner (Jet Black) | Shopify link | 0 / 20 | 6 / 20 | 0 | 54 | 88 | 116 s | Provider credit ran out |

### What the run shows

- **Keyword searches (1–3):** Instagram met the 20 minimum every time (22–24). Meta met it twice; for the serum it stopped at
  13 / 20 after 5 widened queries and 3 rounds, and the UI reported the shortfall. Average match score was 70–72.
- **Product 4 (Amazon link):** 0 shown because **402 duplicates were removed**. This product had been searched more than five times
  during development, so every relevant Reel and ad had already been shown. This is the uniqueness rule working as specified;
  *Show previously seen* brings them back. TikTok also stopped here because the Apify free credit ran out.
- **Product 5 (Shopify link):** the Apify free credit ran out during this product (HTTP 402/403), so Instagram and TikTok stopped
  with a clear message after trying every query. The free Meta browser collector kept working and returned 6.
- **Vision model:** Gemini's free tier was overloaded for the whole run (many 503 and 429 responses). The brain switched models
  automatically (3.8 → 3.7 → 3.6 → 3.5 → 3.5-flash-lite) and, when its time budget ran out, scored the remaining videos with
  CLIP image similarity and caption evidence. No search failed because of it.

## Good vs bad matches

Reasons below are the brain's own explanations, copied from the results.

**Good matches: specific, product-level reasons**

| Score | Platform | Product | Reason |
|---|---|---|---|
| 91 | Instagram | Wireless earbuds | Sleek wireless earbuds inside an open metallic charging case |
| 89 | Meta | Wireless earbuds | Person holding open wireless charging case containing black earbuds |
| 87 | Meta | Vitamin C serum | Amber glass dropper bottle clearly visible, exact vitamin c face serum |
| 84 | Meta | Graphic tee | Oversized black graphic tee with print clearly displayed on a surface |
| 68 | Meta | Allbirds Tree Runner | Black knit sneaker with white foam sole (matches the Jet Black / white sole variant) |

**Correctly rejected: different product or no product**

| Score | Platform | Product searched | Reason |
|---|---|---|---|
| 0 | Instagram | Vitamin C serum | Portrait of a woman talking about chocolate, no product |
| 0 | Instagram | RiteBite bar | Shirataki noodles soup dish, unrelated |
| 3 | Instagram | RiteBite bar | Greek platter meal video, unrelated |
| 0 | Meta | Allbirds Tree Runner | Shows a woman crying in a car |

**Weak spots found (honest)**

| Score | Platform | Product | What happened | Fix I would make |
|---|---|---|---|---|
| 52 | Meta | Allbirds Tree Runner (Jet Black) | "Light grey knit sneaker, different colorway" was **shown** as a close match | For product-link searches, cap the score below 50 when the colour check is "no match", or raise the shown threshold to 60 |
| 57–59 | Instagram | Vitamin C serum | "Person holding a yellow skincare product box" passed as close | For keyword searches, require "product visible" plus a type match before scoring above 50 |
| 0 | Several | Mixed | "Visual similarity 0/100 (vision model busy)": scored without Gemini, so a few real matches may be under-scored | Re-queue skipped videos for a second vision pass once the model is free |

## Per product

### 1. Oversized graphic tee
Input: `oversized graphic tee`
- Instagram Reels: 23 shown, 21 below threshold, 1 query
- Meta Ad Library: 26 shown, 20 below threshold, 1 query
- TikTok: 30 shown, 17 below threshold, 1 query

Highest scores
- **84** · Meta · Oversized black graphic tee with print clearly displayed on a surface · [open](https://www.facebook.com/ads/library/?id=1280838900847526)
- **80** · Instagram · Black graphic tee with boxy silhouette and dropped shoulders · [open](https://www.instagram.com/p/DdDQzCYzoNk/)
- **80** · Meta · Model wearing an oversized black graphic tee with front print · [open](https://www.facebook.com/ads/library/?id=1218284816324825)

Borderline (50–59)
- **59** · Instagram · Black graphic tee with prominent print, though fit appears standard · [open](https://www.instagram.com/p/DeLepmnqv6h/)
- **59** · TikTok · Visual similarity 59, caption match 60 (vision model busy) · [open](https://www.tiktok.com/@chrissywilson11/video/7601891603225087263)

Rejected
- **0** · Meta · Visual similarity 0, caption match 0 (vision model busy) · [open](https://www.facebook.com/ads/library/?id=1118579180853803)

### 2. Vitamin C face serum
Input: `vitamin c face serum`
- Instagram Reels: 22 shown, 51 below threshold, 3 rounds, 3 queries
- Meta Ad Library: 13 shown, 105 below threshold, 3 rounds, 5 queries. Time limit reached; shortfall shown in the UI
- TikTok: 28 shown, 22 below threshold, 1 query

Highest scores
- **87** · Meta · Amber glass dropper bottle clearly visible, exact vitamin c face serum · [open](https://www.facebook.com/ads/library/?id=2161516808136942)
- **85** · Meta · Amber glass serum bottle with dropper cap held by a person · [open](https://www.facebook.com/ads/library/?id=2010383689596000)
- **84** · TikTok · Vitamin C face serum bottle clearly displayed with text overlay · [open](https://www.tiktok.com/@glowwithruthy2/video/7640091781631085831)

Borderline (50–59)
- **59** · Instagram · Woman beside yellow vitamin c product boxes · [open](https://www.instagram.com/p/Dd6YTc_oaZ5/)
- **57** · Instagram · Person holding a yellow skincare product box · [open](https://www.instagram.com/p/DZXYPJjNCho/)

Rejected
- **0** · Instagram · Portrait of a woman talking about chocolate, no product · [open](https://www.instagram.com/p/DeE_SnROmyj/)

### 3. Wireless earbuds
Input: `wireless earbuds`
- Instagram Reels: 24 shown, 35 below threshold, 2 queries
- Meta Ad Library: 24 shown, 22 below threshold, 1 query
- TikTok: stopped, Apify free credit used up

Highest scores
- **91** · Instagram · Sleek wireless earbuds inside an open metallic charging case · [open](https://www.instagram.com/p/CUuieKJDyMW/)
- **91** · Instagram · Open-ear wireless earbuds held in a charging case by a person · [open](https://www.instagram.com/p/DclhULctbOb/)
- **89** · Meta · Person holding open wireless charging case containing black earbuds · [open](https://www.facebook.com/ads/library/?id=985681216856144)

Borderline (50–59)
- **58** · Meta · Woman holding a white charging case and wireless earbuds · [open](https://www.facebook.com/ads/library/?id=939577995904550)
- **57** · Meta · Shows a smartwatch and a compact charging case with earbuds · [open](https://www.facebook.com/ads/library/?id=1100242819193358)

### 4. RiteBite Max Protein Ultimate Choco Almond bar
Input: `https://www.amazon.in/dp/B0153O5XYU` (product read from the Amazon page: title, brand, main image)
- Instagram Reels: 0 shown, 20 below threshold, 6 queries
- Meta Ad Library: 0 shown, 8 queries; every brand ad had been shown in earlier searches
- TikTok: stopped, Apify free credit used up
- Duplicates removed: 402

Rejected
- **0** · Instagram · Shirataki noodles soup dish, unrelated · [open](https://www.instagram.com/p/DeJnOkiRn4h/)
- **3** · Instagram · Greek platter meal video, unrelated · [open](https://www.instagram.com/p/DeMJYE-IGA1/)

In an earlier development search for the same product, a TikTok scored **79 (exact match)** with the reason "exact Max Protein
Choco Almond bar held by a woman", with print, colour, shape, logo and visibility all matching.

### 5. Allbirds Men's Tree Runner (Jet Black)
Input: `https://www.allbirds.com/products/mens-tree-runners` (product read from the Shopify product feed)
- Instagram Reels and TikTok: stopped, Apify free credit used up (every query tried, each reported)
- Meta Ad Library: 6 shown, 68 below threshold, 2 rounds, 8 queries

Highest scores
- **68** · Meta · Black knit sneaker with white foam sole · [open](https://www.facebook.com/ads/library/?id=1695902385048908)
- **52** · Meta · Light grey knit sneaker, different colorway · [open](https://www.facebook.com/ads/library/?id=1609540329241310) (weak spot, see above)

Rejected
- **0** · Meta · Two women outdoors, no shoes visible · [open](https://www.facebook.com/ads/library/?id=1041236381806530)
- **0** · Meta · A woman crying in a car · [open](https://www.facebook.com/ads/library/?id=1123150186683696)

## How to reproduce

```bash
cd backend
npm run eval                      # runs scripts/test-products.json, writes a fresh report here
npm run eval -- "protein bar"     # or any product names / links
```
Results depend on live platform data and provider credit, so counts will differ between runs.
