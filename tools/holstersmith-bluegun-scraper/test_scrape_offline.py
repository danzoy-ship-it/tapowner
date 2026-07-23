#!/usr/bin/env python3
"""Offline end-to-end test: runs the scraper pipeline against a simulated site.

No network needed. Exercises category discovery, pagination, product parsing,
404-terminated gallery probing, the image-size fallback, and report buckets.
"""

import json
import shutil
import tempfile
from pathlib import Path

import scrape_holstersmith as S

V = "https://www.holstersmith.com/vcom/"
IDX = V + "index.php"
JPG = b"\xff\xd8\xff" + b"x" * 2000  # big enough to pass the >500-byte sanity check

PAGES = {
    V: f"""
      <html><body>
        <a href="index.php?main_page=login">Sign In</a>
        <a href="index.php?main_page=index&cPath=5">BLUEGUNS</a>
        <a href="index.php?main_page=index&cPath=9">Holster Molds</a>
      </body></html>""",
    IDX + "?main_page=index&cPath=5": f"""
      <html><body>
        <a href="index.php?main_page=login">Sign In</a>
        <a href="index.php?main_page=index&cPath=5_10">GLOCK</a>
        <a href="index.php?main_page=index&cPath=5_11">SIG SAUER</a>
        <a href="index.php?main_page=index&cPath=5_12">S&amp;W</a>
      </body></html>""",
    IDX + "?main_page=index&cPath=5_10": f"""
      <html><body>
        <h1>Bluegun - GLOCK</h1>
        <a href="index.php?main_page=product_info&cPath=5_10&products_id=101">Glock 19 Gen 4 Bluegun</a>
        <a href="index.php?main_page=product_info&cPath=5_10&products_id=102">Glock 26 Bluegun</a>
        <a href="index.php?main_page=index&cPath=5_10&page=2">2</a>
        <a href="index.php?main_page=index&cPath=5_11&page=2">other cat pagination (ignore)</a>
      </body></html>""",
    IDX + "?main_page=index&cPath=5_10&page=2": f"""
      <html><body>
        <a href="index.php?main_page=product_info&cPath=5_10&products_id=103">Glock 43X Bluegun</a>
        <a href="index.php?main_page=index&cPath=5_10&page=1">1</a>
      </body></html>""",
    IDX + "?main_page=index&cPath=5_11": f"""
      <html><body>
        <a href="index.php?main_page=product_info&cPath=5_11&products_id=201">Sig Sauer P320 Compact Bluegun</a>
        <a href="index.php?main_page=product_info&cPath=5_11&products_id=202">Sig Sauer P365 Bluegun</a>
        <a href="index.php?main_page=product_info&cPath=5_11&products_id=203">Sig Sauer P229 Bluegun</a>
        <a href="index.php?main_page=product_info&cPath=5_11&products_id=204">Sig Sauer M11-A1 Bluegun</a>
      </body></html>""",
}

PRODUCTS = {
    101: ("Glock 19 Gen 4 Bluegun", ["images/blgun_glock-19-g4_1_1500.jpg", "images/blgun_glock-19-g4_2_1500.jpg"]),
    102: ("Glock 26 Bluegun", ["images/blgun_glock-26_1_1500.jpg"]),
    103: ("Glock 43X Bluegun", ["images/blgun_glock-43x_1_1500.jpg"]),
    201: ("Sig Sauer P320 Compact Bluegun", ["images/blgun_sig-p320c_1_1500.jpg"]),
    202: ("Sig Sauer P365 Bluegun", ["images/blgun_sig-p365_1_1500.jpg"]),
    203: ("Sig Sauer P229 Bluegun", []),  # no gallery -> 0-image bucket
    204: ("Sig Sauer M11-A1 Bluegun", ["images/blgun_sig-m11-a1_1_250.jpg"]),  # only 250px exists
}
for pid, (name, imgs) in PRODUCTS.items():
    cpath = "5_10" if pid < 200 else "5_11"
    tags = "".join(f'<a href="{p}"><img src="{p}"></a>' for p in imgs)
    PAGES[IDX + f"?main_page=product_info&cPath={cpath}&products_id={pid}"] = (
        f"<html><head><title>{name} :: HolsterSmith</title></head>"
        f"<body><h1>{name}</h1>{tags}</body></html>"
    )

