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
    "request_classes": [
      {
        "id": "flow-read",
        "name": "Read Path",
        "traffic_share": 70
      },
      {
        "id": "flow-write",
        "name": "Write Path",
        "traffic_share": 30
      }
    ],
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
    "edges": [
      {
        "id": "edge-1",
        "source_node_id": "gateway-1",
        "target_node_id": "service-1",
        "interaction_type": "sync_request",
        "request_class_ids": ["flow-read", "flow-write"],
        "routing_rule": {
          "rule_type": "always"
        }
      }
    ]
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
      "request_classes": [
        {
          "id": "flow-read",
          "name": "Read Path",
          "traffic_share": 70
        },
        {
          "id": "flow-write",
          "name": "Write Path",
          "traffic_share": 30
        }
      ],
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
      "edges": [
        {
          "id": "edge-1",
          "source_node_id": "gateway-1",
          "target_node_id": "service-1",
          "interaction_type": "sync_request",
          "request_class_ids": ["flow-read", "flow-write"],
          "routing_rule": {
            "rule_type": "always"
          }
        }
      ]
    }
  },
  "workload": {
    "requests_per_second": 100000,
    "concurrent_users": 250000,
    "read_write_ratio": 4,
    "payload_kb": 8,
    "fanout_count": 1
  },
  "simulation_config": {
    "mode": "analytical"
  },
  "status": "completed",
  "result": {
    "summary": "Postgres saturates first at 143% utilization.",
    "bottleneck": {},
    "nodes": [],
    "edges": [],
    "flows": [
      {
        "request_class_id": "flow-read",
        "name": "Read Path",
        "traffic_share": 70,
        "workload": {
          "requests_per_second": 70000
        },
        "summary": "Read Path saturates Postgres first.",
        "bottleneck": {},
        "nodes": [],
        "edges": []
      }
    ]
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
    "request_classes": [
      {
        "id": "flow-read",
        "name": "Read Path",
        "traffic_share": 100
      }
    ],
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
    "edges": [
      {
        "id": "edge-1",
        "source_node_id": "gateway-1",
        "target_node_id": "service-1",
        "interaction_type": "sync_request",
        "request_class_ids": ["flow-read"],
        "routing_rule": {
          "rule_type": "always"
        }
      }
    ]
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
    "request_classes": [
      {
        "id": "flow-read",
        "name": "Read Path",
        "traffic_share": 100
      }
    ],
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

### 5. Duplicate Design

`POST /api/v1/designs/:designId/duplicate`

Status:

- implemented in this branch

Request:

```json
{
  "name": "Chat Read Path Variant"
}
```

### 6. Create Run

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
      "edges": [
        {
          "id": "edge-1",
          "source_node_id": "gateway-1",
          "target_node_id": "service-1",
          "interaction_type": "sync_request",
          "request_class_ids": ["flow-read"],
          "routing_rule": {
            "rule_type": "always"
          }
        }
      ]
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
- other workload fields are optional, but when provided they must be non-negative
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
      "request_classes": [
        {
          "id": "flow-read",
          "name": "Read Path",
          "traffic_share": 100
        }
      ],
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
      "edges": [
        {
          "id": "edge-1",
          "source_node_id": "gateway-1",
          "target_node_id": "service-1",
          "interaction_type": "sync_request",
          "request_class_ids": ["flow-read"],
          "routing_rule": {
            "rule_type": "always"
          }
        }
      ]
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
    "edges": [],
    "flows": [
      {
        "request_class_id": "flow-read",
        "name": "Read Path",
        "traffic_share": 100,
        "workload": {
          "requests_per_second": 100000
        },
        "summary": "Read Path saturates Postgres first.",
        "bottleneck": {},
        "nodes": [],
        "edges": []
      }
    ]
  },
  "created_at": "2026-03-18T12:30:00Z",
  "completed_at": "2026-03-18T12:30:01Z"
}
```

### 7. Get Run

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

### 8. List Runs For A Design

`GET /api/v1/designs/:designId/runs`

Status:

- implemented in this branch

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

This branch implements the current MVP-oriented slice:

- PostgreSQL-backed persistence with in-memory fallback for local bootstrapping
- analytical simulation mode
- request classes with per-flow results
- archetypes for client, gateway, service, cache, database, queue, and worker
- semantic edges for sync, async enqueue, consume, conditional branch, fallback, and edge-level fanout

Supported workload fields:

- `requests_per_second`
- `concurrent_users`
- `read_write_ratio`
- `payload_kb`
- `fanout_count`
