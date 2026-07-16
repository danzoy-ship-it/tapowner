# Public Information Act requests — the gated counties

These 12 counties have real appraisal data (improvement detail / sale dates / exemptions) that is **NOT posted for free download** anywhere — confirmed after multiple exhaustive crack passes (2026-07-16). The only way to get their data is a **Texas Public Information Act (PIA)** request to the appraisal district. This is the checklist to knock them out one by one.

## How this works (Texas PIA basics)
- The request must be **in writing** (email is fine). The CAD must respond within **10 business days**.
- **Ask for electronic delivery** (email / download link / FTP) — that keeps the cost at ~$0. Printed copies or a mailed CD can incur a small fee (Wharton, for example, quotes **$40 for a CD** — ask for email/download instead).
- You do **not** have to explain why you want it. You just need to give them a way to send it back (your email).
- If they quote a fee over ~$40, ask for the cost estimate first before they proceed (your right under §552.2615).

## The email to send (copy/paste, then drop in the county-specific line)

> **To:** [the CAD email in the table below]
> **Subject:** Public Information Act request — electronic appraisal data export
>
> To the Chief Appraiser / Public Information Officer,
>
> Under the Texas Public Information Act (Government Code Ch. 552), I request a copy of the district's most recent certified appraisal roll in your standard **electronic export format**, including the **improvement / building detail** files. Specifically, I'm requesting the data that contains, per property: improvement square footage, year built, improvement/segment type descriptions, bedroom/bathroom counts where recorded, deed/sale dates, and exemption codes (homestead, over-65, disabled, disabled-veteran, ag).
>
> **[COUNTY-SPECIFIC LINE — see table]**
>
> To minimize cost, please deliver this **electronically** (email, download link, or FTP) rather than as printed copies or a mailed CD. If any charge applies, please send me the estimated cost before proceeding. If the full export isn't readily available, I'll take whichever standard export file your appraisal software produces that contains the improvement detail and sale/exemption fields.
>
> Thank you,
> Frederick Danzo
> fred@salasers.com   ·   [your phone]

*(Adjust the signature as you like — a Texas PIA just needs a reply-to.)*

## The list — send one per county

| ☐ | County | Email | Phone | Contact page | Vendor | County-specific line to add |
|---|--------|-------|-------|--------------|--------|------------------------------|
| ☐ | **Smith** (48423) | (use contact form) | (903) 510-8600 | https://smithcad.org/ → Contact | GSA Corp | "Please include the GSA certified data-roll export with the improvement-detail/segment file — the same electronic appraisal export GSA Corp produces for other districts (e.g., Ector CAD)." |
| ☐ | **Anderson** (48001) | bthomas@andersoncad.net; sguillen@andersoncad.net | — | https://www.andersoncad.net/ → Contact | True Prodigy | "Please include your True Prodigy 'Appraisal Export' data files (APPRAISAL_INFO + APPRAISAL_IMPROVEMENT_DETAIL + _ATTR + LAND_DETAIL)." |
| ☐ | **Wharton** (48481) | (use contact form) | 979-532-8931 | https://www.whartoncad.net/ → Contact | True Prodigy | "Please include the IMPROVEMENT_DETAIL and IMPROVEMENT_DETAIL_ATTR files (sqft, year built, segments), not just the totals. Electronic delivery preferred over the $40 CD." |
| ☐ | **Goliad** (48175) | (use contact form) | 361-645-3354 | https://www.goliadcad.org/ → Contact | Harris/BIS | "Alternatively, if it's easier: please re-enable public access to your BIS 'GoliadCADWebService' GIS layer, or send the certified appraisal roll export with improvement detail." |
| ☐ | **Red River** (48387) | (use contact form) | — | https://www.redrivercad.org/ → Contact | CAGI | "Your public GIS shows deed date, market value and improvement value fields but they're blank — please send the export where those are populated, plus the improvement (sqft/year) file." |
| ☐ | **Winkler** (48495) | (use contact form) | — | https://www.winklercad.org/ → Contact | Harris/P&A | "Please include the improvement file (sqft, year built), deed/sale dates, and exemption codes — the appraisal export, not the reappraisal-plan PDFs." |
| ☐ | **Palo Pinto** (48363) | ppad@palopintocad.org | 940-659-1281 | (email directly) · P.O. Box 250, Palo Pinto | SWData | "Please include your appraisal-roll export / 'webbld' improvement data file (property, improvement w/ sqft + year built, land, deed/sale, exemptions)." |
| ☐ | **Floyd** (48153) | FLOYDCAD@SUDDENLINKMAIL.COM | 806-983-5256 | (email directly) · P.O. Box 249, Floydada | SWData | "Please include your appraisal-roll export / 'webbld' improvement data file (sqft, year built, deed/sale, exemptions)." |
| ☐ | **Lipscomb** (48295) | LCAD@AMAONLINE.COM | (806) 624-2881 | (email directly) · P.O. Box 128, Lipscomb | SWData | "Please include your appraisal-roll export / 'webbld' improvement data file (sqft, year built, deed/sale, exemptions)." |
| ☐ | **Motley** (48345) | FLOYDCAD@SUDDENLINKMAIL.COM | 806-983-5256 | (email directly — Motley is administered by Floyd CAD) | SWData | "This is for **Motley County (MOTLEYCAD)** — please include the appraisal-roll export / improvement data file (sqft, year built, deed/sale, exemptions)." |
| ☐ | **Hopkins** (48223) | HELP@HOPKINSCAD.COM | (903) 885-2173 | (email directly) · 858 Gilmer St, Sulphur Springs | SWData | "Please include your appraisal-roll export / 'webbld' improvement data file (sqft, year built, deed/sale, exemptions)." |
| ☐ | **Montague** (48337) | (use contact form) | — | https://www.montaguecad.net/ → Contact | Pritchard & Abbott | "Please include the Pritchard & Abbott export with the columns present in your GIS database but not public: **Total_Sqft, Adjusted_Price (sale price)**, Deed_Volume/Page, and exemption/homestead fields, plus year built." |

