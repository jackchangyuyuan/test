# OpenCord — architecture guide

Authoritative source for architectural decisions. If code and this file disagree, treat that as a bug in one of them — don't silently pick a side. Update this file in the same commit that changes a decision recorded here.

## What this is

A Discord-style chat app (servers → channels → messages, real-time delivery) built as a focused portfolio project. Optimize for a small, coherent, well-tested codebase over production-scale concerns (sharding, multi-region, admin tooling, moderation). When a decision could go either way, prefer the simpler one — this project would rather be finished and clean than exhaustive.

## Workspace layout

npm workspaces, not Nx/Turborepo — the build graph is too small to need a task orchestrator.

- `apps/api` — Express 5 + Drizzle/Postgres + Better Auth + Socket.IO, one process.
- `apps/web` — React 19 + Vite + Tailwind v4.
- `e2e` — Playwright, black-box against the running stack.
- `packages/` does not exist yet. Create `packages/shared` only when `apps/web` needs to consume an API contract (e.g. the first TanStack Query hook needs the Zod schemas that already live in `apps/api/src/routes/*`). Don't create it speculatively — an earlier version of this repo had an empty `packages/shared` stub for a long time and it was removed for exactly that reason.

## Same-origin, always

The dev Vite proxy (`apps/web/vite.config.ts`) forwards `/api` and `/socket.io` to the API so the browser only ever talks to one origin. This is a permanent decision, not a temporary dev convenience: **production also serves the built web app from the same Express process that serves the API** (static files + `/api` + Socket.IO, one process, one origin). Consequences that follow from this:

- No CORS middleware anywhere, ever. If you find yourself reaching for `cors`, the same-origin setup broke — fix that instead.
- No Nginx / reverse proxy. Express already does the one job a reverse proxy would do here (serve static files + route `/api`), and adding a second proxy layer in front of a single-process app is pure overhead for this project's scale.
- `auth.ts`'s `trustedOrigins` only needs the Vite dev origin (`http://localhost:5173`) — production has no second origin to trust.

## Backend conventions (`apps/api`)

- REST is the only mutation path. **Socket.IO never accepts writes** — `realtime.ts` only broadcasts (`broadcastNewMessage` etc.) and handles room membership (`join-channel`/`leave-channel`). A new realtime feature that wants to mutate data means: add a REST endpoint, call it from the client, broadcast the result. Don't add a second write path through a socket event — that's the kind of decision this file exists to keep from being casually reversed.
- Resource routers nest under their parent (`serversRouter` mounts `channelsRouter` at `/:serverId/channels`, which mounts `messagesRouter` at `/:channelId/messages`), mirroring the URL shape. Each router file owns its own Zod input schemas — schemas live next to the route that validates against them, not in a shared validators directory.
- Response shape: `{ <resourceName>: ... }` on success (`{ server }`, `{ channels }`, `{ message }`), `{ message: string, issues?: ZodIssue[] }` on error. Keep this consistent for any new endpoint.
- `db/membership.ts` holds the cross-cutting authorization queries (`getMembership`, `findChannelInServer`) used by both REST routes and the Socket.IO auth middleware. Add new shared authorization checks there, not duplicated per-router.
- `error-handler.ts` is the last middleware in `app.ts` and swallows everything into a generic 500 — routes should let unexpected errors throw rather than catching and re-wrapping them.

## Database / Drizzle

- One schema file per domain in `db/schema/` (`auth.ts`, `servers.ts`, `channels.ts`, `messages.ts`), re-exported through `db/schema/index.ts`. Don't go back to a single flat `schema.ts` — it was split for exactly this reason once there was more than one domain.
- Migrations are generated, never hand-written: `npm run db:generate -w @opencord/api` after a schema change, then commit the resulting SQL + snapshot together with the schema change in the same commit. Don't edit files under `apps/api/drizzle/` by hand.
- `db/schema/auth.ts` is shaped to match what Better Auth's Drizzle adapter expects (`user`, `session`, `account`, `verification`). If you upgrade Better Auth or enable a plugin that needs new columns/tables, regenerate via Better Auth's own schema CLI and diff against this file rather than guessing at the shape by hand.

## Better Auth

Email/password only, session-based (cookie), Drizzle adapter. To add an OAuth provider, add it to the `emailAndPassword`/social config in `auth.ts` — the schema in `db/schema/auth.ts` already has the generic `account` table Better Auth needs for any provider. Don't build a parallel auth mechanism for realtime — `realtime.ts` already re-validates the same Better Auth session on socket connect (`auth.api.getSession` against the socket handshake headers), and any new authenticated surface should do the same rather than inventing a token scheme.

