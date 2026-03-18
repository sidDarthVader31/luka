# Server

This folder contains the Luka backend service.

## Planned stack

- Go
- Gin

## Responsibility

The server owns:

- the HTTP API
- design validation
- persistence
- simulation execution
- bottleneck detection
- result explanation generation

The simulator core should live here so the backend remains the source of truth.

## Available commands

- `go run ./cmd/api`
- `go test ./...`
