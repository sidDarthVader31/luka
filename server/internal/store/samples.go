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

	return []domain.Design{
		{
			ID:          SampleCacheAsideID,
			Name:        "Sample Cache-Aside Read Path",
			Description: "Seeded sample design for cache-aside read path exploration.",
			Graph: domain.Graph{
				RequestClasses: []domain.RequestClass{
					{
						ID:           "flow-read",
						Name:         "Read Path",
						TrafficShare: 100,
					},
				},
				Nodes: []domain.Node{
					{
						ID:        "client-1",
						Label:     "Client",
						Archetype: domain.NodeArchetypeClient,
						Color:     "cobalt",
						Position: domain.NodePosition{
							X: 80,
							Y: 180,
						},
					},
					{
						ID:        "service-1",
						Label:     "Chat Service",
						Archetype: domain.NodeArchetypeStatelessService,
						Color:     "emerald",
						Position: domain.NodePosition{
							X: 320,
							Y: 160,
						},
						Properties: domain.NodeProperties{
							Replicas:      4,
							CapacityRPS:   30000,
							BaseLatencyMS: 20,
						},
					},
					{
						ID:        "cache-1",
						Label:     "Redis Cache",
						Archetype: domain.NodeArchetypeCache,
						Color:     "amber",
						Position: domain.NodePosition{
							X: 600,
							Y: 90,
						},
						Properties: domain.NodeProperties{
							Replicas:      2,
							CapacityRPS:   70000,
							BaseLatencyMS: 3,
							CacheHitRate:  0.9,
						},
					},
					{
						ID:        "db-1",
						Label:     "Postgres",
						Archetype: domain.NodeArchetypeDatabase,
						Color:     "coral",
						Position: domain.NodePosition{
							X: 600,
							Y: 280,
						},
						Properties: domain.NodeProperties{
							Replicas:      1,
							CapacityRPS:   7000,
							BaseLatencyMS: 25,
						},
					},
				},
				Edges: []domain.Edge{
					{
						ID:              "edge-client-service",
						SourceNodeID:    "client-1",
						TargetNodeID:    "service-1",
						InteractionType: domain.EdgeInteractionTypeSyncRequest,
						RequestClassIDs: []string{"flow-read"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeAlways,
						},
					},
					{
						ID:              "edge-service-cache",
						SourceNodeID:    "service-1",
						TargetNodeID:    "cache-1",
						InteractionType: domain.EdgeInteractionTypeSyncRequest,
						RequestClassIDs: []string{"flow-read"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeAlways,
						},
					},
					{
						ID:              "edge-cache-db",
						SourceNodeID:    "cache-1",
						TargetNodeID:    "db-1",
						InteractionType: domain.EdgeInteractionTypeConditionalPath,
						RequestClassIDs: []string{"flow-read"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeCacheMiss,
						},
					},
				},
			},
			CreatedAt: &now,
			UpdatedAt: &now,
		},
		{
			ID:          SampleQueueWorkflowID,
			Name:        "Sample Queue-Based Write Path",
			Description: "Seeded async workflow with a queue and workers consuming background jobs.",
			Graph: domain.Graph{
				RequestClasses: []domain.RequestClass{
					{
						ID:           "flow-write",
						Name:         "Write Path",
						TrafficShare: 100,
					},
				},
				Nodes: []domain.Node{
					{
						ID:        "client-1",
						Label:     "Client",
						Archetype: domain.NodeArchetypeClient,
						Color:     "cobalt",
						Position: domain.NodePosition{
							X: 60,
							Y: 220,
						},
					},
					{
						ID:        "gateway-1",
						Label:     "API Gateway",
						Archetype: domain.NodeArchetypeGateway,
						Color:     "indigo",
						Position: domain.NodePosition{
							X: 250,
							Y: 210,
						},
						Properties: domain.NodeProperties{
							Replicas:      2,
							CapacityRPS:   25000,
							BaseLatencyMS: 8,
						},
					},
					{
						ID:        "service-1",
						Label:     "Message Service",
						Archetype: domain.NodeArchetypeStatelessService,
						Color:     "emerald",
						Position: domain.NodePosition{
							X: 470,
							Y: 210,
						},
						Properties: domain.NodeProperties{
							Replicas:      3,
							CapacityRPS:   14000,
							BaseLatencyMS: 18,
						},
					},
					{
						ID:        "queue-1",
						Label:     "Delivery Queue",
						Archetype: domain.NodeArchetypeQueue,
						Color:     "orange",
						Position: domain.NodePosition{
							X: 700,
							Y: 120,
						},
						Properties: domain.NodeProperties{
							Replicas:      1,
							CapacityRPS:   9000,
							BaseLatencyMS: 4,
						},
					},
					{
						ID:        "worker-1",
						Label:     "Delivery Worker",
						Archetype: domain.NodeArchetypeWorker,
						Color:     "teal",
						Position: domain.NodePosition{
							X: 700,
							Y: 320,
						},
						Properties: domain.NodeProperties{
							Replicas:      4,
							CapacityRPS:   3500,
							BaseLatencyMS: 28,
						},
					},
					{
						ID:        "db-1",
						Label:     "Message Store",
						Archetype: domain.NodeArchetypeDatabase,
						Color:     "coral",
						Position: domain.NodePosition{
							X: 940,
							Y: 320,
						},
						Properties: domain.NodeProperties{
							Replicas:      1,
							CapacityRPS:   7000,
							BaseLatencyMS: 24,
						},
					},
				},
				Edges: []domain.Edge{
					{
						ID:              "edge-client-gateway",
						SourceNodeID:    "client-1",
						TargetNodeID:    "gateway-1",
						InteractionType: domain.EdgeInteractionTypeSyncRequest,
						RequestClassIDs: []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeAlways,
						},
					},
					{
						ID:              "edge-gateway-service",
						SourceNodeID:    "gateway-1",
						TargetNodeID:    "service-1",
						InteractionType: domain.EdgeInteractionTypeSyncRequest,
						RequestClassIDs: []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeAlways,
						},
					},
					{
						ID:               "edge-service-queue",
						SourceNodeID:     "service-1",
						TargetNodeID:     "queue-1",
						InteractionType:  domain.EdgeInteractionTypeAsyncEnqueue,
						FanoutMultiplier: 2,
						RequestClassIDs:  []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeAlways,
						},
					},
					{
						ID:              "edge-queue-worker",
						SourceNodeID:    "queue-1",
						TargetNodeID:    "worker-1",
						InteractionType: domain.EdgeInteractionTypeConsume,
						RequestClassIDs: []string{"flow-write"},
						TimeoutMS:       120,
						RetryAttempts:   1,
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeAlways,
						},
					},
					{
						ID:              "edge-worker-db",
						SourceNodeID:    "worker-1",
						TargetNodeID:    "db-1",
						InteractionType: domain.EdgeInteractionTypeSyncRequest,
						RequestClassIDs: []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleTypeAlways,
						},
					},
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
