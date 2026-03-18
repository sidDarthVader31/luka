package platform

import "github.com/sidDarthVader31/luka/server/internal/domain"

func DefaultComponentArchetypes() []domain.ComponentArchetype {
	return []domain.ComponentArchetype{
		{
			Archetype:   domain.NodeArchetypeClient,
			DisplayName: "Client",
			DefaultProperties: domain.NodeProperties{
				BaseLatencyMS: 0,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
		{
			Archetype:   domain.NodeArchetypeStatelessService,
			DisplayName: "Stateless Service",
			DefaultProperties: domain.NodeProperties{
				Replicas:      2,
				CapacityRPS:   10000,
				BaseLatencyMS: 20,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
		{
			Archetype:   domain.NodeArchetypeCache,
			DisplayName: "Cache",
			DefaultProperties: domain.NodeProperties{
				Replicas:      1,
				CapacityRPS:   50000,
				BaseLatencyMS: 3,
				CacheHitRate:  0.8,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
				domain.EdgeInteractionConditionalPath,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
				domain.RoutingRuleCacheHit,
				domain.RoutingRuleCacheMiss,
			},
		},
		{
			Archetype:   domain.NodeArchetypeDatabase,
			DisplayName: "Database",
			DefaultProperties: domain.NodeProperties{
				Replicas:      1,
				CapacityRPS:   7000,
				BaseLatencyMS: 25,
			},
			SupportedInteractions: []domain.EdgeInteractionType{
				domain.EdgeInteractionSyncRequest,
			},
			SupportedRoutingRules: []domain.RoutingRuleType{
				domain.RoutingRuleAlways,
			},
		},
	}
}
