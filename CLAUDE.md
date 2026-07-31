# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview
HiperRouter (`hiperrouter-app`) — local AI routing gateway + Next.js dashboard. 
- **Gateway**: root `package.json`, runs on port 20128.
- **CLI**: `cli/` (npm: `hiperrouter`), launches the server/tray.

Code: `src/` (Next.js/Dashboard), `open-sse/` (routing engine), `cli/`, `tests/`.

## Commands
```bash
# Dashboard
npm install
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev

# CLI
npm run cli:pack
cd cli && npm run dev

# Tests (run via npx vitest, ignore package.json scripts with Unix paths)
npm install && cd tests && npm install
npx vitest run
npx vitest run unit/capabilities.test.js
```
**Tests note:** Suite is NOT all-green by default (~64 fails expected). Judge regressions using `tests/__baseline__/verify-no-regression.mjs`. Skip `real/*.real.test.js` without credentials.

## Architecture
Read `docs/ARCHITECTURE.md` (system) and `open-sse/AGENTS.md` (engine) first.

### Request Flow
`/api/v1/*` → `src/sse/handlers/chat.js` (entry) → `open-sse/handlers/chatCore.js` (engine) → `open-sse/executors/*` (upstream) → `open-sse/translator/*` (format conversion) → SSE out.

### Persistence
State is SQLite under `src/lib/db/` via adapter chain: `bun:sqlite` → `better-sqlite3` → `node:sqlite` → `sql.js`.
- **New code:** Import from `@/lib/db/index.js`. Repos in `src/lib/db/repos/*`. Migrations in `src/lib/db/migrations/`.
- **Legacy:** `src/lib/localDb.js` is a backward-compat shim.
- **Location:** DB in `DATA_DIR` (via `src/lib/db/paths.js`) or `~/.HiperRouter/`. Logs/usage (`usage.json`, `log.txt`) remain in `~/.HiperRouter`.

## Conventions
- Plain JS (ESM), `@/*` → `src/*`.
- `custom-server.js` hardens IP handling (trusts local proxy only).
- Env vars: `JWT_SECRET`, `INITIAL_PASSWORD` (default 123456), `API_KEY_SECRET`, `MACHINE_ID_SALT`.
- Binary/protobuf upstreams are handled in their own executor, not the translator.
- Root and `cli/` are versioned independently. Commits: Conventional (`fix:`, `feat:`).
