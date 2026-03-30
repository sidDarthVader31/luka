# Streaming Tick Delivery Plan

Luka's tick-based engine already computes simulation state as a sequence of discrete ticks. To make the simulator feel live, we need to deliver those ticks to the frontend as they are produced instead of waiting for one final JSON payload.

## Goal

Render the simulation as a live playback:

- backend computes ticks incrementally
- frontend receives each tick in order
- canvas updates immediately from backend-owned state
- final aggregate result still arrives at the end

## Why streaming matters

Without streaming, the frontend must wait for the full run result and then either:

- show everything at once, or
- fake playback from stored ticks

That loses the sense of a system reacting over time. Streaming lets users watch:

- queue backlog grow
- retries appear in later ticks
- fallback/dead-letter paths activate
- bottlenecks shift during the run

## Transport choice

Version 1 should use **Server-Sent Events (SSE)**.

Why SSE first:

- one-way stream fits the problem well
- simpler than WebSocket
- easy to consume from `fetch()` or browser event streams
- keeps the backend authoritative

WebSocket can still come later if Luka needs:

- pause/resume controls
- multi-user collaborative playback
- bidirectional session control

## Event model

The stream should emit:

1. `start`
2. `tick`
3. `complete`
4. `error`

Each `tick` event carries one backend-produced tick snapshot.

## Backend shape

### Current state

- `POST /api/v1/runs` returns the full result blob
- `POST /api/v1/runs/stream` now exposes a streaming transport seam

### Final streaming shape

The backend should eventually compute and emit ticks during execution, not after the run has fully completed.

That requires:

- tick observer callback inside the tick engine
- run service stream method
- SSE handler that flushes each tick immediately

## Frontend shape

Frontend should stay thin:

- create stream request
- consume `start` / `tick` / `complete`
- update canvas state from streamed payloads
- never invent simulator state locally

The frontend should not simulate or extrapolate ticks.

## Rollout plan

### Step 1

Add the streaming transport seam:

- SSE endpoint
- stream event contract
- backend observer hooks

### Step 2

Make tick emission truly incremental for the primary simulation path.

### Step 3

Drive canvas playback from streamed ticks:

- node pressure animation
- edge traffic animation
- live summary updates

### Step 4

Add playback controls:

- pause
- resume
- speed multiplier
- jump to final state

## Constraints

- backend remains source of truth
- same simulation config should produce deterministic tick order
- final `complete` event should still include the aggregate result
- stream endpoint should work even if run persistence is optional
