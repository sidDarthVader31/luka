// Package catalog is the registry of components a design can be built from.
package catalog

import (
	"sync"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

const (
	CategoryClients   = "clients"
	CategoryEdge      = "edge"
	CategoryCompute   = "compute"
	CategoryData      = "data"
	CategoryMessaging = "messaging"
)

// kindGeneric maps each engine kind to the catalog item that holds its baseline defaults.
var kindGeneric = map[domain.NodeArchetype]string{
	domain.NodeArchetypeClient:           "client",
	domain.NodeArchetypeGateway:          "load-balancer",
	domain.NodeArchetypeStatelessService: "service",
	domain.NodeArchetypeWorker:           "worker",
	domain.NodeArchetypeCache:            "redis",
	domain.NodeArchetypeDatabase:         "postgres",
	domain.NodeArchetypeQueue:            "kafka",
}

type index struct {
	catalog domain.Catalog
	byID    map[string]domain.CatalogItem
}

var built = sync.OnceValue(func() index {
	c := buildCatalog()
	idx := index{catalog: c, byID: make(map[string]domain.CatalogItem, len(c.Items))}
	for _, item := range c.Items {
		idx.byID[item.ID] = item
	}
	return idx
})

// Default returns the built-in catalog. Callers must not mutate it.
func Default() domain.Catalog { return built().catalog }

// ItemByID returns the catalog item with the given id.
func ItemByID(id string) (domain.CatalogItem, bool) {
	item, ok := built().byID[id]
	return item, ok
}

// KindDefaults returns the generic item for an engine kind, which carries the
// kind's baseline defaults, fields and supported interactions.
func KindDefaults(kind domain.NodeArchetype) (domain.CatalogItem, bool) {
	id, ok := kindGeneric[kind]
	if !ok {
		return domain.CatalogItem{}, false
	}
	return ItemByID(id)
}

func props(replicas int, capacity, latency float64) domain.NodeProperties {
	return domain.NodeProperties{Replicas: replicas, CapacityRPS: capacity, BaseLatencyMS: latency}
}

func cacheProps(replicas int, capacity, latency, hit float64) domain.NodeProperties {
	p := props(replicas, capacity, latency)
	p.CacheHitRate = hit
	return p
}

func baseFields() []domain.CatalogField {
	return []domain.CatalogField{
		{Key: domain.PropertyKeyReplicas, Label: "Instances", Help: "How many copies run in parallel.", Min: 1, Max: 1000, Step: 1, Primary: true},
		{Key: domain.PropertyKeyCapacityRPS, Label: "Capacity per instance", Help: "Requests one instance can serve per second.", Unit: "req/s", Min: 1, Max: 10000000, Step: 100, Primary: true},
		{Key: domain.PropertyKeyBaseLatencyMS, Label: "Latency", Help: "Time to serve one request when idle.", Unit: "ms", Min: 0, Max: 60000, Step: 1, Primary: true},
	}
}

func cacheFields() []domain.CatalogField {
	return append(baseFields(), domain.CatalogField{
		Key: domain.PropertyKeyCacheHitRate, Label: "Hit rate", Help: "Share of reads answered from the cache.", Min: 0, Max: 1, Step: 0.05,
	})
}

func interactions(kind domain.NodeArchetype) []domain.EdgeInteractionType {
	switch kind {
	case domain.NodeArchetypeClient:
		return []domain.EdgeInteractionType{domain.EdgeInteractionTypeSyncRequest, domain.EdgeInteractionTypeFallback}
	case domain.NodeArchetypeGateway:
		return []domain.EdgeInteractionType{domain.EdgeInteractionTypeSyncRequest}
	case domain.NodeArchetypeDatabase:
		return []domain.EdgeInteractionType{domain.EdgeInteractionTypeSyncRequest, domain.EdgeInteractionTypeFallback}
	case domain.NodeArchetypeCache:
		return []domain.EdgeInteractionType{domain.EdgeInteractionTypeSyncRequest, domain.EdgeInteractionTypeConditionalPath, domain.EdgeInteractionTypeFallback}
	case domain.NodeArchetypeQueue:
		return []domain.EdgeInteractionType{domain.EdgeInteractionTypeConsume}
	default: // stateless_service, worker
		return []domain.EdgeInteractionType{domain.EdgeInteractionTypeSyncRequest, domain.EdgeInteractionTypeAsyncEnqueue, domain.EdgeInteractionTypeFallback}
	}
}

func routingRules(kind domain.NodeArchetype) []domain.RoutingRuleType {
	if kind == domain.NodeArchetypeCache {
		return []domain.RoutingRuleType{domain.RoutingRuleTypeAlways, domain.RoutingRuleTypeCacheHit, domain.RoutingRuleTypeCacheMiss}
	}
	return []domain.RoutingRuleType{domain.RoutingRuleTypeAlways}
}

func item(id, name, category, icon, description string, kind domain.NodeArchetype, p domain.NodeProperties) domain.CatalogItem {
	fields := baseFields()
	switch kind {
	case domain.NodeArchetypeClient:
		fields = []domain.CatalogField{}
	case domain.NodeArchetypeCache:
		fields = cacheFields()
	}
	return domain.CatalogItem{
		ID:                    id,
		Name:                  name,
		CategoryID:            category,
		Description:           description,
		Icon:                  icon,
		Kind:                  kind,
		DefaultProperties:     p,
		Fields:                fields,
		SupportedInteractions: interactions(kind),
		SupportedRoutingRules: routingRules(kind),
	}
}

func buildCatalog() domain.Catalog {
	const (
		client  = domain.NodeArchetypeClient
		gateway = domain.NodeArchetypeGateway
		service = domain.NodeArchetypeStatelessService
		worker  = domain.NodeArchetypeWorker
		cache   = domain.NodeArchetypeCache
		db      = domain.NodeArchetypeDatabase
		queue   = domain.NodeArchetypeQueue
	)

	return domain.Catalog{
		Categories: []domain.CatalogCategory{
			{ID: CategoryClients, Name: "Clients"},
			{ID: CategoryEdge, Name: "Edge and routing"},
			{ID: CategoryCompute, Name: "Compute"},
			{ID: CategoryData, Name: "Data"},
			{ID: CategoryMessaging, Name: "Messaging"},
		},
		Items: []domain.CatalogItem{
			item("client", "Client", CategoryClients, "users", "Where traffic comes from: browsers, mobile apps or other systems.", client, domain.NodeProperties{}),

			item("load-balancer", "Load balancer", CategoryEdge, "arrows-split-2", "Spreads incoming requests evenly across the services behind it.", gateway, props(2, 25000, 8)),
			item("api-gateway", "API gateway", CategoryEdge, "door-enter", "Single entry point that handles routing, auth and rate limiting.", gateway, props(2, 20000, 10)),

			item("service", "Service", CategoryCompute, "server", "Stateless application service that handles requests.", service, props(2, 10000, 20)),
			item("worker", "Worker", CategoryCompute, "settings-automation", "Background consumer that processes queued jobs.", worker, props(3, 12000, 30)),

			item("redis", "Redis", CategoryData, "bolt", "In-memory cache with sub-millisecond reads.", cache, cacheProps(1, 50000, 3, 0.8)),
			item("memcached", "Memcached", CategoryData, "bolt", "Simple, very fast in-memory key-value cache.", cache, cacheProps(1, 60000, 2, 0.8)),
			item("postgres", "Postgres", CategoryData, "database", "Relational database with strong consistency.", db, props(1, 7000, 25)),
			item("mysql", "MySQL", CategoryData, "database", "Relational database, widely used for web workloads.", db, props(1, 6000, 25)),
			item("dynamodb", "DynamoDB", CategoryData, "table", "Managed key-value store that scales horizontally.", db, props(1, 20000, 10)),
			item("cassandra", "Cassandra", CategoryData, "table", "Wide-column store built for high write throughput.", db, props(1, 15000, 15)),

			item("kafka", "Kafka", CategoryMessaging, "stack-2", "Distributed log for high-throughput event streams.", queue, props(1, 40000, 4)),
			item("sqs", "SQS", CategoryMessaging, "stack-2", "Managed message queue with simple at-least-once delivery.", queue, props(1, 30000, 10)),
			item("rabbitmq", "RabbitMQ", CategoryMessaging, "stack-2", "Message broker with flexible routing.", queue, props(1, 20000, 5)),
		},
	}
}
