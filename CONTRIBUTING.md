# Contributing to Luka

Thanks for helping. Luka is small on purpose: a canvas, an honest model and a handful of problems.
Changes that keep it that way are the easiest to review.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug or a wrong number.** If a result looks off, include the design (the JSON from
  the browser's network tab, or steps to rebuild it) and the number you expected, with your
  working. Model bugs are the most valuable reports.
- **Add a practice problem.** See [Adding a problem](#adding-a-problem).
- **Add a component.** See [Adding a component](#adding-a-component).
- **Improve the UI or docs.** Small, focused pull requests are welcome.

For anything large, such as a new engine rule or a new kind of component, open an issue first so
we can agree on the approach before you write the code.

## Setting up

You need Go 1.23, Node.js 24+ with `corepack`, and optionally PostgreSQL 15+.

```bash
corepack pnpm install
corepack pnpm server:dev   # API on http://127.0.0.1:8080
corepack pnpm client:dev   # UI on http://localhost:5173
```

More detail, including PostgreSQL, is in [docs/local-development.md](docs/local-development.md).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make your change, with tests.
3. Run the checks CI runs:

   ```bash
   corepack pnpm server:test
   corepack pnpm client:typecheck
   corepack pnpm lint
   corepack pnpm client:test
   corepack pnpm client:build
   corepack pnpm types:check
   ```

   Go code must also pass `gofmt` and `golangci-lint` (v2, configured in `server/.golangci.yml`).

4. Open a pull request and fill in the template.

### Guidelines

- **The server owns the types.** Change Go types in `server/internal/domain`, then run
  `corepack pnpm types:generate`. Never edit `client/src/lib/api-types.gen.ts` by hand.
- **The model is documented.** If you change how the engine computes anything, update
  [docs/simulation-model.md](docs/simulation-model.md) and add a golden test with exact expected
  values in `server/internal/simulator`. Tests that only check "bigger" or "smaller" are not
  enough.
- **No hidden numbers.** Every number the engine reports should be explainable from the user's
  inputs, and should show up in the `working` lines.
- **Keep modules small.** Prefer a new focused file to growing a large one. Avoid adding
  dependencies unless they clearly pay for themselves.
- **Commit messages** describe what changed and why, in the imperative ("Add read replicas to the
  inspector").

## Adding a problem

A problem is two files in `server/internal/problems/data` plus two reference designs:

| File | What it holds |
| --- | --- |
| `data/<id>.json` | Title, difficulty, summary, fixed workload and targets |
| `data/<id>.md` | The brief shown in the editor: requirements, scale, what to think about |
| `testdata/<id>.pass.json` | A design that meets every target |
| `testdata/<id>.fail.json` | A plausible first attempt that fails most targets |

`TestProblemFixtures` runs both designs, so a problem cannot ship with targets that are
impossible, or so loose that the naive design passes. Target metrics are listed in
[docs/simulation-model.md](docs/simulation-model.md#problems).

## Adding a component

Components are entries in `server/internal/catalog/catalog.go`, for example:

```go
item("kafka", "Kafka", CategoryMessaging, "stack-2",
    "Distributed log for high-throughput event streams.", queue, props(3, 50000, 5, typ)),
```

Each one maps a name onto an existing engine kind (`queue` here) with default properties and a
[Tabler icon](https://tabler.io/icons) name. The client reads the catalog from the API, so no
client change is needed. A new engine *kind* is a bigger change: open an issue first.

## Reporting security issues

Please don't open a public issue. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
