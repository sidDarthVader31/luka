# Capacity presets (FE contract for later backend)

**Status:** FE-only — do not change Go APIs until the editor UX is locked.  
**Source of truth in code:** [`client/src/features/editor/lib/capacity-presets.ts`](../../client/src/features/editor/lib/capacity-presets.ts)

## Purpose

Users pick **Small / Medium / Large** instead of inventing raw `capacity_rps` numbers. The UI writes the existing property fields the simulator already understands.

## Property mapping (unchanged API names)

| UI | API field |
| --- | --- |
| Instances | `replicas` |
| Work per instance / sec | `capacity_rps` |
| Healthy latency (ms) | `base_latency_ms` |
| Cache hit rate | `cache_hit_rate` |

## Preset table

| Archetype | Small | Medium | Large |
| --- | --- | --- | --- |
| Gateway | 1×8k RPS, 8ms | 2×25k, 8ms | 4×40k, 8ms |
| Stateless service | 1×3k, 20ms | 2×10k, 20ms | 4×20k, 20ms |
| Cache | 1×20k, 3ms, 70% hit | 1×50k, 3ms, 80% | 2×80k, 3ms, 90% |
| Database | 1×2k, 25ms | 1×7k, 25ms | 2×12k, 25ms |
| Queue | 1×15k, 4ms | 1×40k, 4ms | 2×60k, 4ms |
| Worker | 1×2k, 30ms | 3×12k, 30ms | 6×20k, 30ms |

Client has no capacity preset (traffic comes from Scenario).

## Later backend work

When FE is perfected, backend can:

1. Expose `GET /api/v1/capacity-presets` (or embed presets on component archetypes).
2. Keep the same property names so existing designs and runs stay valid.
3. Align default catalog values in [`server/internal/platform/component_catalog.go`](../../server/internal/platform/component_catalog.go) with Medium presets where appropriate.
