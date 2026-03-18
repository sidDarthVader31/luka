# Luka API Design

## Purpose

This document defines the API shape Luka should grow into for the MVP and near-term iterations.

The core product entities are:

- `Design`
- `Run`
- `ComponentArchetype`

The design principle is:

- `Design` is the saved system graph
- `Run` is a simulation execution against a design snapshot
- simulation should be initiated through run creation, not through a standalone ad hoc endpoint

## Entity Model

### Design

A saved system design.

Canvas layout is persisted as part of the graph through each node's `position`.

```json
{
  "id": "des_123",
  "name": "Chat Read Path",
  "description": "Cache-aside read flow",
  "graph": {
    "nodes": [
      {
        "id": "service-1",
        "label": "Chat Service",
        "archetype": "stateless_service",
        "position": {
          "x": 320,
          "y": 160
        },
        "properties": {
          "replicas": 4,
          "capacity_rps": 30000,
          "base_latency_ms": 20
        }
      }
    ],
    "edges": []
  },
  "created_at": "2026-03-18T12:00:00Z",
  "updated_at": "2026-03-18T12:00:00Z"
}
```

### Run

A single simulation execution.

```json
{
  "id": "run_456",
  "design_id": "des_123",
  "design_snapshot": {
    "id": "des_123",
    "name": "Chat Read Path",
    "description": "Cache-aside read flow",
    "graph": {
      "nodes": [
        {
          "id": "service-1",
          "label": "Chat Service",
          "archetype": "stateless_service",
          "position": {
            "x": 320,
            "y": 160
          },
          "properties": {
            "replicas": 4,
            "capacity_rps": 30000,
            "base_latency_ms": 20
          }
        }
      ],
      "edges": []
    }
  },
  "workload": {
    "requests_per_second": 100000
  },
  "simulation_config": {
    "mode": "analytical"
  },
  "status": "completed",
  "result": {
    "summary": "Postgres saturates first at 143% utilization.",
    "bottleneck": {},
    "nodes": [],
    "edges": []
  },
  "error": null,
  "created_at": "2026-03-18T12:30:00Z",
  "completed_at": "2026-03-18T12:30:01Z"
}
```

### ComponentArchetype

Metadata used by the frontend toolbox and inspector.

```json
{
  "archetype": "cache",
  "display_name": "Cache",
  "default_properties": {
    "replicas": 1,
    "capacity_rps": 50000,
    "base_latency_ms": 3,
    "cache_hit_rate": 0.8
  },
  "supported_interactions": ["sync_request", "conditional_branch"],
  "supported_routing_rules": ["always", "cache_hit", "cache_miss"]
}
```

## API Set

### 1. Create Design

`POST /api/v1/designs`

Status:

- implemented in this branch

Request:

```json
{
  "name": "Chat Read Path",
  "description": "Cache-aside read flow",
  "graph": {
    "nodes": [
      {
        "id": "service-1",
        "label": "Chat Service",
        "archetype": "stateless_service",
        "position": {
          "x": 320,
          "y": 160
        },
        "properties": {
          "replicas": 4,
          "capacity_rps": 30000,
          "base_latency_ms": 20
        }
      }
    ],
    "edges": []
  }
}
```

Response:

```json
{
  "id": "des_123",
  "name": "Chat Read Path",
  "description": "Cache-aside read flow",
  "graph": {
    "nodes": [
      {
        "id": "service-1",
        "label": "Chat Service",
        "archetype": "stateless_service",
        "position": {
          "x": 320,
          "y": 160
        },
        "properties": {
          "replicas": 4,
          "capacity_rps": 30000,
          "base_latency_ms": 20
        }
      }
    ],
    "edges": []
  },
  "created_at": "2026-03-18T12:00:00Z",
  "updated_at": "2026-03-18T12:00:00Z"
}
```

### 2. Get Design

`GET /api/v1/designs/:designId`

Status:

- implemented as read-only sample-backed endpoint in this branch

Response:

```json
{
  "id": "des_123",
  "name": "Chat Read Path",
  "description": "Cache-aside read flow",
  "graph": {
    "nodes": [],
    "edges": []
  },
  "created_at": "2026-03-18T12:00:00Z",
  "updated_at": "2026-03-18T12:10:00Z"
}
```

### 3. Update Design

`PATCH /api/v1/designs/:designId`

Status:

