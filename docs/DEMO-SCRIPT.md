# Demo video script (3–5 min)

Before recording: backend + frontend running, sidebar shows **Vision model: Ready**, browser zoom 90%.
Do one warm-up search first so the CLIP model is loaded.

| Time | Show | Say |
|---|---|---|
| 0:00–0:20 | Dashboard home | "ReelScout finds short-form videos that show the exact product: 20+ Instagram Reels and 20+ Meta Ad Library videos per search, with an image brain that scores every match." |
| 0:20–1:20 | **Search by product link** (Shopify or Amazon). Point at the live pipeline bar, then the product panel. | "It fetches the page safely, extracts title, description and main image, and the vision model reads the photo: colours, print, logos, text, shape. Those attributes become the hashtags and queries for each platform. Instagram, Meta and TikTok run in parallel." |
| 1:20–2:00 | Instagram tab, Meta tab: point at **x/20 counters**. Open one exact match in the drawer. | "Every video gets a 0–100 score: 35% CLIP image similarity, 65% the vision model comparing the thumbnail with the product photo. Here is the reason and the attribute check." Open a below-threshold one: "This one is the same category but a different design, so it is hidden by default." |
| 2:00–2:40 | **Search by product name** (`protein bar`) | "Keyword search works the same way. Without a photo, the brain judges whether the video shows this type of product." |
| 2:40–3:30 | **Repeat the same search.** Point at the Duplicates removed tile, then toggle **Show previously seen**. | "Every video ID, Meta ad group, media file hash and perceptual image hash is stored. A repeat search only shows videos you haven't seen; reposts and mirrored re-uploads are caught by the image hash. When de-dup leaves fewer than 20, it widens the query automatically." |
| 3:30–4:10 | Filters + sort, bookmark 2 videos, **Export shortlist CSV**, history sidebar | "Filters by score, platform and newest; a shortlist that exports to CSV for the marketing team; full search history." |
| 4:10–4:40 | Show a shortfall banner or the backend log | "When a source is short, blocked or rate-limited, the UI says exactly what happened and what was tried. One failing source never breaks the search." |
| 4:40–5:00 | Terminal: `docker compose up --build`, `npm test` | "Runs with one command in Docker; 30 tests cover de-dup, scoring, the pipeline and the API." |
