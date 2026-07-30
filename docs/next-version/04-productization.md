# Next Version: Productization Plan

**Status:** Planned  
**Decision gate:** Ship trust + review workflow before multi-user auth  
**Depends on:** [00-office-use-case.md](./00-office-use-case.md)

## Principles

1. Local `docker compose up` should give FE + API + Postgres with samples.
2. Auth and multi-tenancy wait until the core loop is trusted in reviews.
3. Prefer boring defaults (single-user / shared internal deployment) over premature SaaS.

## Milestone P0 — Local ops (do next with FE routes)

### Docker Compose

Add at repo root:

- `postgres:15` with volume + `LUKA_DATABASE_URL`
- `server` image or `go run` via Dockerfile
- `client` Vite preview or nginx serving build; proxy `/api` → server

Suggested services:

```yaml
services:
  db:
    image: postgres:15
  api:
    build: ./server
    environment:
      LUKA_DATABASE_URL: postgres://luka:luka@db:5432/luka?sslmode=disable
  web:
    build: ./client
    ports: ["5173:80"]
```

Also document pure-local (no Docker) path already in [`local-development.md`](../local-development.md).

### API gaps for library UX

| Endpoint | Why |
| --- | --- |
| `GET /api/v1/designs` | Design library page |
| `DELETE /api/v1/designs/:id` | Cleanup (optional) |
| `GET /api/v1/design-templates` | Template packs |
| `GET /api/v1/capacity-presets` | Org/interview defaults |

### CI

Minimal GitHub Actions (or equivalent):

- `go test ./...` in `server/`
- `pnpm --dir client build` (+ lint when stable)

## Milestone P1 — Auth decision

**Default for internal office pilots:** no auth; deploy on a private network / VPN. Document risk of enumerable design IDs.

**When to add auth:**

- Designs leave the private network, or
- Multiple teams share one instance and need isolation.

**Recommended first auth model:**

- OIDC (Google / Okta / GitHub) via middleware
- `owner_user_id` / `org_id` columns on designs and runs
- List endpoints filtered by org

Do **not** build custom password auth in-house.

## Milestone P2 — Multi-user collaboration

Only after P1:

- Shared org library vs private drafts
- Soft locks or “last write wins” with version history (already have versions)
- Optional comments as a later add-on (out of scope until compare/present ship)

## Config surface

| Variable | Purpose |
| --- | --- |
| `LUKA_DATABASE_URL` / `DATABASE_URL` | Persistence (exists) |
| `LUKA_SERVER_ADDR` | Bind address (exists) |
| `LUKA_SEED_SAMPLES` | `true`/`false` override for sample seeding (default true) |
| `LUKA_AUTH_MODE` | `none` \| `oidc` (future) |

## Security notes (even without auth)

- Rate-limit run creation if exposed publicly.
- Do not log full graph payloads at info level in production.
- CORS only needed if FE leaves the Vite proxy / same origin.

## Acceptance criteria

- [ ] `docker compose up` yields working UI + API + seeded samples  
- [ ] `GET /designs` returns user-visible designs including samples  
- [ ] CI runs server tests + client build  
- [ ] Written auth ADR: `none` for pilot, OIDC when multi-team  
- [ ] Explicit deferral of multi-tenant billing / SaaS concerns  

## Sequencing relative to other docs

```text
Trust honesty (done / remaining T1–T3)
    → FE modularization + list endpoint + deep links
        → Present / compare / export / templates
            → Docker Compose + CI
                → Auth only if pilot demands it
```