- implemented in this branch

### 4. List Component Archetypes

`GET /api/v1/component-archetypes`

Status:

- implemented in this branch

Response:

```json
{
  "items": [
    {
      "archetype": "stateless_service",
      "display_name": "Stateless Service",
      "default_properties": {
        "replicas": 2,
        "capacity_rps": 10000,
        "base_latency_ms": 20
      },
      "supported_interactions": ["sync_request"],
      "supported_routing_rules": ["always"]
    }
  ]
}
```

### 5. Create Run

`POST /api/v1/runs`

Status:

- implemented in this branch

Request:

```json
{
  "design_id": "sample-cache-aside",
  "workload": {
    "requests_per_second": 100000
  },
  "simulation_config": {
    "mode": "analytical"
  }
}
```

Inline design runs are also supported:

```json
{
  "design": {
    "id": "adhoc-design",
    "name": "Unsaved Design",
    "description": "Temporary graph",
    "graph": {
      "nodes": [
        {
          "id": "service-1",
          "label": "Chat Service",
          "archetype": "stateless_service",
          "position": {
            "x": 320,
            "y": 160
          },
          "properties": {
            "replicas": 4,
            "capacity_rps": 30000,
            "base_latency_ms": 20
          }
        }
      ],
      "edges": []
    }
  },
  "workload": {
    "requests_per_second": 100000
  },
  "simulation_config": {
    "mode": "analytical"
  }
}
```

Validation rules:

- `workload.requests_per_second` is required and must be greater than zero
- exactly one of `design_id` or `design` must be provided

Response:

```json
{
  "id": "run_456",
  "design_id": "sample-cache-aside",
  "design_snapshot": {
    "id": "sample-cache-aside",
    "name": "Sample Cache-Aside Read Path",
    "description": "Sample seeded design",
    "graph": {
      "nodes": [
        {
          "id": "service-1",
          "label": "Chat Service",
          "archetype": "stateless_service",
          "position": {
            "x": 320,
            "y": 160
          },
          "properties": {
            "replicas": 4,
            "capacity_rps": 30000,
            "base_latency_ms": 20
          }
        }
      ],
      "edges": []
    }
  },
  "workload": {
    "requests_per_second": 100000
  },
  "simulation_config": {
    "mode": "analytical"
  },
  "status": "completed",
  "result": {
    "summary": "Postgres saturates first at 143% utilization.",
    "bottleneck": {},
    "nodes": [],
    "edges": []
  },
  "created_at": "2026-03-18T12:30:00Z",
  "completed_at": "2026-03-18T12:30:01Z"
}
```

### 6. Get Run

`GET /api/v1/runs/:runId`

Status:

- implemented in this branch

Response:

```json
{
  "id": "run_456",
  "design_id": "sample-cache-aside",
  "design_snapshot": {
    "id": "sample-cache-aside",
    "name": "Sample Cache-Aside Read Path",
    "description": "Sample seeded design",
    "graph": {
      "nodes": [],
      "edges": []
    }
  },
  "workload": {
    "requests_per_second": 100000
  },
  "simulation_config": {
    "mode": "analytical"
  },
  "status": "completed",
  "result": {
    "summary": "Postgres saturates first at 143% utilization.",
    "bottleneck": {},
    "nodes": [],
    "edges": []
  },
  "created_at": "2026-03-18T12:30:00Z",
  "completed_at": "2026-03-18T12:30:01Z"
}
```

### 7. List Runs For A Design

`GET /api/v1/designs/:designId/runs`

Status:

- planned

## Contract Stability With Persistence

The run contract is designed to stay stable when a real database is introduced.

What changes later:

- `design_id` will resolve through persistent storage instead of a seeded in-memory store
- `Run` records will be stored in the database instead of memory

What should not change:

- `POST /api/v1/runs` request shape
- `GET /api/v1/runs/:runId` response shape
- `Run.design_snapshot` semantics

## Snapshot Rule

Every run should store the exact design snapshot used at execution time.

This is important because:

- the design may change after the run
- historical run results must remain reproducible
- future comparisons depend on immutable run inputs

## Current Implementation Notes

This branch intentionally implements only the first useful slice:

- seeded design lookup
- in-memory run persistence
- analytical simulation mode
- cache-aside path with client, service, cache, and database archetypes

The remaining APIs should be added as the persistence layer is introduced.
