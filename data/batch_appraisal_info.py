"""Batch-apply the sale-date + exemptions capture across every cached PACS roll
that carries an APPRAISAL_INFO.TXT. Resumable (skips counties already loaded),
error-tolerant (one county's roll-mismatch/abort doesn't stop the batch).

Usage: DATABASE_URL=... python batch_appraisal_info.py [--dry-run]
"""
import os
import subprocess
import sys

import psycopg2

HERE = os.path.dirname(__file__)
ROLLS = os.path.join(HERE, "downloads", "rolls")

# fips -> roll zip (one per county; dups like roll_48005 == angelina_2025 deduped).
COUNTIES = {
    "48003": "roll_48003.zip", "48005": "angelina_2025.zip",
    "48021": "Bastrop_2025_DataExport.zip", "48055": "caldwell_2025.zip",
    "48061": "Cameron_2026_v2.zip", "48093": "roll_48093.zip",
    "48099": "coryell_2025.zip", "48119": "delta_test.zip",
    "48127": "roll_48127.zip", "48165": "roll_48165.zip",
    "48171": "gillespie_2025.zip", "48183": "GCAD_Export.zip",
    "48187": "Guadalupe_2025_SUPP0.zip", "48219": "roll_48219.zip",
    "48229": "roll_48229.zip", "48267": "roll_48267.zip",
    "48277": "lamar_openrecords.zip", "48285": "lavaca_2025.zip",
    "48335": "mitchell_test.zip", "48351": "newton_test.zip",
    "48355": "Nueces_2025_Certified.zip", "48373": "polk_2025.zip",
    "48375": "Potter_2025_PRAD.zip", "48381": "Randall_2025_PRAD.zip",
    "48397": "Rockwall_2025_PACS_Roll.zip", "48449": "titus_2025.zip",
    "48477": "roll_48477.zip", "48493": "Wilson_2024_APPR_ROLL.zip",
    "48501": "roll_48501.zip",
}


def already_loaded(fips):
    try:
        c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20,
                             keepalives=1, keepalives_idle=30)
        cur = c.cursor()
        cur.execute("SELECT count(*) FROM parcels WHERE county_fips=%s "
                    "AND (exemptions IS NOT NULL OR last_sale_date IS NOT NULL)", (fips,))
        n = cur.fetchone()[0]
        c.close()
        return n > 0
    except Exception as e:
        print(f"  {fips} skip-check failed ({e}); will attempt load", flush=True)
        return False


def main():
    dry = "--dry-run" in sys.argv
    loaded, skipped, failed = [], [], []
    for fips, zipname in COUNTIES.items():
        path = os.path.join(ROLLS, zipname)
        if not os.path.exists(path):
            print(f"== {fips}: {zipname} MISSING, skip", flush=True)
            failed.append((fips, "missing"))
            continue
        if not dry and already_loaded(fips):
            print(f"== {fips}: already loaded, skip", flush=True)
            skipped.append(fips)
            continue
        print(f"\n===== {fips}  {zipname} =====", flush=True)
        cmd = [sys.executable, "-u", os.path.join(HERE, "load_pacs_appraisal_info.py"),
               fips, path] + (["--dry-run"] if dry else [])
        try:
            r = subprocess.run(cmd, timeout=480)
            (loaded if r.returncode == 0 else failed).append(
                fips if r.returncode == 0 else (fips, f"rc={r.returncode}"))
        except subprocess.TimeoutExpired:
            print(f"  {fips} TIMEOUT (>480s), moving on", flush=True)
            failed.append((fips, "timeout"))
    print(f"\n==== BATCH DONE: loaded {len(loaded)}, skipped {len(skipped)}, "
          f"failed {len(failed)} ====", flush=True)
    print("loaded:", loaded)
    print("skipped:", skipped)
    print("failed:", failed)


if __name__ == "__main__":
    main()
