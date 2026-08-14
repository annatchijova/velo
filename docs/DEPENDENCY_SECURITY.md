# Dependency security

State of `npm audit` and the reasoning behind what was and was not
upgraded. Recorded because "3 high severity vulnerabilities" on a
security project invites a fair question, and the answer should not have
to be reconstructed under time pressure.

Last reviewed: 2026-08-08.

## Applied

**`next` 15.5.7 → 15.5.23.** This cleared roughly thirty advisories,
including the ones that actually matter for a web application handling
sensitive work: server-side request forgery in Server Actions and in
rewrites, cache poisoning of RSC responses, XSS via CSP nonces and
`beforeInteractive` scripts, middleware/proxy bypasses, and unauthenticated
disclosure of internal Server Function endpoints.

A patch upgrade inside 15.5.x, not a major. Verified after the fact:
typecheck clean, `next build` succeeds, all routes present.

## Not applied, deliberately

Two advisories remain, both in transitive dependencies of Next, and npm
offers exactly one remedy for them: **`next@16.3.0`, a breaking major
version**.

| Package | Advisory | Reached how |
|---|---|---|
| `postcss` | Path traversal / arbitrary `.map` file read via attacker-controlled `sourceMappingURL` in CSS comments | Build-time CSS processing |
| `sharp` | Inherited libvips CVEs | Next's image optimizer |

Not upgrading, for two reasons.

**Exposure.** Both are reached by inputs this project does not accept
from anyone. `postcss` processes the CSS in this repository, written by
this team — the attack requires an attacker-controlled stylesheet, which
would mean they already commit to the repo. `sharp` is used by Next's
image optimizer; this app optimizes no remote images and configures no
`remotePatterns`. Neither sits on a path that reaches a user's evidence.

**Cost of the fix.** A major Next upgrade the night before a
demonstration is a change whose failure mode is "the UI does not build
and there is no time to find out why". The risk of upgrading exceeds the
risk being upgraded away from.

This is a scoped, dated decision, not a claim that the advisories are
harmless. Before this project runs anywhere real, Next 16 should be the
first upgrade attempted, with time to fix what it breaks.

## Added in MVP Phase 3 (persistence)

Four runtime dependencies and two dev dependencies were added for the
sealed-case ledger (2026-08-08):

| Package | Role | Exposure |
|---|---|---|
| `drizzle-orm` | Query builder / schema over the shared Postgres schema | Server-only (API routes, migrate/seed scripts) |
| `@neondatabase/serverless` | Neon HTTP driver (serverless Postgres) | Server-only; used only when `DB_ADAPTER=neon` |
| `pg` (node-postgres) | Cloud SQL / standard Postgres driver | Server-only; used only when `DB_ADAPTER=cloudsql` |
| `jose` | HS256 session JWT signing/verification | Server-only (`/api/auth/session`) |
| `drizzle-kit` (dev) | Migration generation | Build/dev only, never shipped |
| `tsx` (dev) | Runs the TS migrate/seed scripts | Dev only, never shipped |

Scope notes: none of these touch evidence bytes — the ledger stores sealed
bundles (verdict, hashes, custody metadata), which the engine has already
stripped of raw evidence. `jose` is used only to sign/verify our own session
tokens with `AUTH_SECRET`; it never sees wallet keys. Both DB drivers are
lazy: with no `DB_ADAPTER`/`DATABASE_URL` configured they are never
instantiated, and the app keeps its demo behavior.

## Reproducing

```bash
cd frontend && npm audit
```
