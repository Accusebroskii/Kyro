---
name: DB schema rebuild rule
description: Order of operations when updating lib/db schema in this monorepo
---

After adding or changing any file in `lib/db/src/schema/`, TypeScript declarations for the lib must be rebuilt before leaf packages can see the new exports.

**Rule:** Run `pnpm run typecheck:libs` before `pnpm --filter @workspace/api-server run typecheck`.

**Why:** `lib/db` is a composite lib package — its `.d.ts` declarations are emitted by `tsc --build`. If they're stale, the api-server gets "Module '@workspace/db' has no exported member 'X'" even though the source file exists.

**How to apply:** Any time you get TS2305 "no exported member" errors from `@workspace/db` or other `lib/*` packages, run `pnpm run typecheck:libs` first.
