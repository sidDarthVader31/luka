package store

import (
	"errors"
	"log"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

const SampleDesignID = "sample-cache-aside"
const SampleQueueDesignID = "sample-queue-workflow"

// SampleDesigns returns the built-in demo designs used by the UI sample buttons.
// These are available for both in-memory and Postgres-backed stores.
func SampleDesigns() []domain.Design {
	now := time.Now().UTC()

	return []domain.Design{
		{
			ID:          SampleDesignID,
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
						InteractionType: domain.EdgeInteractionSyncRequest,
						RequestClassIDs: []string{"flow-read"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleAlways,
						},
					},
					{
						ID:              "edge-service-cache",
						SourceNodeID:    "service-1",
						TargetNodeID:    "cache-1",
						InteractionType: domain.EdgeInteractionSyncRequest,
						RequestClassIDs: []string{"flow-read"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleAlways,
						},
					},
					{
						ID:              "edge-cache-db",
						SourceNodeID:    "cache-1",
						TargetNodeID:    "db-1",
						InteractionType: domain.EdgeInteractionConditionalPath,
						RequestClassIDs: []string{"flow-read"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleCacheMiss,
						},
					},
				},
			},
			CreatedAt: &now,
			UpdatedAt: &now,
		},
		{
			ID:          SampleQueueDesignID,
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
						InteractionType: domain.EdgeInteractionSyncRequest,
						RequestClassIDs: []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleAlways,
						},
					},
					{
						ID:              "edge-gateway-service",
						SourceNodeID:    "gateway-1",
						TargetNodeID:    "service-1",
						InteractionType: domain.EdgeInteractionSyncRequest,
						RequestClassIDs: []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleAlways,
						},
					},
					{
						ID:               "edge-service-queue",
						SourceNodeID:     "service-1",
						TargetNodeID:     "queue-1",
						InteractionType:  domain.EdgeInteractionAsyncEnqueue,
						FanoutMultiplier: 2,
						RequestClassIDs:  []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleAlways,
						},
					},
					{
						ID:              "edge-queue-worker",
						SourceNodeID:    "queue-1",
						TargetNodeID:    "worker-1",
						InteractionType: domain.EdgeInteractionConsume,
						RequestClassIDs: []string{"flow-write"},
						TimeoutMS:       120,
						RetryAttempts:   1,
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleAlways,
						},
					},
					{
						ID:              "edge-worker-db",
						SourceNodeID:    "worker-1",
						TargetNodeID:    "db-1",
						InteractionType: domain.EdgeInteractionSyncRequest,
						RequestClassIDs: []string{"flow-write"},
						RoutingRule: domain.RoutingRule{
							RuleType: domain.RoutingRuleAlways,
						},
					},
				},
			},
			CreatedAt: &now,
			UpdatedAt: &now,
		},
	}
}

// SeedSampleDesigns inserts built-in samples when they are missing.
// Existing rows are left unchanged so user edits are preserved.
func SeedSampleDesigns(repo DesignRepository) error {
	for _, sample := range SampleDesigns() {
		_, err := repo.GetByID(sample.ID)
		if err == nil {
			continue
		}
		if !errors.Is(err, ErrDesignNotFound) {
			return err
		}

		if err := repo.Create(sample); err != nil {
			return err
		}
		log.Printf("seeded sample design %s", sample.ID)
	}

	return nil
}
