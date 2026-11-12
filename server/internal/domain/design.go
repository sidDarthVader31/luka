package domain

import (
	"encoding/json"
	"time"
)

// NodeArchetype is a component's engine kind. Catalog items (Redis, Kafka, ...) map onto one.
type NodeArchetype string

const (
	NodeArchetypeClient           NodeArchetype = "client"
	NodeArchetypeCDN              NodeArchetype = "cdn"
	NodeArchetypeGateway          NodeArchetype = "gateway"
	NodeArchetypeStatelessService NodeArchetype = "stateless_service"
	NodeArchetypeWorker           NodeArchetype = "worker"
	NodeArchetypeCache            NodeArchetype = "cache"
	NodeArchetypeDatabase         NodeArchetype = "database"
	NodeArchetypeObjectStore      NodeArchetype = "object_store"
	NodeArchetypeSearch           NodeArchetype = "search"
	NodeArchetypeQueue            NodeArchetype = "queue"
)

// EdgeTraffic says which requests an edge carries.
type EdgeTraffic string

const (
	EdgeTrafficAll    EdgeTraffic = "all"
	EdgeTrafficReads  EdgeTraffic = "reads"
	EdgeTrafficWrites EdgeTraffic = "writes"
)

// EdgeMode says whether the caller waits for the target.
// Async edges carry load but add no latency and cannot fail the caller's request.
type EdgeMode string

const (
	EdgeModeSync  EdgeMode = "sync"
	EdgeModeAsync EdgeMode = "async"
)

type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type Design struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	// ProblemID links the design to a practice problem; empty for a sandbox design.
	ProblemID string `json:"problem_id,omitempty"`
	Graph     Graph  `json:"graph"`
	// Scene is the client's Excalidraw document, stored as-is. Graph is derived from it.
	Scene     json.RawMessage `json:"scene,omitempty"`
	CreatedAt *time.Time      `json:"created_at,omitempty"`
	UpdatedAt *time.Time      `json:"updated_at,omitempty"`
}

type CreateDesignRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	ProblemID   string          `json:"problem_id,omitempty"`
	Graph       Graph           `json:"graph"`
	Scene       json.RawMessage `json:"scene,omitempty"`
}

type UpdateDesignRequest struct {
	Name        *string         `json:"name,omitempty"`
	Description *string         `json:"description,omitempty"`
	Graph       *Graph          `json:"graph,omitempty"`
	Scene       json.RawMessage `json:"scene,omitempty"`
}

type DuplicateDesignRequest struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

type Node struct {
	ID        string        `json:"id"`
	Label     string        `json:"label"`
	Archetype NodeArchetype `json:"archetype"`
	// ComponentID is the catalog item (for example "redis"). Archetype is its engine kind.
	ComponentID string         `json:"component_id,omitempty"`
	Position    NodePosition   `json:"position"`
	Properties  NodeProperties `json:"properties"`
}

type NodePosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// NodeProperties are the knobs a user can set. Which ones apply depends on the kind;
// see docs/simulation-model.md.
type NodeProperties struct {
	Replicas      int     `json:"replicas,omitempty"`
	CapacityRPS   float64 `json:"capacity_rps,omitempty"`
	BaseLatencyMS float64 `json:"base_latency_ms,omitempty"`
	CacheHitRate  float64 `json:"cache_hit_rate,omitempty"`
	Shards        int     `json:"shards,omitempty"`
	ReadReplicas  int     `json:"read_replicas,omitempty"`
	// Availability of one instance, for example 0.999.
	Availability float64 `json:"availability,omitempty"`
}

type Edge struct {
	ID           string      `json:"id"`
	SourceNodeID string      `json:"source_node_id"`
	TargetNodeID string      `json:"target_node_id"`
	Traffic      EdgeTraffic `json:"traffic"`
	Mode         EdgeMode    `json:"mode"`
	// Weight is used only when the source splits load (gateway); 0 means 1.
	Weight float64 `json:"weight,omitempty"`
}
