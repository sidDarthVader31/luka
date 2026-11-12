<div align="center">

# Luka

**Sketch a system design, set the traffic, and see where it breaks.**

A system design simulator for interview practice. Draw an architecture on an Excalidraw canvas,
run it against a workload, and get the numbers an interviewer would ask about: throughput,
p50/p99 latency, availability, the bottleneck, and what to fix next.

[![CI](https://github.com/sidDarthVader31/luka/actions/workflows/ci.yml/badge.svg)](https://github.com/sidDarthVader31/luka/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
![Go 1.23](https://img.shields.io/badge/Go-1.23-00ADD8?logo=go&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)

![The Luka editor: a news feed design after a run, with load on every component and all four targets met](docs/images/editor.png)

</div>

## Contents

- [Why Luka](#why-luka)
- [See it in action](#see-it-in-action)
- [Features](#features)
- [Practice problems](#practice-problems)
- [Components](#components)
- [How the simulation works](#how-the-simulation-works)
- [Getting started](#getting-started)
- [Project structure](#project-structure)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Why Luka

In a system design interview you draw boxes and arrows, then defend them: *how many requests can
this take, what is the p99, what happens when the database is the bottleneck?* Practising alone,
nobody asks those questions.

Luka asks them. It treats your diagram as a model, pushes traffic through it, and shows the
arithmetic behind every number, so you can check your back-of-the-envelope maths instead of
trusting a black box.

## See it in action

**Sketch a design and run it.** Drag components from the library, connect them with arrows, set
the traffic, and press Run. Overloaded components turn red, and every arrow shows the requests per
second it carries.

![Adding a client, a service and Postgres, connecting them, and running at 15,000 requests per second: both the service and Postgres overload](docs/images/sketch-and-run.gif)

**Fix the bottleneck.** The review tells you what failed and how to fix it. Scale the service and
add read replicas, run again, and everything is back under 80%.

![Raising the service to 4 instances and Postgres to 5 read replicas, then running again: both drop to 75%](docs/images/fix-bottleneck.gif)

## Features

- **Excalidraw canvas.** Draw freely with undo, copy/paste, frames and free text. Components and
  arrows are what the simulator reads; everything else is your notes. A rectangle you draw yourself
  can be turned into any component.
- **Component library.** 17 named components, including Redis, Kafka, Postgres, Cassandra and
  CDNs, each with sensible defaults you can change. Press <kbd>/</kbd> to search.
- **Read and write paths.** Each arrow carries all traffic, only reads, or only writes, and either
  waits for a response or fires and forgets (drawn dashed). Model a cache-aside read path next to
  an async write path in one design.
- **Honest results.** Steady-state throughput, p50 and p99 per component and end to end,
  availability in nines, and backpressure when a dependency overloads.
- **Show the working.** Every number comes with the formula and inputs that produced it.
- **Review findings.** Single points of failure, overloaded components, read-heavy paths without
  a cache, and more, each with a concrete fix.
- **Practice problems.** Six interview-style problems with a brief, fixed traffic and pass/fail
  targets. A free-form sandbox is there too.
- **Back-of-the-envelope estimates.** Bandwidth and storage per day and per year, with the maths
  shown.

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/brief.png" alt="A problem brief with requirements, scale, hints and targets, all four marked as passed">
      <p><b>Problem briefs</b>: requirements, scale and targets, ticked off as you meet them.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/working.png" alt="The Components tab with a Redis cache expanded, showing demand, capacity, utilisation, latency and availability formulas">
      <p><b>Working</b>: the formulas behind each component's load, latency and availability.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/images/inspector.png" alt="The inspector for a service: instances, capacity per instance and latency">
      <p><b>Inspector</b>: change a component's settings without leaving the canvas.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/images/estimates.png" alt="The Estimates tab: bandwidth and storage per day and per year, with the calculation">
      <p><b>Estimates</b>: bandwidth and storage, with the arithmetic shown.</p>
    </td>
  </tr>
</table>

<p align="center">
  <img src="docs/images/home.png" width="760" alt="The home screen: a blank sandbox button, six practice problems with difficulty and progress, templates and saved designs">
</p>

## Practice problems

| Difficulty | Problem | What it asks |
| --- | --- | --- |
| Easy | URL shortener | Shorten links and redirect millions of clicks a day. |
| Easy | Rate limiter | Check every API call against per-client quotas. |
| Medium | News feed | Show each user a feed of posts from the people they follow. |
| Medium | Chat service | One-to-one and group messaging with message history. |
| Hard | Video upload pipeline | Accept video uploads, transcode them and serve them to viewers. |
| Hard | Ride matching | Track drivers in real time and match riders to the nearest one. |

Each problem fixes the workload and sets targets such as "serve every redirect" or "p99 under
250 ms". Problems live in [`server/internal/problems/data`](server/internal/problems/data) as JSON,
each with a passing and a failing reference design in `testdata`.

## Components

| Category | Components | Behaves as |
| --- | --- | --- |
| Clients | Client | Where traffic enters |
| Edge and routing | CDN · Load balancer · API gateway | CDN: a cache at the edge · Load balancer and gateway: split traffic across targets |
| Compute | Service · Worker | Stateless instances · Queue consumers |
| Data | Redis · Memcached | Cache: only misses go further |
| Data | Postgres · MySQL · DynamoDB · Cassandra | Database: writes to the primary, reads spread over replicas, shards add capacity |
| Data | Object storage · Search index | Endpoints for blobs and search queries |
| Messaging | Kafka · SQS · RabbitMQ | Queue: decouples writers from workers; slow consumers show up as overloaded workers |

The catalog is served by the API from [`server/internal/catalog`](server/internal/catalog), so
adding a component is a server-only change.

## How the simulation works

Luka uses a steady-state analytical model: no random sampling, the same input always gives the
same answer.

1. **Traffic.** The workload (requests per second, read share, payload size) splits into reads and
   writes at each client and flows along the arrows. A service sends every request to each
   dependency it is wired to; a load balancer or gateway splits traffic across its targets; a cache
   passes on only its misses.
2. **Capacity.** Each component's capacity is instances × capacity per instance, exactly as
   entered. There are no hidden penalties.
3. **Latency.** Each instance is treated as an M/M/1 queue, which gives p50 and p99 from
   utilisation. At 100% or more, latency is reported as *overloaded* rather than as a made-up
   number.
4. **Backpressure.** An overloaded dependency serves only part of its demand, and the components
   calling it see that as failed requests.
5. **Availability.** A component is up if any instance is up; a request succeeds only if every
   dependency it waits on is up.

The full rules, formulas and assumptions are in
[`docs/simulation-model.md`](docs/simulation-model.md).

> [!NOTE]
> Luka is a teaching model, not a capacity planner. Default capacities are round, illustrative
> numbers. Use it to reason about shape and order of magnitude, the way an interview does.

## Getting started

### Prerequisites

- [Go](https://go.dev/dl/) 1.23
- [Node.js](https://nodejs.org/) 24 or newer, with `corepack` enabled
- Optional: PostgreSQL 15 or newer, if you want designs to survive a restart

### Run it

```bash
git clone https://github.com/sidDarthVader31/luka.git
cd luka
corepack pnpm install
```

Start the API and the UI in two terminals:

```bash
corepack pnpm server:dev   # API on http://127.0.0.1:8080
```

```bash
corepack pnpm client:dev   # UI on http://localhost:5173
```

Open http://localhost:5173, then pick a practice problem or start a blank sandbox.

### Keep your designs (optional)

By default designs are kept in memory and lost when the server stops. To use PostgreSQL, set
`LUKA_DATABASE_URL` before starting the server; migrations run automatically.

```bash
export LUKA_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/luka?sslmode=disable"
corepack pnpm server:dev
```

See [`docs/local-development.md`](docs/local-development.md) and [`.env.example`](.env.example)
for every setting.

## Project structure

```text
luka/
├── client/                 React 19 + Vite + TypeScript UI
│   └── src/features/
│       ├── editor/         Excalidraw canvas, library, inspector, results
│       ├── home/           Home screen
│       └── problems/       Problem briefs and progress
├── server/                 Go + Gin API
│   ├── internal/simulator/ The simulation engine
│   ├── internal/review/    Review findings
│   ├── internal/problems/  Practice problems and their targets
│   ├── internal/catalog/   Component catalog
│   └── migrations/         PostgreSQL migrations
└── docs/                   Simulation model, local development, images
```

The server owns the domain types. The client's API types in
`client/src/lib/api-types.gen.ts` are generated from `server/internal/domain` with
[tygo](https://github.com/gzuidhof/tygo). The HTTP API is documented in
[`server/API.md`](server/API.md).

## Development

Run the same checks as CI before opening a pull request:

```bash
corepack pnpm server:test        # Go tests, including exact-value golden tests for the engine
corepack pnpm client:typecheck
corepack pnpm lint               # Biome
corepack pnpm client:test        # Vitest
corepack pnpm client:build
corepack pnpm types:check        # generated client types match the Go domain
```

After changing anything in `server/internal/domain`, regenerate the client types:

```bash
corepack pnpm types:generate
```

## Contributing

Contributions are welcome: new practice problems, components, fixes to the model, or UI polish.
Read [CONTRIBUTING.md](CONTRIBUTING.md) to get set up, and please follow the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a security issue, see [SECURITY.md](SECURITY.md).

## License

Luka is licensed under the [Apache License 2.0](LICENSE).

It builds on [Excalidraw](https://github.com/excalidraw/excalidraw) (MIT) for the canvas and
[Tabler Icons](https://tabler.io/icons) (MIT) for icons.