# which numbered images actually exist server-side (n-range per base, per size)
IMAGES = {
    ("blgun_glock-19-g4", "1500"): 3,   # page shows 2, server has 3 -> probing must find the 3rd
    ("blgun_glock-26", "1500"): 1,
    ("blgun_glock-43x", "1500"): 2,
    ("blgun_sig-p320c", "1500"): 2,
    ("blgun_sig-p365", "1500"): 1,
    ("blgun_sig-m11-a1", "250"): 2,     # no 1500 variant at all -> size fallback path
}


class MockFetcher:
    def __init__(self):
        self.request_count = 0

    def get(self, url):
        self.request_count += 1
        if url in PAGES:
            return 200, PAGES[url].encode()
        m = S.NUMBERED_IMG_RE.search(url)
        if m:
            stem = m.group("base").rsplit("/", 1)[-1]
            if int(m.group("n")) <= IMAGES.get((stem, m.group("size")), 0):
                return 200, JPG
        return 404, b""


def run():
    out = Path(tempfile.mkdtemp(prefix="blgun_test_"))
    f = MockFetcher()
    log = lambda m: None

    cats = S.discover_categories(f, log)
    assert cats == {
        "glock": IDX + "?main_page=index&cPath=5_10",
        "sig-sauer": IDX + "?main_page=index&cPath=5_11",
    }, f"discovery wrong: {cats}"

    manifest = {"source": V, "category_urls": cats, "products": []}
    for cat, cat_url in cats.items():
        for prod in S.collect_product_links(f, cat_url, log):
            status, body = f.get(prod["url"])
            assert status == 200, prod["url"]
            name, base_url, sizes, ext = S.parse_product_page(body.decode(), prod["url"])
            slug = S.slug_for(base_url, name)
            if base_url:
                images, size_used = S.download_gallery(f, base_url, sizes, ext, out / cat / slug, 30, log)
            else:
                images, size_used = [], None
            manifest["products"].append({"category": cat, "model": name, "slug": slug,
                                         "url": prod["url"], "image_base": base_url, "size": size_used,
                                         "images": images, "image_count": len(images)})
    S.write_report(out, manifest)

    got = {p["slug"]: p["image_count"] for p in manifest["products"]}
    want = {"glock-19-g4": 3, "glock-26": 1, "glock-43x": 2,
            "sig-p320c": 2, "sig-p365": 1, "sig-m11-a1": 2, "sig-sauer-p229-bluegun": 0}
    assert got == want, f"image counts wrong:\n got: {got}\nwant: {want}"

    names = {p["slug"]: p["model"] for p in manifest["products"]}
    assert names["glock-19-g4"] == "Glock 19 Gen 4 Bluegun"

    on_disk = sorted(str(p.relative_to(out)) for p in out.rglob("*.jpg"))
    assert "glock/glock-19-g4/blgun_glock-19-g4_3_1500.jpg" in on_disk, on_disk
    assert "sig-sauer/sig-m11-a1/blgun_sig-m11-a1_2_250.jpg" in on_disk, on_disk
    assert len(on_disk) == sum(v for v in want.values()), on_disk

    report = (out / "coverage_report.md").read_text()
    assert "Glock 26 Bluegun" in report.split("Only 1 image")[1].split("###")[0]
    assert "Sig Sauer P229 Bluegun" in report.split("No gallery images found")[1]
    csv_text = (out / "coverage.csv").read_text()
    assert "glock,Glock 19 Gen 4 Bluegun,glock-19-g4,3,2+" in csv_text

    shutil.rmtree(out)
    print(f"PASS — 7 models, {f.request_count} mock requests, buckets and files all correct")


if __name__ == "__main__":
    run()
