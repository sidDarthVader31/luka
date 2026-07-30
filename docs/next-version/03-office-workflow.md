# Next Version: Office Review Workflow Plan

**Status:** Planned  
**Primary use case:** Architecture review meetings and design-doc iteration  
**Depends on:** [01-simulator-trust.md](./01-simulator-trust.md), [02-frontend-modularization.md](./02-frontend-modularization.md)

## Goal

Let a team review architecture variants without re-drawing graphs or trusting opaque numbers.

Core loop:

1. Open a shared design URL  
2. Adjust one assumption or structural change on a variant  
3. Run and compare  
4. Present the bottleneck in a meeting  
5. Export a summary into the design doc  

## Feature set

### 1. Shareable designs (deep links)

- Route `/designs/:designId` (see FE plan).
- Optional read-only query `?mode=view` before full present mode.
- Copy-link control in the editor topbar.
- Until auth exists, treat design IDs as unguessable enough for trusted internal use only (document that limitation).

### 2. Present mode

Route: `/designs/:designId/present?runId=`

UI:

- Hide archetype palette, edge editors, and dense history.
- Full-bleed canvas with utilization colors.
- Large bottleneck callout + critical path summary.
- Keyboard: `N` next saturated node, `Esc` exit.

Audience: projector / laptop in a design review.

### 3. Templates and capacity presets

**Built-in packs** (code + optional DB seed, same pattern as samples):

| Pack | Contents |
| --- | --- |
| Interview classics | Cache-aside, queue+worker, fanout notifications |
| Web API baseline | Gateway → service → cache/DB |
| Async write path | Existing queue sample refined |

**Capacity presets** (JSON catalog, backend-owned like component archetypes):

```json
{
  "id": "postgres-primary-default",
  "label": "Postgres primary (default assumption)",
  "archetype": "database",
  "properties": { "capacity_rps": 7000, "base_latency_ms": 25, "replicas": 1 },
  "notes": "Illustrative default — replace with your org measurement."
}
```

API sketch: `GET /api/v1/capacity-presets` and `GET /api/v1/design-templates`.

Office users can later override via env/config file without a full multi-tenant system.

### 4. Postgres sample seeds

**Shipped in this pass:** [`store.SeedSampleDesigns`](../../server/internal/store/samples.go) runs after migrations when Postgres is configured.

Follow-ups:

- Seed initial design versions for samples (optional).
- Admin/reset endpoint or CLI: `go run ./cmd/seed` for reinstalling samples after wipe.
- Document in [`local-development.md`](../local-development.md).

### 5. Comparison workflow (product)

| Level | Behavior |
| --- | --- |
| Today | Baseline run vs latest bottleneck deltas |
| vNext | Per-node table + export |
| Office+ | Two design variants side-by-side + structural diff |

Duplicate (“Create Variant”) remains the creation path; compare consumes two design IDs or two run IDs.

### 6. Export for design docs

Artifacts:

- `design.json` — full graph + metadata  
- `run-summary.md` — workload, bottleneck, path, top nodes, assumptions disclaimer  

Optional later: PNG/SVG canvas snapshot via html-to-image.

## Meeting checklist (product copy)

Ship as an empty-state / help card:

1. Load template or sample  
2. Set RPS and write pressure honestly  
3. Create variant for the alternative design  
4. Run both, set baseline, compare  
5. Enter present mode  
6. Export markdown into the RFC  

## Acceptance criteria

- [x] Sample designs available under Postgres  
- [ ] Shareable `/designs/:id` URL works after refresh  
- [ ] Present mode hides editor chrome and emphasizes bottleneck  
- [ ] At least 3 templates + capacity preset catalog  
- [ ] Markdown export includes assumptions disclaimer  
- [ ] Variant compare supports two design IDs  
