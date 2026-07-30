# Next Version Index

Planning docs for Luka beyond the MVP, oriented around **architecture review** use at work (plus continued interview/learning value).

| Doc | Purpose |
| --- | --- |
| [00-office-use-case.md](./00-office-use-case.md) | Locked primary use case and positioning |
| [01-simulator-trust.md](./01-simulator-trust.md) | Trust sprint: shipped fixes + remaining model honesty |
| [02-frontend-modularization.md](./02-frontend-modularization.md) | Split AppShell, routes, preflight, compare/export |
| [03-office-workflow.md](./03-office-workflow.md) | Share links, present mode, templates, seeds, meetings |
| [04-productization.md](./04-productization.md) | Docker, CI, list APIs, auth deferral |

## Recommended build order

1. Finish remaining trust items (assumptions panel, overall aggregate labeling).
2. Modularize FE and add `/designs/:id` + `GET /designs`.
3. Present mode, deeper compare, export, templates.
4. Docker Compose + CI.
5. Auth only when a multi-team deployment needs it.