## Realtime (Socket.IO)

One Socket.IO server attached to the same HTTP server as Express (same port, same origin — see above). Room-per-channel (`channel:<id>`), joined only after a membership + channel check against Postgres. See "Backend conventions" above for the REST-writes-only rule — it's the load-bearing decision in this file, repeated here because it's the one most likely to get "fixed" by someone adding a mutating socket event under time pressure.

## Redis

Provisioned in `compose.yaml`, currently unused by any code. Reserved for two concrete, near-term uses tied to code that already exists — not speculative infrastructure:

1. The Socket.IO Redis adapter (`@socket.io/redis-adapter`), needed the moment the API runs as more than one instance, so broadcasts reach sockets connected to other instances.
2. Presence / typing-indicator state — ephemeral, doesn't belong in Postgres.

Don't add a Redis client or `REDIS_URL` until one of these actually lands. When it does, add `REDIS_URL` to `.env.example` and `env.ts` following the same pattern as `DATABASE_URL`.

## Testing

Three tiers, not to be blurred:

- **`apps/api/src/**/*.test.ts`** (Vitest) — integration tests against a real Postgres, not mocks. `test-support.ts` provides auth/server/channel/message helpers and cleanup; use them instead of hand-rolling fixtures. This is intentional: the API layer is thin enough that mocking the DB would mostly test the mocks.
- **`apps/web/**/*.test.tsx`** (Vitest + Testing Library) — not set up yet because there's no component logic to test yet (`App.tsx` is a placeholder). When the first real component lands, add `@testing-library/react` + `jest-dom` to `apps/web`, wire a `vitest.config.ts` there, and add `apps/web` to the root `vitest.config.ts` `projects` array. The ESLint config already scopes `testing-library`/`jest-dom` rules to `apps/web/**/*.test.{ts,tsx}` in anticipation of this.
- **`e2e/tests/*.spec.ts`** (Playwright) — black-box, runs against `npm run dev -w @opencord/web` (see `e2e/playwright.config.ts`). Reserve this tier for flows that genuinely need a real browser (auth redirects, multi-tab realtime); don't duplicate what a Vitest integration test already covers.

## Docker Compose

Dev-only, and only for stateful services (Postgres, Redis). The app processes themselves run on the host via `npm run dev`, not in containers — that keeps the edit/reload loop fast. If this project ever needs a containerized production deploy, that's a new decision to make explicitly (and document here), not an extension of `compose.yaml` as-is.

## TypeScript / ESLint / Prettier

Single flat `eslint.config.js` at the root, scoped per-directory by `files` globs, rather than a config per workspace — this keeps rule changes (e.g. adding a plugin) a one-file edit. Same reasoning for one root `prettier.config.js` and `tsconfig.base.json` (shared strictness) with each workspace's `tsconfig.json` extending it. Don't fragment these per-package; if a rule needs to differ per workspace, scope it by glob in the existing file instead of splitting the config.

## Environment / config

`.env.example` is the source of truth for what variables exist; `apps/api/src/env.ts` validates them at boot with Zod and fails fast on a bad/missing value. Adding a config value means updating both in the same commit — a var that's only in one of them is a bug.

## Commit convention

Conventional Commits. Types: the standard `@commitlint/config-conventional` set (`feat`, `fix`, `refactor`, `perf`, `test`, `build`, `ci`, `docs`, `style`, `chore`, `revert`).

Scope is the single workspace or backend domain module the commit is about: `web`, `api`, `auth`, `db`, `servers`, `channels`, `messages`, `realtime`, `e2e`. Omit the scope when a commit spans more than one top-level workspace with no single owner (e.g. a change that touches both `apps/api` and `apps/web`). Never use a compound or invented scope (`api/auth`, `web-ui`) — if the change doesn't fit one of the fixed scopes, it probably doesn't have a scope.

No commit bodies unless there's a genuinely non-obvious reason a diff alone can't convey — prefer a clean one-line subject.

## Decisions this file exists to protect

These have already been made and re-litigating them from scratch mid-feature is the failure mode this file is for:

- Same-origin only — no CORS, no Nginx.
- REST is the only mutation path — Socket.IO is broadcast-only.
- No DB mocking in `apps/api` tests.
- npm workspaces, not Nx/Turborepo.
- One flat ESLint config, not per-package configs.
- `packages/shared` stays absent until `apps/web` has a real second consumer for shared types.
- Redis stays unused until the Socket.IO adapter or presence feature actually needs it.