## Notes
- **Emails marked "(use contact form)"**: these CADs run JavaScript sites that hide the address — grab the real email from their Contact page (linked), or just call the phone number and ask where to send a written PIA request.
- **Anderson's two emails** are staff addresses that appeared as report authors — if they bounce, use the site contact form.
- **Montague is the standout** — its P&A system actually stores a **sale-price** column (`Adjusted_Price`), which is rare in non-disclosure Texas. Worth prioritizing.

## Do NOT bother requesting (a PIA won't help)
- **Tarrant beds, and Montgomery / Brazoria / Ellis / Webb / Harrison beds** — these districts **do not record bedroom counts at all** (verified: the count columns exist in their files but are 100% blank by policy). A records request can't produce data the district never collected. We already have everything else for these counties.
- **Lubbock** — already fully loaded (sqft/year/sale from its public GIS). No request needed.

## Optional / lower priority
- **Hidalgo** (48215) — already has sqft + deed dates + exemptions loaded; a PIA would only add the improvement *segment* detail (pool/garage/beds). Same True Prodigy "Appraisal Export" ask as Anderson/Wharton, to `cs@hidalgoad.org`, if you want the extra markers on a big (328K-parcel) county.

---

# BUILDING-DATA GAPS — "blind" counties (year_built / sqft / beds all missing)

A 2026-07-16 field-completeness audit found **107 counties with ZERO building data** (parcels loaded, but no year_built/sqft/beds). Live re-crack verified: **only 1 (Shelby) had a free source** (now recovered) — the rest gate their CAMA/improvement file behind a records request. These block the roof-age scheme and the property cards. **The shared ask for all of them:**

> *"Please provide your appraisal software's improvement/CAMA export — the PACS `APPRAISAL_IMPROVEMENT_DETAIL` + `IMPROVEMENT_DETAIL_ATTR` files (or your vendor's equivalent), which include **year built, living-area sqft, and bedroom/bath counts**. Your public GIS/roll export currently carries only owner/value/legal/exemption, not building characteristics. Electronic delivery (CSV/zip) preferred. Many Texas CADs publish this file set for free; requesting it under the Public Information Act."*

**Priority tier — the 30 biggest blind counties (~1.2M parcels; worth an individual PIA):**

