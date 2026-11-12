// Package catalog is the registry of components a design can be built from.
package catalog

import (
	"slices"
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

// Availability defaults for one instance.
const (
	availabilityTypical = 0.999
	availabilityManaged = 0.9999
)

// connectionRules is the single table of which kinds may connect to which. The
// catalog publishes it per item as AllowedTargets and graph validation enforces it.
var connectionRules = map[domain.NodeArchetype][]domain.NodeArchetype{
	domain.NodeArchetypeClient:           {domain.NodeArchetypeCDN, domain.NodeArchetypeGateway, domain.NodeArchetypeStatelessService},
	domain.NodeArchetypeCDN:              {domain.NodeArchetypeGateway, domain.NodeArchetypeStatelessService, domain.NodeArchetypeObjectStore},
	domain.NodeArchetypeGateway:          {domain.NodeArchetypeStatelessService, domain.NodeArchetypeGateway},
	domain.NodeArchetypeStatelessService: serviceTargets(),
	domain.NodeArchetypeWorker:           serviceTargets(),
	domain.NodeArchetypeCache:            {domain.NodeArchetypeDatabase, domain.NodeArchetypeObjectStore, domain.NodeArchetypeSearch},
	domain.NodeArchetypeQueue:            {domain.NodeArchetypeWorker, domain.NodeArchetypeStatelessService},
	domain.NodeArchetypeDatabase:         {},
	domain.NodeArchetypeObjectStore:      {},
	domain.NodeArchetypeSearch:           {},
}

func serviceTargets() []domain.NodeArchetype {
	return []domain.NodeArchetype{
		domain.NodeArchetypeStatelessService,
		domain.NodeArchetypeCache,
		domain.NodeArchetypeDatabase,
		domain.NodeArchetypeObjectStore,
		domain.NodeArchetypeSearch,
		domain.NodeArchetypeQueue,
		domain.NodeArchetypeGateway,
	}
}

// AllowedTargets returns the kinds a node of the given kind may connect to.
func AllowedTargets(kind domain.NodeArchetype) []domain.NodeArchetype {
	return slices.Clone(connectionRules[kind])
}

// CanConnect reports whether an edge from a source kind to a target kind is allowed.
func CanConnect(source, target domain.NodeArchetype) bool {
	return slices.Contains(connectionRules[source], target)
}

// IsKnownKind reports whether the kind is one the engine models.
func IsKnownKind(kind domain.NodeArchetype) bool {
	_, ok := connectionRules[kind]
	return ok
}

// HasCapacity reports whether nodes of this kind need a positive capacity_rps.
func HasCapacity(kind domain.NodeArchetype) bool {
	return IsKnownKind(kind) && kind != domain.NodeArchetypeClient
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

// KindDefaults returns the generic item for an engine kind: the first item of that
// kind in the catalog, which carries the kind's baseline defaults.
func KindDefaults(kind domain.NodeArchetype) (domain.CatalogItem, bool) {
	return kindDefaultsIn(Default(), kind)
}

func kindDefaultsIn(c domain.Catalog, kind domain.NodeArchetype) (domain.CatalogItem, bool) {
	for _, item := range c.Items {
		if item.Kind == kind {
			return item, true
		}
	}
	return domain.CatalogItem{}, false
}

// ItemFor returns the catalog item that supplies a node's defaults: its component
// when that exists in c and has the node's kind, otherwise the kind's generic item.
func ItemFor(c domain.Catalog, node domain.Node) (domain.CatalogItem, bool) {
	if node.ComponentID != "" {
		for _, item := range c.Items {
			if item.ID == node.ComponentID && item.Kind == node.Archetype {
				return item, true
			}
		}
	}
	return kindDefaultsIn(c, node.Archetype)
}

// ResolveProperties fills a node's missing (zero) properties from its catalog item.
func ResolveProperties(c domain.Catalog, node domain.Node) domain.NodeProperties {
	p := node.Properties
	item, ok := ItemFor(c, node)
	if !ok {
		return p
	}
	d := item.DefaultProperties
	if p.Replicas == 0 {
		p.Replicas = d.Replicas
	}
	if p.CapacityRPS == 0 {
		p.CapacityRPS = d.CapacityRPS
	}
	if p.BaseLatencyMS == 0 {
		p.BaseLatencyMS = d.BaseLatencyMS
	}
	if p.CacheHitRate == 0 {
		p.CacheHitRate = d.CacheHitRate
	}
	if p.Shards == 0 {
		p.Shards = d.Shards
	}
	if p.ReadReplicas == 0 {
		p.ReadReplicas = d.ReadReplicas
	}
	if p.Availability == 0 {
		p.Availability = d.Availability
	}
	return p
}

func props(replicas int, capacity, latency, availability float64) domain.NodeProperties {
	return domain.NodeProperties{Replicas: replicas, CapacityRPS: capacity, BaseLatencyMS: latency, Availability: availability}
}

func cacheProps(replicas int, capacity, latency, hit, availability float64) domain.NodeProperties {
	p := props(replicas, capacity, latency, availability)
	p.CacheHitRate = hit
	return p
}

func dbProps(capacity, latency, availability float64) domain.NodeProperties {
	return domain.NodeProperties{Shards: 1, ReadReplicas: 0, CapacityRPS: capacity, BaseLatencyMS: latency, Availability: availability}
}

var (
	fieldReplicas = domain.CatalogField{Key: domain.PropertyKeyReplicas, Label: "Instances", Help: "How many copies run in parallel.", Min: 1, Max: 1000, Step: 1, Primary: true}
	fieldCapacity = domain.CatalogField{Key: domain.PropertyKeyCapacityRPS, Label: "Capacity per instance", Help: "Requests one instance can serve per second.", Unit: "req/s", Min: 1, Max: 10000000, Step: 100, Primary: true}
	fieldLatency  = domain.CatalogField{Key: domain.PropertyKeyBaseLatencyMS, Label: "Latency", Help: "Time to serve one request when idle.", Unit: "ms", Min: 0, Max: 60000, Step: 1, Primary: true}
	fieldHitRate  = domain.CatalogField{Key: domain.PropertyKeyCacheHitRate, Label: "Hit rate", Help: "Share of reads answered without going further.", Min: 0, Max: 1, Step: 0.05, Primary: true}
	fieldAvail    = domain.CatalogField{Key: domain.PropertyKeyAvailability, Label: "Availability per instance", Help: "Fraction of time one instance is up, for example 0.999.", Min: 0.9, Max: 0.99999, Step: 0.0001}
	fieldDBCap    = domain.CatalogField{Key: domain.PropertyKeyCapacityRPS, Label: "Capacity per node", Help: "Requests one primary or replica can serve per second.", Unit: "req/s", Min: 1, Max: 10000000, Step: 100, Primary: true}
	fieldReadRep  = domain.CatalogField{Key: domain.PropertyKeyReadReplicas, Label: "Read replicas per shard", Help: "Replicas share the reads; every write still goes to the primary.", Min: 0, Max: 15, Step: 1, Primary: true}
	fieldShards   = domain.CatalogField{Key: domain.PropertyKeyShards, Label: "Shards", Help: "Each shard has its own primary, so shards add write capacity.", Min: 1, Max: 256, Step: 1, Primary: true}
)

// fieldsFor returns the editable fields of a kind, matching what the simulation model uses.
func fieldsFor(kind domain.NodeArchetype) []domain.CatalogField {
	switch kind {
	case domain.NodeArchetypeClient:
		return []domain.CatalogField{}
	case domain.NodeArchetypeCache, domain.NodeArchetypeCDN:
		return []domain.CatalogField{fieldReplicas, fieldCapacity, fieldLatency, fieldHitRate, fieldAvail}
	case domain.NodeArchetypeDatabase:
		return []domain.CatalogField{fieldDBCap, fieldLatency, fieldReadRep, fieldShards, fieldAvail}
	default:
		return []domain.CatalogField{fieldReplicas, fieldCapacity, fieldLatency, fieldAvail}
	}
}

func item(id, name, category, icon, description string, kind domain.NodeArchetype, p domain.NodeProperties) domain.CatalogItem {
	return domain.CatalogItem{
		ID:                id,
		Name:              name,
		CategoryID:        category,
		Description:       description,
		Icon:              icon,
		Kind:              kind,
		DefaultProperties: p,
		Fields:            fieldsFor(kind),
		AllowedTargets:    AllowedTargets(kind),
	}
}

// buildCatalog lists the items. The first item of each kind is that kind's generic
// item (see KindDefaults).
func buildCatalog() domain.Catalog {
	const (
		client  = domain.NodeArchetypeClient
		cdn     = domain.NodeArchetypeCDN
		gateway = domain.NodeArchetypeGateway
		service = domain.NodeArchetypeStatelessService
		worker  = domain.NodeArchetypeWorker
		cache   = domain.NodeArchetypeCache
		db      = domain.NodeArchetypeDatabase
		objects = domain.NodeArchetypeObjectStore
		search  = domain.NodeArchetypeSearch
		queue   = domain.NodeArchetypeQueue
		typ     = availabilityTypical
		managed = availabilityManaged
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

			item("cdn", "CDN", CategoryEdge, "world", "Edge cache in front of your origin, CloudFront-style. Serves hits close to users.", cdn, cacheProps(1, 1000000, 15, 0.9, managed)),
			item("load-balancer", "Load balancer", CategoryEdge, "arrows-split-2", "Spreads incoming requests across the services behind it.", gateway, props(2, 25000, 2, typ)),
			item("api-gateway", "API gateway", CategoryEdge, "door-enter", "Single entry point that handles routing, auth and rate limiting.", gateway, props(2, 20000, 5, typ)),

			item("service", "Service", CategoryCompute, "server", "Stateless application service that handles requests.", service, props(2, 5000, 20, typ)),
			item("worker", "Worker", CategoryCompute, "settings-automation", "Background consumer that processes queued jobs.", worker, props(2, 2000, 50, typ)),

			item("redis", "Redis", CategoryData, "bolt", "In-memory cache with sub-millisecond reads.", cache, cacheProps(1, 50000, 1, 0.8, typ)),
			item("memcached", "Memcached", CategoryData, "bolt", "Simple, very fast in-memory key-value cache.", cache, cacheProps(1, 60000, 1, 0.8, typ)),
			item("postgres", "Postgres", CategoryData, "database", "Relational database with strong consistency.", db, dbProps(5000, 10, typ)),
			item("mysql", "MySQL", CategoryData, "database", "Relational database, widely used for web workloads.", db, dbProps(5000, 10, typ)),
			item("dynamodb", "DynamoDB", CategoryData, "table", "Managed key-value store that scales horizontally.", db, dbProps(20000, 8, managed)),
			item("cassandra", "Cassandra", CategoryData, "table", "Wide-column store built for high write throughput.", db, dbProps(15000, 8, typ)),
			item("s3", "Object storage", CategoryData, "bucket", "S3-style storage for files, images and video.", objects, props(1, 50000, 40, managed)),
			item("elasticsearch", "Search index", CategoryData, "search", "Elasticsearch-style full-text and geo search.", search, props(2, 5000, 30, typ)),

			item("kafka", "Kafka", CategoryMessaging, "stack-2", "Distributed log for high-throughput event streams.", queue, props(3, 50000, 5, typ)),
			item("sqs", "SQS", CategoryMessaging, "stack-2", "Managed message queue with simple at-least-once delivery.", queue, props(1, 30000, 10, managed)),
			item("rabbitmq", "RabbitMQ", CategoryMessaging, "stack-2", "Message broker with flexible routing.", queue, props(1, 20000, 5, typ)),
		},
	}
}
