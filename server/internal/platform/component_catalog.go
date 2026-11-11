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
				domain.EdgeInteractionTypeSyncRequest,
				domain.EdgeInteractionTypeFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleTypeAlways,
			},
		},
		{
			Archetype:    domain.NodeArchetypeGateway,
			DisplayName:  "Gateway",
			DefaultColor: "indigo",
			DefaultProperties: domain.NodeProperties{
				Replicas:      2,
				CapacityRPS:   25000,
				BaseLatencyMS: 8,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionTypeSyncRequest,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleTypeAlways,
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
				domain.EdgeInteractionTypeSyncRequest,
				domain.EdgeInteractionTypeAsyncEnqueue,
				domain.EdgeInteractionTypeFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleTypeAlways,
			},
		},
		{
			Archetype:    domain.NodeArchetypeCache,
			DisplayName:  "Cache",
			DefaultColor: "amber",
			DefaultProperties: domain.NodeProperties{
				Replicas:      1,
				CapacityRPS:   50000,
				BaseLatencyMS: 3,
				CacheHitRate:  0.8,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionTypeSyncRequest,
				domain.EdgeInteractionTypeConditionalPath,
				domain.EdgeInteractionTypeFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleTypeAlways,
				domain.RoutingRuleTypeCacheHit,
				domain.RoutingRuleTypeCacheMiss,
			},
		},
		{
			Archetype:    domain.NodeArchetypeDatabase,
			DisplayName:  "Database",
			DefaultColor: "coral",
			DefaultProperties: domain.NodeProperties{
				Replicas:      1,
				CapacityRPS:   7000,
				BaseLatencyMS: 25,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionTypeSyncRequest,
				domain.EdgeInteractionTypeFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleTypeAlways,
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
				domain.EdgeInteractionTypeConsume,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleTypeAlways,
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
				domain.EdgeInteractionTypeSyncRequest,
				domain.EdgeInteractionTypeAsyncEnqueue,
				domain.EdgeInteractionTypeFallback,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleTypeAlways,
			},
		},
	}
}
