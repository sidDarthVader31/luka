# Next Version: Confirmed Office Use Case

**Status:** Locked for vNext planning  
**Date:** 2026-07-30

## Decision

Luka’s primary office/work use case for the next version is:

> **Architecture review aid** — teams compare design variants in meetings and design docs, with enough trust that engineers will use it at work — while remaining excellent for interview / learning.

Secondary (supported, not primary): polished interview and self-learning workflows.

Explicitly **not** the near-term goal:

- Production capacity sign-off / SLO guarantees
- Cloud-accurate digital twin of live systems
- Load-test replacement (JMeter, k6, etc.)

## Positioning

**Product line:** Explainable architecture what-if lab.

**Promise:** Given typed components, edge semantics, and explicit workload assumptions, Luka shows which component saturates first and explains why in plain language.

**Non-promise:** Exact real-world percentile latency or cloud billing accuracy.

## Why this use case

| Criterion | Architecture reviews | Capacity planning | Internal training | Interview-only polish |
| --- | --- | --- | --- | --- |
| Fits current engine strength | High | Medium | High | High |
| Trust bar | Medium-high (assumptions visible) | Very high | Medium | Medium |
| FE needs | Compare, present, export, share | Calibrated presets + formulas | Templates | UX polish |
| Time to value | Fast if trust + compare ship | Slower | Medium | Fast |

Architecture reviews maximize reuse of the existing typed-graph + explanation loop without forcing a full capacity-science rewrite.

## Implications for roadmap priority

1. **Simulator trust** — honest labels, correct async split, docs sync (blocks office credibility).
2. **Review workflow** — deeper compare, present mode, export, shareable design URLs.
3. **FE modularization** — required to ship (2) without melting `AppShell`.
4. **Templates + capacity presets** — org/interview packs with documented defaults.
5. **Productization** — Docker Compose, Postgres sample seeds; auth/multi-user after the core loop is trusted.

## Success metrics (vNext)

- A reviewer can open two design variants and explain a bottleneck shift in under 5 minutes.
- Timeout/retry and write-pressure controls never imply load routing they do not perform.
- Sample designs work with both in-memory and Postgres persistence.
- Exported markdown/JSON can be pasted into a design doc without re-drawing the graph.
