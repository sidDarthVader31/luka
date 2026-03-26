package domain

import "time"

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
	EdgeInteractionSyncRequest     EdgeInteractionType = "sync_request"
	EdgeInteractionAsyncEnqueue    EdgeInteractionType = "async_enqueue"
	EdgeInteractionConsume         EdgeInteractionType = "consume"
	EdgeInteractionConditionalPath EdgeInteractionType = "conditional_branch"
	EdgeInteractionFallback        EdgeInteractionType = "fallback"
)

type RoutingRuleType string

const (
	RoutingRuleAlways    RoutingRuleType = "always"
	RoutingRuleCacheHit  RoutingRuleType = "cache_hit"
	RoutingRuleCacheMiss RoutingRuleType = "cache_miss"
)

type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

type Design struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Graph       Graph      `json:"graph"`
	CreatedAt   *time.Time `json:"created_at,omitempty"`
	UpdatedAt   *time.Time `json:"updated_at,omitempty"`
}

type CreateDesignRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Graph       Graph  `json:"graph"`
}

type UpdateDesignRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
	Graph       *Graph  `json:"graph,omitempty"`
}

type DuplicateDesignRequest struct {
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

type Node struct {
	ID         string         `json:"id"`
	Label      string         `json:"label"`
	Archetype  NodeArchetype  `json:"archetype"`
	Color      string         `json:"color,omitempty"`
	Position   NodePosition   `json:"position"`
	Properties NodeProperties `json:"properties"`
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

type Edge struct {
	ID               string              `json:"id"`
	SourceNodeID     string              `json:"source_node_id"`
	TargetNodeID     string              `json:"target_node_id"`
	InteractionType  EdgeInteractionType `json:"interaction_type"`
	FanoutMultiplier float64             `json:"fanout_multiplier,omitempty"`
	RoutingRule      RoutingRule         `json:"routing_rule"`
}

type RoutingRule struct {
	RuleType RoutingRuleType `json:"rule_type"`
	Value    float64         `json:"value,omitempty"`
}

type ComponentArchetype struct {
	Archetype             NodeArchetype         `json:"archetype"`
	DisplayName           string                `json:"display_name"`
	DefaultProperties     NodeProperties        `json:"default_properties"`
	SupportedInteractions []EdgeInteractionType `json:"supported_interactions"`
	SupportedRoutingRules []RoutingRuleType     `json:"supported_routing_rules"`
}
