package store

import (
	"context"
	"errors"
	"log"
	"slices"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// Ids of the built-in, read-only sample designs (exposed as templates).
const (
	SampleCacheAsideID    = "sample-cache-aside"
	SampleQueueWorkflowID = "sample-queue-workflow"
)

var sampleIDs = []string{SampleCacheAsideID, SampleQueueWorkflowID}

// IsSampleID reports whether id belongs to a built-in sample design.
func IsSampleID(id string) bool {
	return slices.Contains(sampleIDs, id)
}

// SampleDesigns returns the built-in demo designs used by the UI sample buttons.
// These are available for both in-memory and Postgres-backed stores.
func SampleDesigns() []domain.Design {
	now := time.Now().UTC()

	node := func(id, label, component string, kind domain.NodeArchetype, x, y float64, p domain.NodeProperties) domain.Node {
		return domain.Node{ID: id, Label: label, ComponentID: component, Archetype: kind, Position: domain.NodePosition{X: x, Y: y}, Properties: p}
	}
	edge := func(id, from, to string, traffic domain.EdgeTraffic, mode domain.EdgeMode) domain.Edge {
		return domain.Edge{ID: id, SourceNodeID: from, TargetNodeID: to, Traffic: traffic, Mode: mode}
	}
	const (
		all    = domain.EdgeTrafficAll
		sync   = domain.EdgeModeSync
		async  = domain.EdgeModeAsync
		writes = domain.EdgeTrafficWrites
	)

	return []domain.Design{
		{
			ID:          SampleCacheAsideID,
			Name:        "Sample Cache-Aside Read Path",
			Description: "A service reads through Redis; misses and writes go on to Postgres with a read replica.",
			Graph: domain.Graph{
				Nodes: []domain.Node{
					node("client-1", "Client", "client", domain.NodeArchetypeClient, 80, 180, domain.NodeProperties{}),
					node("service-1", "API Service", "service", domain.NodeArchetypeStatelessService, 320, 160,
						domain.NodeProperties{Replicas: 3, CapacityRPS: 5000, BaseLatencyMS: 20, Availability: 0.999}),
					node("cache-1", "Redis Cache", "redis", domain.NodeArchetypeCache, 600, 90,
						domain.NodeProperties{Replicas: 2, CapacityRPS: 50000, BaseLatencyMS: 1, CacheHitRate: 0.9, Availability: 0.999}),
					node("db-1", "Postgres", "postgres", domain.NodeArchetypeDatabase, 600, 280,
						domain.NodeProperties{Shards: 1, ReadReplicas: 1, CapacityRPS: 5000, BaseLatencyMS: 10, Availability: 0.999}),
				},
				Edges: []domain.Edge{
					edge("edge-client-service", "client-1", "service-1", all, sync),
					edge("edge-service-cache", "service-1", "cache-1", all, sync),
					edge("edge-cache-db", "cache-1", "db-1", all, sync),
				},
			},
			CreatedAt: &now,
			UpdatedAt: &now,
		},
		{
			ID:          SampleQueueWorkflowID,
			Name:        "Sample Queue-Based Write Path",
			Description: "Writes are acknowledged after Kafka accepts them; workers store them in Postgres in the background.",
			Graph: domain.Graph{
				Nodes: []domain.Node{
					node("client-1", "Client", "client", domain.NodeArchetypeClient, 60, 220, domain.NodeProperties{}),
					node("gateway-1", "API Gateway", "api-gateway", domain.NodeArchetypeGateway, 250, 210,
						domain.NodeProperties{Replicas: 2, CapacityRPS: 20000, BaseLatencyMS: 5, Availability: 0.999}),
					node("service-1", "Message Service", "service", domain.NodeArchetypeStatelessService, 470, 210,
						domain.NodeProperties{Replicas: 3, CapacityRPS: 5000, BaseLatencyMS: 20, Availability: 0.999}),
					node("queue-1", "Delivery Queue", "kafka", domain.NodeArchetypeQueue, 700, 120,
						domain.NodeProperties{Replicas: 3, CapacityRPS: 50000, BaseLatencyMS: 5, Availability: 0.999}),
					node("worker-1", "Delivery Worker", "worker", domain.NodeArchetypeWorker, 700, 320,
						domain.NodeProperties{Replicas: 2, CapacityRPS: 2000, BaseLatencyMS: 50, Availability: 0.999}),
					node("db-1", "Message Store", "postgres", domain.NodeArchetypeDatabase, 940, 320,
						domain.NodeProperties{Shards: 1, ReadReplicas: 1, CapacityRPS: 5000, BaseLatencyMS: 10, Availability: 0.999}),
				},
				Edges: []domain.Edge{
					edge("edge-client-gateway", "client-1", "gateway-1", all, sync),
					edge("edge-gateway-service", "gateway-1", "service-1", all, sync),
					edge("edge-service-queue", "service-1", "queue-1", writes, sync),
					edge("edge-service-db", "service-1", "db-1", domain.EdgeTrafficReads, sync),
					edge("edge-queue-worker", "queue-1", "worker-1", all, async),
					edge("edge-worker-db", "worker-1", "db-1", all, sync),
				},
			},
			CreatedAt: &now,
			UpdatedAt: &now,
		},
	}
}

// SeedSampleDesigns inserts built-in samples when they are missing. It is used
// for every store implementation so memory and Postgres behave identically.
func SeedSampleDesigns(ctx context.Context, repo DesignRepository) error {
	for _, sample := range SampleDesigns() {
		_, err := repo.GetByID(ctx, sample.ID)
		if err == nil {
			continue
		}
		if !errors.Is(err, ErrDesignNotFound) {
			return err
		}

		if err := repo.Create(ctx, sample); err != nil {
			return err
		}
		log.Printf("seeded sample design %s", sample.ID)
	}

	return nil
}
