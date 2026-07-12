# TapOwner — Build Progress

One line per phase per the working rules in `TAPOWNER_BUILD.md` §10.
Technical decisions get noted here too (Claude Code decides technical, Frederick decides money + business facts).

## Phase log

- **2026-07-12 — Phase 0 — STARTED** — Monorepo scaffolded (mobile/, api/, web/, data/), TypeScript configs, Fastify hello-world with `GET /health`, Expo blank app (TypeScript). Railway deploy pending Frederick's account (costs money — approval gate).

## Technical decisions

- **2026-07-12 — No npm workspaces.** Each package (`api/`, `mobile/`, `web/`, `data/`) manages its own dependencies. Expo's Metro bundler is friction-prone with hoisted node_modules; workspaces buy nothing at this scale.
- **2026-07-12 — Local Node is v24** (satisfies `engines >=22`). Railway deploy will pin Node 22 per the architecture doc.
- **2026-07-12 — GitHub repo `danzoy-ship-it/tapowner` pre-existed as PUBLIC.** Flagged to Frederick: consider making it private (repo Settings → Change visibility) — the build doc contains the full pricing model and margin math.
- **2026-07-12 — `web/` and `data/` are README placeholders** until their phases (5 and 1 respectively) — Phase 0 scope is API hello-world + Expo blank app only.
