package domain

import (
	"encoding/json"
	"time"
)

type NodeArchetype string

const (
	NodeArchetypeClient           NodeArchetype = "client"
	NodeArchetypeGateway          NodeArchetype = "gateway"
	NodeArchetypeStatelessService NodeArchetype = "stateless_service"
	NodeArchetypeCache            NodeArchetype = "cache"
	NodeArchetypeDatabase         NodeArchetype = "database"
	NodeArchetypeQueue            NodeArchetype = "queue"
	NodeArchetypeWorker           NodeArchetype = "worker"
)

type EdgeInteractionType string

const (
	EdgeInteractionTypeSyncRequest     EdgeInteractionType = "sync_request"
	EdgeInteractionTypeAsyncEnqueue    EdgeInteractionType = "async_enqueue"
	EdgeInteractionTypeConsume         EdgeInteractionType = "consume"
	EdgeInteractionTypeConditionalPath EdgeInteractionType = "conditional_branch"
	EdgeInteractionTypeFallback        EdgeInteractionType = "fallback"
)

type RoutingRuleType string

const (
	RoutingRuleTypeAlways    RoutingRuleType = "always"
	RoutingRuleTypeCacheHit  RoutingRuleType = "cache_hit"
	RoutingRuleTypeCacheMiss RoutingRuleType = "cache_miss"
)

type Graph struct {
	Nodes          []Node         `json:"nodes"`
	Edges          []Edge         `json:"edges"`
	RequestClasses []RequestClass `json:"request_classes,omitempty"`
}

type Design struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Graph       Graph  `json:"graph"`
	// Scene is the client's Excalidraw document, stored as-is. Graph is derived from it.
	Scene     json.RawMessage `json:"scene,omitempty"`
	CreatedAt *time.Time      `json:"created_at,omitempty"`
	UpdatedAt *time.Time      `json:"updated_at,omitempty"`
}

type CreateDesignRequest struct {
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
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
	Color       string         `json:"color,omitempty"`
	Position    NodePosition   `json:"position"`
	Width       float64        `json:"width,omitempty"`
	Height      float64        `json:"height,omitempty"`
	Properties  NodeProperties `json:"properties"`
}

type NodePosition struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type NodeProperties struct {
	Replicas      int     `json:"replicas,omitempty"`
	CapacityRPS   float64 `json:"capacity_rps,omitempty"`
	BaseLatencyMS float64 `json:"base_latency_ms,omitempty"`
	CacheHitRate  float64 `json:"cache_hit_rate,omitempty"`
}

type RequestClass struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	TrafficShare float64 `json:"traffic_share,omitempty"`
}

type Edge struct {
	ID               string              `json:"id"`
	SourceNodeID     string              `json:"source_node_id"`
	TargetNodeID     string              `json:"target_node_id"`
	SourceHandleID   string              `json:"source_handle_id,omitempty"`
	TargetHandleID   string              `json:"target_handle_id,omitempty"`
	InteractionType  EdgeInteractionType `json:"interaction_type"`
	FanoutMultiplier float64             `json:"fanout_multiplier,omitempty"`
	TimeoutMS        float64             `json:"timeout_ms,omitempty"`
	RetryAttempts    int                 `json:"retry_attempts,omitempty"`
	RequestClassIDs  []string            `json:"request_class_ids,omitempty"`
	RoutingRule      RoutingRule         `json:"routing_rule"`
}

type RoutingRule struct {
	RuleType RoutingRuleType `json:"rule_type"`
	Value    float64         `json:"value,omitempty"`
}
