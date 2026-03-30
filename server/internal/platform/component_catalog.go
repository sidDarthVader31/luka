package platform

import "github.com/sidDarthVader31/luka/server/internal/domain"

func DefaultComponentArchetypes() []domain.ComponentArchetype {
	return []domain.ComponentArchetype{
		{
			Archetype:    domain.NodeArchetypeClient,
			DisplayName:  "Client",
			DefaultColor: "cobalt",
			DefaultProperties: domain.NodeProperties{
				BaseLatencyMS: 0,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
				domain.EdgeInteractionFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
		{
			Archetype:    domain.NodeArchetypeGateway,
			DisplayName:  "Gateway",
			DefaultColor: "indigo",
			DefaultProperties: domain.NodeProperties{
				Replicas:          2,
				CapacityRPS:       25000,
				BaseLatencyMS:     8,
				BalancingStrategy: "least_pressure",
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
		{
			Archetype:    domain.NodeArchetypeStatelessService,
			DisplayName:  "Stateless Service",
			DefaultColor: "emerald",
			DefaultProperties: domain.NodeProperties{
				Replicas:      2,
				CapacityRPS:   10000,
				BaseLatencyMS: 20,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
				domain.EdgeInteractionAsyncEnqueue,
				domain.EdgeInteractionFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
		{
			Archetype:    domain.NodeArchetypeCache,
			DisplayName:  "Cache",
			DefaultColor: "amber",
			DefaultProperties: domain.NodeProperties{
				Replicas:              1,
				CapacityRPS:           50000,
				BaseLatencyMS:         3,
				CacheHitRate:          0.8,
				CacheWarmupTicks:      0,
				CacheInvalidationRate: 0,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
				domain.EdgeInteractionConditionalPath,
				domain.EdgeInteractionFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
				domain.RoutingRuleCacheHit,
				domain.RoutingRuleCacheMiss,
			},
		},
		{
			Archetype:    domain.NodeArchetypeDatabase,
			DisplayName:  "Database",
			DefaultColor: "coral",
			DefaultProperties: domain.NodeProperties{
				Replicas:         2,
				CapacityRPS:      7000,
				BaseLatencyMS:    25,
				ReadCapacityRPS:  7000,
				WriteCapacityRPS: 3200,
				ConnectionLimit:  120,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
				domain.EdgeInteractionFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
		{
			Archetype:    domain.NodeArchetypeQueue,
			DisplayName:  "Queue",
			DefaultColor: "orange",
			DefaultProperties: domain.NodeProperties{
				Replicas:      1,
				CapacityRPS:   40000,
				BaseLatencyMS: 4,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionConsume,
				domain.EdgeInteractionFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
		{
			Archetype:    domain.NodeArchetypeWorker,
			DisplayName:  "Worker",
			DefaultColor: "teal",
			DefaultProperties: domain.NodeProperties{
				Replicas:      3,
				CapacityRPS:   12000,
				BaseLatencyMS: 30,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
				domain.EdgeInteractionAsyncEnqueue,
				domain.EdgeInteractionFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
	}
}
