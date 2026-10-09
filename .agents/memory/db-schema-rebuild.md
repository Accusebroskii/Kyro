---
name: DB schema rebuild rule
description: Order of operations when updating lib/db schema in this monorepo
---

After adding or changing any file in `lib/db/src/schema/`, rebuild the root TypeScript project references before checking leaf packages. This workspace does not define the previously used `typecheck:libs` script.

**Rule:** Run `pnpm exec tsc --build` before `pnpm --filter @workspace/api-server run typecheck`.

**Why:** `lib/db` is a composite lib package whose declarations are emitted by TypeScript project builds. Stale declarations make the API package report missing database exports even when the schema source is correct.

**How to apply:** After changing a referenced `lib/*` package, run the root project build before leaf typechecks; if no root helper script exists, use `pnpm exec tsc --build`.
