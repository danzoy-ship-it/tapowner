#!/usr/bin/env python3
"""
NOAA MRMS MESH (Maximum Estimated Size of Hail) -> hail-size swath polygons.

FEASIBILITY (proven 2026-07-16): free public source, deep historical archive:
    s3://noaa-mrms-pds/CONUS/MESH_Max_1440min_00.50/YYYYMMDD/MRMS_MESH_Max_1440min_00.50_YYYYMMDD-HHMMSS.grib2.gz
  - Anonymous/unsigned S3 (no AWS creds needed). Confirmed data back to at least
    2020-10 (likely deeper -- not exhaustively probed) through today, 30-min cadence.
  - MESH_Max_1440min = trailing 24-hour max MESH at each timestamp. To match a
    SPC STORM-DAY (SPC dates reports to the 12Z-12Z convective day, NOT the
    calendar day), take the 12Z file of the NEXT day: its trailing-24h max covers
    12Z D -> 12Z D+1 = SPC storm-day D exactly. THIS IS NOW THE DEFAULT (see main;
    the old 23:30Z-of-D choice misaligned with SPC dating and under/over-counted
    depending on storm timing -- pass --no-shift for the old calendar-day behavior).
  - Grid: regular lat/lon, 0.01 deg (~1km) spacing, CONUS (lat 20.005-54.995,
    lon -129.995..-60.005 i.e. stored as 230.005-299.995 in 0-360 convention).
    Values are millimeters; -3 = "no coverage" flag (masked to 0 here); ceiling
    ~152.4mm (6in) is the product's documented cap.
  - Cross-validated against SPC 2024-05-28 Hockley County TX report (reported
    5.00in): MESH grid shows 2.3-3.3in in that footprint. MESH is DOCUMENTED to
    underestimate very large hail (>3-4in) -- this is expected, not a bug. MESH
    is a radar/reflectivity-derived estimate, not a direct measurement.
  - HONEST CAVEAT: a compact cell near Brownsville (26.3N,-97.6W, ~37 pixels,
    max 5.6in) has NO corroborating SPC report. Could be a real unreported
    storm or a coastal radar artifact (AP/sea clutter) -- flagged, not silently
    dropped. Production use should sanity-filter cells with no spatial size
    (single/few-pixel spikes) or cross-check against reflectivity/QC flags.

APPROACH: threshold the grid at each hail-size band (>=0.75/1.0/1.5/2.0in),
vectorize connected regions (rasterio.features.shapes), dissolve + simplify
(tolerance ~0.005 deg ~500m) to keep polygon count small ("thousands, not
millions" per the disk-lean design rule), clip to a generous Texas bbox, and
emit one GeoJSON FeatureCollection per event for the Node loader to ingest.

Usage:
    python mrms_mesh_contour.py <SPC storm-day YYYY-MM-DD> [--hhmm 1200] [--no-shift] [--out FILE]
    (default fetches the convective-day-aligned 12Z-of-D+1 file; event_date stamped = D)

Requires: boto3, rasterio, xarray, cfgrib, shapely (pip-installed this session).
"""
import argparse
import gzip
import json
import shutil
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

BANDS_IN = [0.75, 1.0, 1.5, 2.0]
# Generous TX bbox (covers all 254 counties with margin), 0-360 lon convention.
TX_LAT = (25.5, 36.7)
TX_LON0360 = (253.0, 267.0)
MM_PER_IN = 25.4
SIMPLIFY_DEG = 0.005  # ~500m
MIN_PIXELS = 3         # drop connected regions smaller than this (speckle)


def s3_key(date_str, hhmm):
    ymd = date_str.replace("-", "")
    return f"CONUS/MESH_Max_1440min_00.50/{ymd}/MRMS_MESH_Max_1440min_00.50_{ymd}-{hhmm}00.grib2.gz"


def fetch_grib(date_str, hhmm, workdir):
    import boto3
    from botocore import UNSIGNED
    from botocore.config import Config

    key = s3_key(date_str, hhmm)
    gz_path = workdir / "mesh.grib2.gz"
    grib_path = workdir / "mesh.grib2"
    s3 = boto3.client("s3", config=Config(signature_version=UNSIGNED), region_name="us-east-1")
    print(f"  fetching s3://noaa-mrms-pds/{key}", file=sys.stderr)
    s3.download_file("noaa-mrms-pds", key, str(gz_path))
    with gzip.open(gz_path, "rb") as f_in, open(grib_path, "wb") as f_out:
        shutil.copyfileobj(f_in, f_out)
    return grib_path


