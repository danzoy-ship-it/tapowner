#!/usr/bin/env python3
"""Scrape HolsterSmith.com Bluegun Glock & Sig Sauer galleries and report image coverage.

For each product in the two categories this script:
  1. grabs the model name from the product page,
  2. finds the gallery image base (e.g. images/blgun_glock-19-g4),
  3. downloads numbered gallery images (<base>_1_1500.jpg, <base>_2_1500.jpg, ...)
     incrementing until the server returns 404,
  4. saves them into output/<category>/<model-slug>/,
then writes manifest.json, coverage.csv and coverage_report.md (models with 2+
gallery images vs. only 1 vs. none).

Stdlib only — no pip installs needed. Honors HTTPS_PROXY/SSL_CERT_FILE env vars.

Usage:
  python3 scrape_holstersmith.py                 # discover categories, scrape, report
  python3 scrape_holstersmith.py --report-only   # rebuild report from existing output/
  python3 scrape_holstersmith.py --glock-url URL --sig-url URL   # skip auto-discovery
"""

import argparse
import csv
import html as html_mod
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

BASE_SITE = "https://www.holstersmith.com"
START_URLS = [BASE_SITE + "/vcom/", "https://holstersmith.com/vcom/"]
USER_AGENT = "Mozilla/5.0 (compatible; bluegun-coverage-audit/1.0)"
IMG_SIZE_DEFAULT = "1500"

# \b-style guards so "sig" does not match "Sign in" / "design"
CATEGORIES = {
    "glock": re.compile(r"glock", re.I),
    "sig-sauer": re.compile(r"sig[\s_-]*sauer|(?<![a-z])sig(?![a-z])", re.I),
}
BLUEGUN_RE = re.compile(r"blue\s*-?\s*guns?", re.I)

# e.g. images/blgun_glock-19-g4_1_1500.jpg  ->  base="images/blgun_glock-19-g4", n=1, size=1500
NUMBERED_IMG_RE = re.compile(
    r"""(?P<base>[^"'\s<>=]*images/[^"'\s<>]*?)_(?P<n>\d{1,2})_(?P<size>\d{3,4})\.(?P<ext>jpe?g|png|gif)""",
    re.I,
)
ANY_BLGUN_IMG_RE = re.compile(r"""[^"'\s<>=]*images/[^"'\s<>]*blgun[^"'\s<>]*\.(?:jpe?g|png|gif)""", re.I)
PRODUCT_HREF_RE = re.compile(r"(main_page=product_info|products_id=\d+|-p-\d+\.html?)", re.I)
PAGE_PARAM_RE = re.compile(r"[?&]page=(\d+)", re.I)


