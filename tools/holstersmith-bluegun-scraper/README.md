# HolsterSmith Bluegun gallery scraper + coverage report

Scrapes the **Bluegun Glock** and **Bluegun Sig Sauer** categories on
`holstersmith.com/vcom`, downloads every numbered gallery image per product
(`/vcom/images/blgun_glock-19-g4_1_1500.jpg`, `_2_`, `_3_`, ... incrementing
until the first 404), saves them into one folder per model, and generates a
coverage report showing which models have **2+ gallery images** (both side
views) and which have **only 1** (coverage gap).

## Why it hasn't run yet

This was built in a Claude Code web session whose environment **blocks all
outbound web traffic** (the egress proxy returns 403 for every external
domain, holstersmith.com included), so the scrape could not be executed there.
Two ways to run it:

1. **Re-run in Claude Code on the web** after enabling network access for the
   environment: on claude.ai/code open the environment's settings → network
   access, and either allow all domains or add `holstersmith.com` and
   `www.holstersmith.com` to the allowlist (docs:
   https://code.claude.com/docs/en/claude-code-on-the-web). Then ask Claude to
   run the scraper and commit the results.
2. **Run locally** — needs only Python 3.8+, no third-party packages:

   ```
   python3 scrape_holstersmith.py
   ```

## What it does

1. Discovers the two category URLs from the storefront (or take them via
   `--glock-url` / `--sig-url` if discovery misses).
2. Walks each category, following `page=N` pagination, and collects every
   product page link.
3. On each product page grabs the model name (`<h1>`, falling back to
   `<title>`) and the gallery image base name from the page HTML.
4. Probes `<base>_<n>_1500.jpg` for n = 1, 2, 3, ... and stops at the first
   404 (safety cap `--max-images 30`; falls back to another size seen in the
   page HTML if `_1_1500` doesn't exist).
5. Saves images to `output/<category>/<model-slug>/<original-filename>.jpg`.
6. Writes `output/manifest.json`, `output/coverage.csv` and
   `output/coverage_report.md`.

## Reading the report

`coverage_report.md` groups models per category:

- **✅ 2+ images** — both side profiles (or more) on file
- **⚠️ Only 1 image** — single view only: a coverage gap
- **❌ No gallery images found** — scraper found no matching image; check the
  product page manually

`coverage.csv` has the same data for sorting/filtering.

## Options

```
--out DIR          output directory (default: ./output)
--glock-url URL    Bluegun Glock category URL (skips auto-discovery)
--sig-url URL      Bluegun Sig Sauer category URL (skips auto-discovery)
--delay SECONDS    politeness delay between requests (default 0.4)
--max-images N     safety cap on gallery probes per model (default 30)
--report-only      regenerate the report from an existing output/manifest.json
```

The scraper is resumable: an interrupted run keeps its manifest progress, and
already-downloaded files of the same size are not rewritten.

## Offline test

`python3 test_scrape_offline.py` runs the full pipeline against a simulated
copy of the site (fake category/product pages + image URLs) and checks
discovery, pagination, name extraction, 404-terminated gallery probing, the
size fallback, and the report buckets. It passes without network access.