def load_tx_inches(grib_path):
    import xarray as xr

    ds = xr.open_dataset(grib_path, engine="cfgrib")
    da = ds["unknown"]
    tx = da.sel(latitude=slice(TX_LAT[1], TX_LAT[0]), longitude=slice(TX_LON0360[0], TX_LON0360[1]))
    vals = tx.values.astype("float32").copy()
    vals[vals < 0] = 0.0  # mask "no coverage" (-3) and any other negative flag
    inch = vals / MM_PER_IN
    lats = tx.latitude.values
    lons = tx.longitude.values - 360.0  # back to standard -180..180
    valid_time = str(ds["valid_time"].values)
    return inch, lats, lons, valid_time


def raster_transform(lats, lons):
    from affine import Affine

    # lats descending, lons ascending, uniform 0.01 deg spacing
    dx = lons[1] - lons[0]
    dy = lats[1] - lats[0]  # negative
    return Affine(dx, 0, lons[0] - dx / 2, 0, dy, lats[0] - dy / 2)


def band_polygons(inch, transform, threshold):
    from rasterio import features
    from shapely.geometry import shape
    from shapely.ops import unary_union

    mask = inch >= threshold
    if not mask.any():
        return None
    geoms = []
    for geom, val in features.shapes(mask.astype("uint8"), mask=mask, transform=transform, connectivity=8):
        if val != 1:
            continue
        poly = shape(geom)
        if poly.area < (MIN_PIXELS * (0.01 ** 2)):  # drop sub-3-pixel speckle
            continue
        geoms.append(poly)
    if not geoms:
        return None
    merged = unary_union(geoms)
    simplified = merged.simplify(SIMPLIFY_DEG, preserve_topology=True)
    return simplified


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("event_date", help="SPC storm-day (YYYY-MM-DD). By default the MRMS file fetched is the 12Z snapshot of the NEXT day, whose trailing-24h MESH max covers this storm-day's 12Z-12Z SPC convective window.")
    ap.add_argument("--hhmm", default="1200", help="HHMM UTC of the fetched file (default 1200 = 12Z, the SPC convective-day boundary)")
    ap.add_argument("--no-shift", action="store_true", help="fetch the literal event_date file (old calendar-day behavior) instead of the convective-day-aligned 12Z-of-next-day file")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    # CONVECTIVE-DAY ALIGNMENT (fix, 2026-07-16): SPC dates storm reports to the
    # 12Z-12Z convective day, NOT the calendar day. MESH_Max_1440min at 12Z of D+1
    # = trailing-24h max over 12Z D -> 12Z D+1 = exactly SPC storm-day D. The old
    # default (23:30Z of D) misaligned with SPC dating and could under- OR over-count
    # depending on storm timing (e.g. SPC 2025-06-01: 23:30Z-of-D gave 10k parcels,
    # the aligned 12Z-of-D+1 gave 178k, matching SPC). Stamp event_date = the SPC
    # storm-day D so swaths join cleanly to hail_spc's event_date. See ROOFER_SIGNALS.md.
    if args.no_shift:
        fetch_date = args.event_date
    else:
        fetch_date = (datetime.strptime(args.event_date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
    print(f"  SPC storm-day {args.event_date} -> MRMS file {fetch_date} {args.hhmm}Z (conv-day aligned={'no' if args.no_shift else 'yes'})", file=sys.stderr)

    out_path = Path(args.out) if args.out else Path(f"_tmp_mesh_{args.event_date}.geojson")

    with tempfile.TemporaryDirectory() as td:
        workdir = Path(td)
        grib_path = fetch_grib(fetch_date, args.hhmm, workdir)
        inch, lats, lons, valid_time = load_tx_inches(grib_path)

    print(f"  grid: {inch.shape}, valid_time={valid_time}, TX max={inch.max():.2f}in", file=sys.stderr)
    transform = raster_transform(lats, lons)

    from shapely.geometry import mapping

    features_out = []
    for b in BANDS_IN:
        poly = band_polygons(inch, transform, b)
        if poly is None:
            print(f"  band >={b}in: no coverage", file=sys.stderr)
            continue
        n_parts = len(poly.geoms) if hasattr(poly, "geoms") else 1
        print(f"  band >={b}in: {n_parts} polygon part(s), area~{poly.area:.3f} deg^2", file=sys.stderr)
        features_out.append({
            "type": "Feature",
            "properties": {"min_hail_in": b, "event_date": args.event_date, "valid_time": valid_time},
            "geometry": mapping(poly),
        })

    fc = {"type": "FeatureCollection", "features": features_out}
    out_path.write_text(json.dumps(fc))
    print(f"wrote {out_path} ({len(features_out)} band polygons)", file=sys.stderr)


if __name__ == "__main__":
    main()
