"""Generate the per-county lookup table for texas_county_system_map.md.
Pulls authoritative stats from the live DB; overlays vendor/recipe notes hand-
curated from the session's chronological log (only where actually documented —
left blank rather than guessed where not)."""
import json
import os
import sys
import psycopg2

# fips -> (vendor short-tag, note). Curated from this session's full log.
NOTES = {
"48201":("PACS/HCAD","download.hcad.org CAMA fixtures.txt (beds/baths)"),
"48453":("PACS/TP data-lane","traviscad.org /publicinformation improvement_detail_2026.zip; coded rows 252=beds/251=baths"),
"48439":("TP static bulk","tad.org/content/data-download (703MB); BEDS CONFIRMED UNAVAILABLE — TAD withholds counts in every file, records-request won't help"),
"48029":("PACS→SARA GIS","SARA BCAD_Parcels_PROD FeatureServer"),
"48113":("PACS/TrueAutomation","DCAD RES_ADDL + RES_DETAIL.CSV bulk beds"),
"48141":("PACS/EPCAD",""),
"48085":("PACS/MDB","Collin MDB has beds/baths/pool; improvements text-array empty (already mined via structured cols)"),
"48157":("Orion","thin — Property/Owner/Exemption/Entity only, no improvement/segment file; LOW yield, sqft only"),
"48121":("PACS/open-Apache-dir","dentoncad.net/data/_uploaded/.../datafiles/ FULL: improv 311K beds 265K sqft 314K sale 338K exempt 220K"),
"48215":("HCAD shapefile mdb","hidalgoad.org data-downloads; PARTIAL (sqft/year/sale/exempt, no segments/beds). TP export confirmed absent (136 reports, all PDF)"),
"48491":("Socrata (WCAD)","data.wcad.org Segment+PropChar feeds; FULL improv+sale"),
"48339":("PACS/Google-Drive","mcad-tx.org/appraisal-data-exports TP-CMS; improv 239K sale 291K exempt 174K baths 215K(3.94); beds ABSENT (ATTR name-only, no count)"),
"48039":("PACS/pcloud","brazoriacad.org pcloud publink; improv 170K sale 216K exempt 109K; beds ABSENT (ATTR has no bedroom attr)"),
"48167":("PACS","galvestoncad.org wp-content zip; improv 147K sale 162K exempt 85K"),
"48061":("appraisal_info dash-fix","deed_dt dashed MM-DD-YYYY; sale 175K exempt 71K"),
"48027":("PACS","Bell certified roll ATTR"),
"48423":("GSA gsacorp.io — RECORDS-REQUEST","CAMA session/POST-export gated (no static file); partial deed via Tax_Parcels_Improvements FS (+221, ~12% condo-subset). Ask GSA cert-roll, (903) 510-8600"),
"48303":("BIS/Orion direct","gis.lubbockcad.org MapServer/129 FULL: sqft 106K year 108K sale 129K. No beds (Rec4/5 export discontinued ~2015)"),
"48209":("Orion","thin, like Fort Bend — no improvement/segment file"),
"48309":("PACS/deflate64 Wayback","mclennancad.org 2022 export via Shell-COM extract; improv 89K sale 97K exempt 48K baths 75K(1.83, numbered attrs)"),
"48213":("BIS FS direct","services7.arcgis.com/4x7oelC9W8TNucjG/HendersonCADWebService; sale 26K only"),
"48091":("BIS FS direct","services7.arcgis.com/Yz6eib2o8WvEgWq8/ComalCADWebService; sale 98K only"),
"48251":("PACS .tab custom","johnsoncad.com WEBIMPR.CSV; GSA-lever reference county for Smith"),
"48367":("BIS FS","services.arcgis.com/79g1H99xInKSRRK3; sale 92,836 only, deed-only no sqft"),
"48257":("PACS","kaufman-cad.org; improv 74K sale 87K exempt 47K baths(1.90)"),
"48183":("PACS — KEY MISMATCH","GCAD_Export prop_id space ≠ DB source_property_id; unresolved, needs geo_id crosswalk"),
"48135":("GSA xlsx","load_gsa_roll_xlsx.py; sqft 58K sale 52K exempt 32K improv 15K(feature types)"),
"48329":("P&A export_web","load_pa_export.py webbld/websale/webprop"),
"48231":("BIS FS direct","services3.arcgis.com/GIIiqmeq0npieHV9/HuntCADWebService; sale 62K year 48K. Full CAMA is SharePoint-login-gated — records-request"),
"48005":("PACS","'Plumbing'=fixture counts → baths guarded off"),
"48485":("PACS","wadtx.com; improv 47K BEDS 40K sale 56K exempt 26K baths(1.65)"),
"48451":("BIS FS","services5.arcgis.com/3KYdtBnAMnav1mt9; sale 57,764 only"),
"48037":("Drive ownership.csv","year 19K sale 27K homestead 22K (derived HS values>0)"),
"48397":("appraisal_info dash-fix","sale 51K exempt 33K"),
"48409":("PACS","sanpatcad.org; improv 33K sale 29K exempt 18K; beds ABSENT"),
"48203":("TP-token FULL PACS","RAW token, 'DATA EXPORTS' category; improv 29K exempt 17K; beds ABSENT(material-code ATTR); sale sparse (9814-wide INFO offset issue)"),
"48053":("BIS FS","sale 46K year 25K"),
"48347":("PACS abbreviated","nacocad.org (NOT nacogdochescad.org), INFO-only; sale 8K exempt 18K"),
"48073":("BIS FS","sale 42K year 16K"),
"48349":("P&A ArcGIS (pandai)","value+Is_Exempt+deed-vol/page; MARGINAL, not loaded (exempt flag not code-mappable)"),
"48499":("PACS","woodcad.net; improv 24K sale 39K exempt 14K; baths fixture-only dropped"),
"48325":("BIS FS","sale 39K year 25K (needs Referer)"),
"48467":("BIS FS","sale 41K"),
"48001":("TP — RECORDS-REQUEST","reports all-PDF, bulk API 401; advancedsearch gives owner/value/legal only (not loaded, no signal fields)"),
"48199":("PACS","hardin-cad.org; improv 22K exempt 16K baths(1.37); beds negligible (367 rows)"),
"48217":("GIS DBF (Parcels_export.dbf)","sale 13K + SALE PRICE 12,774 (sl_price!) + year — the ONLY county with real sale prices"),
"48299":("BIS AGOL","services.arcgis.com/3fXpNNO2cx0O3RtY; sale 34K year 18K"),
"48363":("RECORDS-REQUEST (confirmed 07-16)","SWData 403 on every host; StratMap YEAR_BUILT empty; exhaustive crawl found no bulk"),
"48427":("GIS DBF (Ownership.dbf, 2021)","sale 22K"),
"48401":("Harris-eSearch — PARTIAL","site IP-locked (UserLockedOut); loaded 3,303 exempt via Wayback-truncated CSV (86% verified join); retry live URL later for ~25K more rows"),
"48071":("Harris-eSearch","chamberscad.org; exempt 14K"),
"48321":("GIS DBF (2024-GIS-DATA.zip)","sale 30K; the certified roll itself is PDF-only"),
"48241":("PACS (misnamed zip)","2020 vintage; improv 15K sale 14K exempt 8K"),
"48013":("BIS FS","sale 26K year 21K"),
"48277":("PACS-portal","AG bare code 7,847 rows; GIS-only per crawl, unresolved"),
"48471":("dead-end","notice PDFs only, unresolved"),
"48067":("BIS FS","sale 27K year 16K"),
"48097":("TP-token FULL PACS","improv 21K sale 29K exempt 11K BEDS 16K baths(1.75)"),
"48457":("PACS/esearch","has improvements internally; export is records-request only (PIA target)"),
"48171":("PACS","'Plumbing'=presence flag, baths guarded off"),
"48481":("RECORDS-REQUEST ($40 CD)","979-532-8931; BIS FS found but Deed_Date/Vol/Page 100% EMPTY — not loaded (no usable fields)"),
"48465":("PACS (Google Drive)","valverdecad.org TP-CMS; improv 19K sale 29K exempt 10K"),
"48049":("PACS","brown-cad.org (hyphen); improv 21K sale 26K exempt 10K beds 4.6K baths(1.53)"),
"48459":("BIS FS","sale 22K year 15K"),
"48259":("BIS FS","sale 27K year 19K"),
"48147":("BIS FS","needs Referer; sale 27K year 16K"),
"48493":("PACS","wilson-cad.org 2024 (NOT wilsoncad.org); improv 20K sale 24K exempt 13K baths(1.82)"),
"48249":("TP per-property — DEFERRED","searchfulltext+/improvement exists but is per-parcel (mass-harvest vetoed)"),
"48253":("Harris-eSearch","jonescad.org; exempt 4,925"),
"48185":("dead-end (print report)","96MB fixed-width PRINT roll, painful to parse; effectively records-request"),
"48289":("Harris-eSearch","leoncad.org; exempt 4,233"),
"48051":("BIS eSearch per-property — DEFERRED","GetImprovements?propertyId= is per-parcel (mass-harvest vetoed)"),
"48007":("PACS","improv 16.2K beds 7.6K sale 22.7K"),
"48225":("Harris-eSearch","exemptions loaded"),
"48323":("TP per-property — DEFERRED","improvement endpoint returns EMPTY (district config hides segments)"),
"48455":("PACS","trinitycad.net; 8.0K improv sale 14.3K"),
"48223":("RECORDS-REQUEST (confirmed 07-16)","SDS SignalR-only, no COLLECTORS.zip on any host — exhaustive crawl found nothing free"),
"48337":("RECORDS-REQUEST (confirmed 07-16)","SDS Blazor SignalR-only ('MORE' dropdown opened & checked); free PDF exemption-list fallback only"),
"48143":("BIS FS oversized — DEFERRED","123K rows for 24K parcels, fetch times out; needs where-filter tuning. Domain erath-cad.com"),
"48161":("Harris-eSearch","exemptions loaded"),
"48229":("PACS — STALE","newest export is 2021"),
"48149":("GIS DBF (Ownership.dbf)","sqft 13K sale 20K exempt 6.7K"),
"48477":("PACS",""),
"48403":("SWData COLLECTORS export","load_swdata_collectors.py; sale 20,774 exempt 4,212"),
"48089":("BIS FS","sale 17K"),
"48057":("BIS FS (geo join)","sale 20K"),
"48015":("BIS FS","sale 22K year 14K"),
"48293":("TP-token FULL PACS","improv 12K sale 19K exempt 5K baths(1.56)"),
"48419":("Wix static — dead end",""),
"48331":("PACS","12.8K improv sale 17.4K"),
"48227":("BIS FS","sale 3,335 (low); publishes only collector tax-roll CSVs for improvements — PIA. 2022 SWData COLLECTORS_Agent.zip exists, not yet loaded"),
"48043":("PACS (nested zip)","brewstercotad.org (NOT brewstercad); improv 5K sale 17K"),
"48035":("BIS FS","sale 19,537"),
"48189":("BIS FS (geo join)","sale 14K year 7.9K"),
"48145":("BIS FS","fallscad.NET; sale 9,920 year 2,793"),
"48239":("BIS FS (geo join)","sale 15K"),
"48377":("BIS FS","sale 15,633 year 3,897"),
"48395":("BIS FS (geo join)","sale 9,079"),
"48281":("PACS-portal — PIA target","unresolved"),
"48503":("BIS FS","sale 13,053 year 9,452"),
"48179":("BIS FS","sale 13,246 year 10,525"),
"48287":("BIS FS","sale 13,704 year 8,610"),
"48399":("SWData ArcGIS (obfuscated cols) — DEFERRED","needs bespoke field-map loader"),
"48389":("TP-token raw FULL PACS","sparse desert county; improv 5.2K sqft 5.2K"),
"48131":("BIS FS","sale 9,736 year 552"),
"48371":("Harris-eSearch","pecoscad.org; exempt 2,741"),
"48031":("BIS FS","sale 11,766"),
"48193":("BIS FS (geo join)","sale 11,984 year 6,467"),
"48489":("BIS FS","sale 8,749"),
"48279":("BIS FS","sale 11,390"),
"48415":("PACS","scurrytex.com; improv 7,806 beds 3,031 sale 11,107 exempt 3,702"),
"48387":("RECORDS-REQUEST (confirmed 07-16)","BIS + P&A layers exist but Deed_Date/market are 100% EMPTY on every row"),
"48153":("RECORDS-REQUEST (confirmed 07-16)","SWData 403, no COLLECTORS.zip; per-property webProperty.aspx exists but is vetoed"),
"48083":("Harris-eSearch","colemancad.net; exempt 2,287"),
"48429":("BIS FS (public, no Referer)","sale 10,681"),
"48505":("BIS FS","sale 8,705 year 6,131"),
"48379":("BIS FS","sale 10,722 year 6,745"),
"48341":("BIS FS","sale 10,284 year 4,304"),
"48059":("BIS FS","sale 10,648; tax-roll books only for improvements — PIA"),
"48487":("BIS FS + Harris-eSearch (double)","wilbargerappraisal.org (NOT wilbargercad); sale 7,853 year 5,281 exempt 2,665"),
"48343":("Harris-eSearch","morriscad.com; exempt 3,275"),
"48063":("BIS FS (geo join)","sale 10,113 year 5,702"),
"48295":("RECORDS-REQUEST (confirmed 07-16)","SWData 403, no COLLECTORS.zip on any host"),
"48117":("BIS FS","sale 9,151 year 3,049"),
"48307":("Harris-eSearch","mccullochcad.org; exempt 1,869"),
"48003":("PACS (deflate64)","sale 8.5K exempt 3.9K improv 7.2K"),
"48283":("TP-token FULL PACS","officelookup www.lasallecad.com; improv 3,384 sale 6,102 exempt 792"),
"48175":("RECORDS-REQUEST (confirmed 07-16)","eSearch PDF-only; BIS GoliadCADWebService exists but subscription DISABLED — re-check monthly, instant solve if renewed"),
"48313":("BIS FS","sale 8,991 year 3,908"),
"48137":("BIS FS","f3531c87ca084095b1b1b81c840b6a57; sale 8,000 year 3,791"),
"48507":("BIS FS","sale 7,254 year 4,078"),
"48267":("PACS",""),
"48345":("RECORDS-REQUEST","no own domain, Floyd-administered; SWData per-property only"),
"48445":("BIS FS (geo join)","terrycoad.org; sale 6,910"),
"48319":("BIS FS","sale 1,694 (thin)"),
"48333":("BIS FS","sale 8,585"),
"48335":("PACS","sparse beds/baths"),
"48385":("BIS FS","sale 6,856 year 436"),
"48095":("BIS FS","sale 7,765"),
"48501":("PACS (deflate64)","sale 4.3K exempt 1.6K improv 3.6K"),
"48495":("RECORDS-REQUEST (confirmed 07-16)","P&A Is_Exempt=entity-only (not homestead); Improvements layer=60 GPS points"),
"48425":("TrueAutomation PropAccess","dead end, main site parked/spammy"),
"48107":("Harris-eSearch","crosbycentral.org (real domain — overturned earlier dead-end); exempt 1,092"),
"48437":("BIS FS (geo pattern)","sale 5,618 year 2,283"),
"48369":("BIS FS (geo join)","sale 4,240 year 2,410"),
"48169":("BIS FS","sale 4,309 year 1,114; also a 2019 P&A DW export exists, unparsed (low marginal value)"),
"48413":("BIS FS","sale 4,957 year 1,882"),
"48069":("BIS FS + Harris-eSearch (double)","castrocad.org; sale 3,596 year 601 exempt 1,491"),
"48119":("PACS","dwelling cd bare 'RES'"),
"48275":("BIS FS","knoxcad.com (real domain); sale 5,097"),
"48023":("StratMap-only — no signal","BIS app SB_0005 'Subscription disabled', re-check monthly"),
"48111":("BIS FS","sale 5,388 year 1,130"),
"48017":("BIS FS","bailey-cad.org (real domain); sale 4,594 year 905"),
"48435":("BIS FS (geo join)","sale 4,839"),
"48047":("BIS FS — skipped","Deed_Date field 100% EMPTY, no signal loaded"),
"48079":("BIS FS","cochrancad.com (real domain); sale 3,549 year 255"),
"48205":("BIS FS","sale 5,502"),
"48443":("BIS FS","sale 3,436"),
"48417":("hard case — deferred","only a formatted PRINT report, not machine-parseable"),
"48311":("BIS FS (geo join)","sale 1,983"),
"48359":("BIS FS (geo join)","sale 3,583"),
"48393":("StratMap-only — no signal","Prop_ID mostly blank"),
"48261":("PACS","kenedycad.org preliminary roll; improv 185 beds 10 sale 249 exempt 43"),
}

c = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=20)
cur = c.cursor()
cur.execute("""SELECT county_fips, count(*) tot,
       count(*) FILTER (WHERE improvements IS NOT NULL) improv,
       count(*) FILTER (WHERE living_area_sqft IS NOT NULL) sqft,
       count(*) FILTER (WHERE bedrooms IS NOT NULL) beds,
       count(*) FILTER (WHERE last_sale_date IS NOT NULL) sale,
       count(*) FILTER (WHERE array_length(exemptions,1)>0) ex,
       count(*) FILTER (WHERE last_sale_price IS NOT NULL) price
   FROM parcels GROUP BY county_fips""")
rows = {r[0]: r[1:] for r in cur.fetchall()}
c.close()

names = json.load(open(os.path.join(os.path.dirname(__file__), "counties_2025.json")))
name_by_fips = {n["fips"]: n["name"].title() for n in names}
if "48301" not in name_by_fips:
    name_by_fips["48301"] = "Loving"

def pct(n, d):
    return round(100 * n / d) if d else 0

out_rows = []
for fips, tot_row in rows.items():
    tot, improv, sqft, beds, sale, ex, price = tot_row
    if tot == 0:
        continue
    if improv >= 0.25 * tot or beds >= 0.15 * tot:
        status = "MINED"
    elif sale > 0 or ex > 0 or sqft > 0:
        status = "SIGNAL"
    else:
        status = "GEOM-ONLY"
    vendor, note = NOTES.get(fips, ("", ""))
    if fips not in NOTES and "RECORDS-REQUEST" not in vendor and status == "GEOM-ONLY":
        vendor = vendor or ""
    out_rows.append((name_by_fips.get(fips, fips), fips, tot, status, pct(improv, tot), pct(beds, tot),
                     pct(sale, tot), pct(ex, tot), price, vendor, note))

out_rows.sort(key=lambda r: -r[2])

lines = []
lines.append("| County | FIPS | Parcels | Status | Improv% | Beds% | Sale% | Exempt% | Price | Vendor / Access | Notes |")
lines.append("|---|---|---:|---|---:|---:|---:|---:|---:|---|---|")
for name, fips, tot, status, ip, bp, sp, ep, price, vendor, note in out_rows:
    price_s = f"{price:,}" if price else "—"
    lines.append(f"| {name} | {fips} | {tot:,} | {status} | {ip} | {bp} | {sp} | {ep} | {price_s} | {vendor} | {note} |")

print(f"{len(out_rows)} rows, {sum(1 for r in out_rows if r[9] or r[10])} with notes", file=sys.stderr)
print("\n".join(lines))
