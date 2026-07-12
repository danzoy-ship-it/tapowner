# TapOwner — Build Progress

One line per phase per the working rules in `TAPOWNER_BUILD.md` §10.
Technical decisions get noted here too (Claude Code decides technical, Frederick decides money + business facts).

## Phase log

- **2026-07-12 — Phase 0 — STARTED** — Monorepo scaffolded (mobile/, api/, web/, data/), TypeScript configs, Fastify hello-world with `GET /health`, Expo blank app (TypeScript). Railway deploy pending Frederick's account (costs money — approval gate).
- **2026-07-12 — Phase 0 — infra complete** — API deployed on Railway (`https://api-production-7d11.up.railway.app/health` → 200, 228ms). PostGIS db service live (postgis/postgis:16-3.5, volume attached, extensions loaded, DATABASE_URL wired to api over private network). Acceptance: deployed /health ✅; iPhone Expo Go render pending Frederick's rescan after SDK 54 pin.
- **2026-07-12 — Phase 0 — PASSED ✅** — Both acceptance criteria green: deployed `GET /health` → 200; blank app rendered on Frederick's physical iPhone via Expo Go (SDK 54). Next: Phase 1 (StratMap → PostGIS pipeline).

## Technical decisions

- **2026-07-12 — No npm workspaces.** Each package (`api/`, `mobile/`, `web/`, `data/`) manages its own dependencies. Expo's Metro bundler is friction-prone with hoisted node_modules; workspaces buy nothing at this scale.
- **2026-07-12 — Local Node is v24** (satisfies `engines >=22`). Railway deploy will pin Node 22 per the architecture doc.
- **2026-07-12 — GitHub repo `danzoy-ship-it/tapowner` pre-existed as PUBLIC.** Flagged to Frederick: consider making it private (repo Settings → Change visibility) — the build doc contains the full pricing model and margin math.
- **2026-07-12 — `web/` and `data/` are README placeholders** until their phases (5 and 1 respectively) — Phase 0 scope is API hello-world + Expo blank app only.
- **2026-07-12 — Railway deploys are GitHub-sourced, not CLI-uploaded.** `railway up` from this Windows machine dies instantly on the Metal builder with no logs (twice with Railpack, once with Dockerfile). Connecting the service source to the GitHub repo builds fine — and gives push-to-deploy on `main`. Root `Dockerfile` builds `api/` (context = repo root); when `web/` ships it gets its own service with a root-directory setting.
- **2026-07-12 — db service: `PGDATA=/var/lib/postgresql/data/pgdata`.** Railway volumes mount with `lost+found`, which makes initdb refuse the mount root; pointing PGDATA one level down is the standard fix.
- **2026-07-12 — Expo pinned to SDK 54** (`expo@^54`, RN 0.81.5), matching Expo Go 54.0.2 on Frederick's iPhone (his App Store serves nothing newer). create-expo-app scaffolded SDK 57 → "incompatible version" in Expo Go. Also removed the SDK 57 template's `plugins: ["expo-status-bar"]` from app.json (crashes `expo start` on SDK 54). Revisit SDK upgrade when we move to EAS dev builds (Phase 10) — EAS builds don't depend on Expo Go's supported SDK.
