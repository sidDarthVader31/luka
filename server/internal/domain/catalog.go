package domain

// PropertyKey names a field of NodeProperties by its JSON key.
type PropertyKey string

const (
	PropertyKeyReplicas      PropertyKey = "replicas"
	PropertyKeyCapacityRPS   PropertyKey = "capacity_rps"
	PropertyKeyBaseLatencyMS PropertyKey = "base_latency_ms"
	PropertyKeyCacheHitRate  PropertyKey = "cache_hit_rate"
)

// CatalogField describes one editable property of a catalog item.
type CatalogField struct {
	Key   PropertyKey `json:"key"`
	Label string      `json:"label"`
	Help  string      `json:"help,omitempty"`
	Unit  string      `json:"unit,omitempty"`
	Min   float64     `json:"min"`
	Max   float64     `json:"max,omitempty"`
	Step  float64     `json:"step,omitempty"`
	// Primary fields are shown up front in the inspector; the rest sit under "More settings".
	Primary bool `json:"primary,omitempty"`
}

type CatalogCategory struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// CatalogItem is a named component (for example "Kafka") over an engine kind.
type CatalogItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	CategoryID  string `json:"category_id"`
	Description string `json:"description"`
	// Icon is a Tabler icon name, for example "database".
	Icon                  string                `json:"icon"`
	Kind                  NodeArchetype         `json:"kind"`
	DefaultProperties     NodeProperties        `json:"default_properties"`
	Fields                []CatalogField        `json:"fields"`
	SupportedInteractions []EdgeInteractionType `json:"supported_interactions"`
	SupportedRoutingRules []RoutingRuleType     `json:"supported_routing_rules"`
}

type Catalog struct {
	Categories []CatalogCategory `json:"categories"`
	Items      []CatalogItem     `json:"items"`
}