class LinkParser(HTMLParser):
    """Collects (href, anchor text) pairs from a page."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []  # list of [href, text]
        self._href = None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self._href = href
                self.links.append([href, ""])

    def handle_endtag(self, tag):
        if tag == "a":
            self._href = None

    def handle_data(self, data):
        if self._href and self.links:
            self.links[-1][1] += data


def extract_links(page_html, base_url):
    p = LinkParser()
    try:
        p.feed(page_html)
    except Exception:
        pass
    out = []
    for href, text in p.links:
        href = html_mod.unescape(href).strip()
        if not href or href.startswith(("javascript:", "mailto:", "#")):
            continue
        out.append((urllib.parse.urljoin(base_url, href), " ".join(text.split())))
    return out


class Fetcher:
    def __init__(self, delay=0.4, retries=3, timeout=30):
        self.delay = delay
        self.retries = retries
        self.timeout = timeout
        self._last = 0.0
        self.request_count = 0

    def _throttle(self):
        wait = self._last + self.delay - time.time()
        if wait > 0:
            time.sleep(wait)
        self._last = time.time()

    def get(self, url):
        """Returns (status_code, bytes). 404 is returned, not raised."""
        last_err = None
        for attempt in range(self.retries):
            self._throttle()
            self.request_count += 1
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    return resp.status, resp.read()
            except urllib.error.HTTPError as e:
                if e.code in (404, 410):
                    return e.code, b""
                last_err = e
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                last_err = e
            time.sleep(2 ** attempt)
        raise RuntimeError(f"GET {url} failed after {self.retries} attempts: {last_err}")


def canonical_product_key(url):
    """Dedupe key: products_id when present, else path without session params."""
    parts = urllib.parse.urlsplit(url)
    q = urllib.parse.parse_qs(parts.query)
    pid = q.get("products_id", [None])[0]
    if pid:
        return f"pid:{pid}"
    m = re.search(r"-p-(\d+)\.html?", parts.path, re.I)
    if m:
        return f"pid:{m.group(1)}"
    return f"path:{parts.path}"


def strip_session(url):
    parts = urllib.parse.urlsplit(url)
    q = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query) if k.lower() not in ("zenid", "oscsid", "sid")]
    return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(q)))


def discover_categories(fetcher, log):
    """Find the Bluegun Glock and Sig Sauer category URLs starting from the storefront."""
    found = {}
    start_err = None
    for start in START_URLS:
        try:
            status, body = fetcher.get(start)
        except RuntimeError as e:
            start_err = e
            continue
        if status != 200:
            continue
        page_html = body.decode("utf-8", "replace")
        links = extract_links(page_html, start)

        # Direct hits: anchor mentioning both bluegun and the brand
        for url, text in links:
            blob = f"{text} {url}"
            if not BLUEGUN_RE.search(blob):
                continue
            for key, brand_re in CATEGORIES.items():
                if key not in found and brand_re.search(blob):
                    found[key] = strip_session(url)
        if len(found) == len(CATEGORIES):
            return found

        # Otherwise follow generic Bluegun section links and look for brand subcategories
        section_urls = [u for u, t in links if BLUEGUN_RE.search(f"{t} {u}") and not PRODUCT_HREF_RE.search(u)]
        for section in list(dict.fromkeys(section_urls))[:5]:
            try:
                s2, b2 = fetcher.get(section)
            except RuntimeError:
                continue
            if s2 != 200:
                continue
            for url, text in extract_links(b2.decode("utf-8", "replace"), section):
                blob = f"{text} {url}"
                for key, brand_re in CATEGORIES.items():
                    if key not in found and brand_re.search(blob) and not PRODUCT_HREF_RE.search(url):
                        found[key] = strip_session(url)
            if len(found) == len(CATEGORIES):
                return found
        if found:
            return found
    if start_err:
        raise RuntimeError(f"Could not reach the storefront: {start_err}")
    return found


def collect_product_links(fetcher, category_url, log):
    """Walk a category (following page=N pagination) and return unique product URLs."""
    products = {}
    seen_pages = set()
    queue = [category_url]
    cat_parts = urllib.parse.urlsplit(category_url)
    cat_cpath = urllib.parse.parse_qs(cat_parts.query).get("cPath", [None])[0]
    while queue:
        page_url = queue.pop(0)
        if page_url in seen_pages:
            continue
        seen_pages.add(page_url)
        status, body = fetcher.get(page_url)
        if status != 200:
            log(f"    ! category page {page_url} returned {status}")
            continue
        page_html = body.decode("utf-8", "replace")
        for url, text in extract_links(page_html, page_url):
            url = strip_session(url)
            if PRODUCT_HREF_RE.search(url):
                key = canonical_product_key(url)
                products.setdefault(key, {"url": url, "link_text": text})
            elif PAGE_PARAM_RE.search(url):
                parts = urllib.parse.urlsplit(url)
                same_path = parts.path == cat_parts.path
                same_cpath = urllib.parse.parse_qs(parts.query).get("cPath", [None])[0] == cat_cpath
                if same_path and same_cpath and url not in seen_pages:
                    queue.append(url)
    return list(products.values())


def parse_product_page(page_html, page_url):
    """Returns (model_name, image_base_url or None, sizes_seen)."""
    name = None
    m = re.search(r"<h1[^>]*>(.*?)</h1>", page_html, re.I | re.S)
    if m:
        name = " ".join(html_mod.unescape(re.sub(r"<[^>]+>", " ", m.group(1))).split())
    if not name:
        m = re.search(r"<title[^>]*>(.*?)</title>", page_html, re.I | re.S)
        if m:
            title = html_mod.unescape(m.group(1))
            name = " ".join(re.split(r"\s*(?:::|\||\[)", title)[0].split())
    name = name or "unknown-model"

    bases = {}  # base -> (has_blgun, sizes)
    for m in NUMBERED_IMG_RE.finditer(page_html):
        base = html_mod.unescape(m.group("base"))
        entry = bases.setdefault(base, {"blgun": "blgun" in base.lower(), "sizes": set(), "ext": m.group("ext").lower()})
        entry["sizes"].add(m.group("size"))
    chosen = None
    if bases:
        # prefer blgun-named bases, then the one referenced most specifically
        chosen = sorted(bases.items(), key=lambda kv: (not kv[1]["blgun"], len(kv[0])))[0]
    if not chosen:
        m = ANY_BLGUN_IMG_RE.search(page_html)
        if m:
            path = html_mod.unescape(m.group(0))
            base = re.sub(r"(_\d{1,2})?(_\d{3,4})?\.(?:jpe?g|png|gif)$", "", path, flags=re.I)
            chosen = (base, {"blgun": True, "sizes": set(), "ext": "jpg"})
    if not chosen:
        return name, None, [], "jpg"
    base, meta = chosen
    base_url = urllib.parse.urljoin(page_url, base)
    sizes = sorted(meta["sizes"], key=lambda s: (s != IMG_SIZE_DEFAULT, -int(s)))
    ext = "jpg" if meta["ext"] in ("jpg", "jpeg") else meta["ext"]
    return name, base_url, sizes, ext


def slug_for(base_url, name):
    if base_url:
        stem = base_url.rsplit("/", 1)[-1]
        stem = re.sub(r"^blgun[_-]", "", stem, flags=re.I)
        if stem:
            return re.sub(r"[^a-z0-9._-]+", "-", stem.lower()).strip("-")
    return re.sub(r"[^a-z0-9._-]+", "-", name.lower()).strip("-") or "unknown"


def download_gallery(fetcher, base_url, sizes, ext, dest_dir, max_images, log):
    """Probe <base>_<n>_<size>.<ext> incrementing n until the first 404. Returns saved filenames."""
    sizes = list(sizes) or [IMG_SIZE_DEFAULT]
    if IMG_SIZE_DEFAULT not in sizes:
        sizes.insert(0, IMG_SIZE_DEFAULT)
    size = None
    first = None
    for cand in sizes:
        url = f"{base_url}_1_{cand}.{ext}"
        status, body = fetcher.get(url)
        if status == 200 and len(body) > 500:
            size, first = cand, (url, body)
            break
    if size is None:
        return [], sizes[0]

    dest_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    n = 1
    while n <= max_images:
        url = f"{base_url}_{n}_{size}.{ext}"
        if n == 1 and first:
            status, body = 200, first[1]
        else:
            status, body = fetcher.get(url)
        if status != 200 or len(body) <= 500:
            break
        fname = url.rsplit("/", 1)[-1]
        path = dest_dir / fname
        if not (path.exists() and path.stat().st_size == len(body)):
            path.write_bytes(body)
        saved.append(fname)
        n += 1
    return saved, size


def write_report(out_dir, manifest):
    by_cat = {}
    for item in manifest["products"]:
        by_cat.setdefault(item["category"], []).append(item)

    lines = [
        "# HolsterSmith Bluegun gallery coverage report",
        "",
        f"Source: {manifest.get('source', BASE_SITE + '/vcom/')} — categories: "
        + ", ".join(f"{c} ({url})" for c, url in manifest.get("category_urls", {}).items()),
        "",
        "Numbered gallery images per model (`*_1_1500.jpg`, `*_2_1500.jpg`, ... probed until 404).",
        "On this catalog image 1 and image 2 are normally the two opposite side profiles, so:",
        "",
        "- **2+ images** -> both side views (or more) available",
        "- **1 image** -> only a single view: coverage gap",
        "- **0 images** -> no gallery found by the scraper: needs a manual look",
        "",
    ]
    csv_rows = []
    for cat in sorted(by_cat):
        items = sorted(by_cat[cat], key=lambda i: i["model"].lower())
        multi = [i for i in items if i["image_count"] >= 2]
        single = [i for i in items if i["image_count"] == 1]
        none = [i for i in items if i["image_count"] == 0]
        lines += [f"## {cat} — {len(items)} models "
                  f"({len(multi)} with 2+ images, {len(single)} with only 1, {len(none)} with none)", ""]
        lines += [f"### ✅ 2+ images ({len(multi)})", ""]
        lines += [f"- {i['model']} — {i['image_count']} images (`{i['slug']}`)" for i in multi] or ["- (none)"]
        lines += ["", f"### ⚠️ Only 1 image ({len(single)})", ""]
        lines += [f"- {i['model']} (`{i['slug']}`)" for i in single] or ["- (none)"]
        if none:
            lines += ["", f"### ❌ No gallery images found ({len(none)})", ""]
            lines += [f"- {i['model']} — {i['url']}" for i in none]
        lines.append("")
        for i in items:
            csv_rows.append([cat, i["model"], i["slug"], i["image_count"],
                             "2+" if i["image_count"] >= 2 else str(i["image_count"]), i["url"]])

    (out_dir / "coverage_report.md").write_text("\n".join(lines), encoding="utf-8")
    with (out_dir / "coverage.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["category", "model", "slug", "image_count", "bucket", "product_url"])
        w.writerows(csv_rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(Path(__file__).parent / "output"), help="output directory")
    ap.add_argument("--glock-url", help="Bluegun Glock category URL (skips auto-discovery)")
    ap.add_argument("--sig-url", help="Bluegun Sig Sauer category URL (skips auto-discovery)")
    ap.add_argument("--delay", type=float, default=0.4, help="seconds between requests (politeness)")
    ap.add_argument("--max-images", type=int, default=30, help="safety cap on gallery probes per model")
    ap.add_argument("--report-only", action="store_true", help="regenerate report from existing manifest.json")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"

    def log(msg):
        print(msg, flush=True)

    if args.report_only:
        manifest = json.loads(manifest_path.read_text())
        write_report(out_dir, manifest)
        log(f"Report regenerated at {out_dir / 'coverage_report.md'}")
        return

    fetcher = Fetcher(delay=args.delay)

    cat_urls = {}
    if args.glock_url:
        cat_urls["glock"] = args.glock_url
    if args.sig_url:
        cat_urls["sig-sauer"] = args.sig_url
    missing = [k for k in CATEGORIES if k not in cat_urls]
    if missing:
        log("Discovering category URLs...")
        discovered = discover_categories(fetcher, log)
        for k in missing:
            if k in discovered:
                cat_urls[k] = discovered[k]
    for k in CATEGORIES:
        if k not in cat_urls:
            sys.exit(f"ERROR: could not discover the '{k}' Bluegun category. "
                     f"Pass it explicitly with --{'glock' if k == 'glock' else 'sig'}-url URL")
    for k, u in cat_urls.items():
        log(f"  {k}: {u}")

    manifest = {"source": START_URLS[0], "category_urls": cat_urls, "products": []}
    for cat, cat_url in cat_urls.items():
        log(f"\n=== {cat} ===")
        products = collect_product_links(fetcher, cat_url, log)
        log(f"  {len(products)} product pages found")
        for prod in products:
            status, body = fetcher.get(prod["url"])
            if status != 200:
                log(f"  ! {prod['url']} -> HTTP {status}")
                continue
            page_html = body.decode("utf-8", "replace")
            name, base_url, sizes, ext = parse_product_page(page_html, prod["url"])
            slug = slug_for(base_url, name)
            dest = out_dir / cat / slug
            if base_url:
                images, size_used = download_gallery(fetcher, base_url, sizes, ext, dest, args.max_images, log)
            else:
                images, size_used = [], None
            manifest["products"].append({
                "category": cat, "model": name, "slug": slug, "url": prod["url"],
                "image_base": base_url, "size": size_used,
                "images": images, "image_count": len(images),
            })
            log(f"  {name}: {len(images)} image(s)")
        # persist as we go so an interrupted run keeps its progress
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    write_report(out_dir, manifest)
    log(f"\nDone. {fetcher.request_count} HTTP requests total.")
    log(f"Images:  {out_dir}/<category>/<model-slug>/")
    log(f"Report:  {out_dir / 'coverage_report.md'}  (+ coverage.csv, manifest.json)")


if __name__ == "__main__":
    main()