| County | FIPS | ~Parcels | Vendor | Contact |
|---|---|---|---|---|
| Henderson | 48213 | 106,708 | BIS | henderson-cad.org contact form (ask for the "Data Roll" export per their fee schedule) |
| Parker | 48367 | 100,548 | SWData | parkercad@parkercad.org · 817-596-0077 |
| Tom Green | 48451 | 58,686 | SWData | 325-658-5575 (get PIA email off contact page) |
| Liberty*| 48291 | 54,549 | PACS | *free roll recovered (roof/eff-yr) — verify year_built coverage |
| Nacogdoches | 48347 | 48,003 | PACS legacy | hello@nacocad.org · 936-560-3447 (ask for the missing IMPROVEMENT_INFO + _ATTR files) |
| Van Zandt | 48467 | 43,963 | BIS | support@vzcad.org · 903-567-6171 |
| Rusk | 48401 | 37,967 | Harris Govern | wcook@ruskcad.org · 903-657-3578 |
| Chambers | 48071 | 37,510 | Harris Govern | info@chamberscad.org · 409-267-3795 |
| Matagorda | 48321 | 37,211 | (GIS+PDF only) | 979-244-2031 · matagorda-cad.org/contact-form |
| Jim Wells | 48249 | 27,944 | True Prodigy | administration@jimwellscad.org · 361-668-9656 |
| Jones | 48253 | 27,732 | Pritchard & Abbott | jonescad.org/home/DataRecords contact |
| Leon | 48289 | 27,570 | Pritchard & Abbott | leoncad.org contact |
| Houston | 48225 | 26,611 | Harris Govern/P&A | houstoncad.org contact |
| Maverick | 48323 | 26,048 | True Prodigy | (site contact) — TP "Appraisal Export" ask |
| Hopkins | 48223 | 25,149 | SWData | *already queued above* |
| Montague | 48337 | 24,836 | Pritchard & Abbott | *already queued above* |
| Erath | 48143 | 24,656 | BIS + SWData | (ask for the export behind webProperty.aspx Improvements) |
| Freestone | 48161 | 23,979 | Pritchard & Abbott | fcad contact (note: beds not recorded; ask year/sqft) |
| Colorado | 48089 | 22,756 | BIS | (colorado cad contact) |
| Calhoun | 48057 | 22,678 | BIS | (calhoun cad contact) |
| Eastland | 48133 | 21,448 | P&A/Harris Govern | eastland cad contact |
| Shelby*| 48419 | 21,378 | PACS | *RECOVERED FREE — year_built + roof + eff-yr loaded* |
| Bosque | 48035 | 19,975 | BIS | feedback@BosqueCAD.com |
| Jackson | 48239 | 18,453 | BIS | info@jacksoncad.org · 361-782-7115 |
| Robertson | 48395 | 16,935 | BIS | rcad@robertsoncad.com · 979-828-5800 |
| Kleberg | 48273 | 14,909 | BIS | 361-595-5775 |
| DeWitt | 48123 | 20,802 | Harris Govern | information@dewittcad.org · 361-275-5753 |
| Gonzales | 48177 | 20,420 | Harris Govern | gonzcad@gvec.net · 830-672-2879 |
| Hutchinson | 48233 | 18,938 | Harris Govern | hcad@hutchinsoncad.com · 806-274-2294 |
| Panola | 48365 | 18,812 | Harris Govern | dmcphail@panolacad.org · 903-693-2891 |
| Ward | 48475 | 15,174 | Harris Govern | wardcad@wardcadtx.org · 432-943-3224 |
| Pecos | 48371 | 14,720 | Harris Govern | scalderon@pecoscad.org · 432-336-7587 |
| Runnels | 48399 | 15,008 | SWData/ISW | support@runnelscad.org · 325-365-3583 |

**Long tail — ~70 rural counties (<15K parcels each, ~560K total):** all confirmed gated (P&A "Accounts"/BIS value-roll/Harris-Govern exemption-CSV variants that structurally lack year_built). Individual PIAs here are impractical; **these are the strongest case for licensed data (EagleView roof-age imagery / ATTOM property backbone)** rather than 70 separate requests. Full list in `PERMIT_COVERAGE.md`-adjacent audit + `data/texas_county_system_map.md`.
