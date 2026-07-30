# Next Version: Simulator Trust Sprint

**Status:** Short-term fixes landed in this pass; remaining work scoped below  
**Primary use case:** Architecture review aid ([00-office-use-case.md](./00-office-use-case.md))

## Goal

Make Luka’s numbers **honest and explainable** so engineers trust the tool in design reviews.

Trust rule: never imply a control affects load or routing unless the engine applies that effect to utilization.

## Shipped in this pass

| ID | Issue | Fix |
| --- | --- | --- |
| C1 | Timeout/retry summaries claimed load amplification | Display-only labeling in path summaries, FE edge help, and code comments on `enrichEdgeResults` |
| C2 | Multiple `async_enqueue` edges each took 100% load | Weight split among peer async enqueues; sync+async remains side-effect (both full). Covered by new tests |
| C3 | Read:write UI implied path routing | Renamed to write pressure; README + FE hints clarify request flows for path splits |
| I4 | Schema docs oversold routing rules | [`simulator-schema.md`](../simulator-schema.md) synced to implemented rules |
| I5 | Postgres missing sample designs | Shared [`store/samples.go`](../../server/internal/store/samples.go) + seed on Postgres boot |

## Remaining trust work (planned, not yet coded)

### T1. Assumptions panel in results UI

Show every formula input used for the active run:

- effective capacity = `capacity_rps × replicas / (payload × write × concurrency penalties)`
- latency curve breakpoints (0.7 / 1.0)
- queue lag = overflow × 5s illustrative window
- timeout/retry = edge display estimates only

**Files:** split from `app-shell` results panel; optional `GET /api/v1/simulation-model` metadata endpoint later.

### T2. Overall aggregate semantics

Today overall re-simulates nodes from summed flow inflows. Document in UI as “capacity merge approximation,” or change to:

1. Sum per-flow node incoming / processed / dropped  
2. Bottleneck = max utilization across merged nodes  
3. Do not re-run timeout enrichment inconsistently

**Owner file:** [`simulator/service.go`](../../server/internal/simulator/service.go) `aggregateMetrics`.

### T3. Concurrency model transparency or replacement

Document the `/120000` style soft penalties in the assumptions panel, or replace with:

`in_flight ≈ rps × latency_s` vs `replicas × max_concurrency` when that property exists.

### T4. Optional later: feed retries into capacity

Only after reviews trust display-only stats. Prefer iterative walk or fixed-point amplification on target edges. Keep behind a simulation config flag (`retry_affects_load: false` default).

### T5. Explicit `side_effect` edge flag (optional)

Today sync+async side-effect is implicit. Add `side_effect: true` default for async when a sync peer exists, with UI toggle “also enqueue (full load)” vs “split with sync peers” if product needs it.

## Acceptance criteria

- [x] No user-facing copy claims retries amplify utilization  
- [x] Dual async enqueue edges split evenly by default  
- [x] Sync + async from one node both see full processed RPS  
- [x] Write-pressure control copy does not claim path routing  
- [x] Sample designs load under Postgres  
- [ ] Assumptions panel visible after Run  
- [ ] Overall aggregate labeled or rewritten  

## Test commands

```bash
cd server && go test ./internal/simulator/ ./internal/store/ ./internal/runs/ ./internal/designs/
```
