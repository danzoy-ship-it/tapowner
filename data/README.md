# data/

TxGIO StratMap Land Parcels ingestion scripts (statewide Texas → PostGIS
`parcels` table, full CAD property record, per-county `cad_field_map`).

**Built at Phase 1.** Loader must be idempotent and re-runnable per county.
Raw downloads go in `data/downloads/` (gitignored — they're gigabytes).
