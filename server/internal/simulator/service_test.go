package simulator

import (
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

func TestRunDesignWithQueueAndWorkerPath(t *testing.T) {
	service := NewService()

	result, err := service.RunDesign(domain.Design{
		ID:   "design-queue",
		Name: "Async Write Path",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{
					ID:        "client-1",
					Label:     "Client",
					Archetype: domain.NodeArchetypeClient,
					Color:     "blue",
					Position:  domain.NodePosition{X: 0, Y: 0},
				},
				{
					ID:        "gateway-1",
					Label:     "Gateway",
					Archetype: domain.NodeArchetypeGateway,
					Color:     "blue",
					Position:  domain.NodePosition{X: 100, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      2,
						CapacityRPS:   15000,
						BaseLatencyMS: 8,
					},
				},
				{
					ID:        "service-1",
					Label:     "Write Service",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 220, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      2,
						CapacityRPS:   12000,
						BaseLatencyMS: 18,
					},
				},
				{
					ID:        "queue-1",
					Label:     "Queue",
					Archetype: domain.NodeArchetypeQueue,
					Color:     "yellow",
					Position:  domain.NodePosition{X: 360, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   11000,
						BaseLatencyMS: 4,
					},
				},
				{
					ID:        "worker-1",
					Label:     "Worker",
					Archetype: domain.NodeArchetypeWorker,
					Color:     "green",
					Position:  domain.NodePosition{X: 520, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      2,
						CapacityRPS:   4000,
						BaseLatencyMS: 30,
					},
				},
			},
			Edges: []domain.Edge{
				{
					ID:              "edge-client-gateway",
					SourceNodeID:    "client-1",
					TargetNodeID:    "gateway-1",
					InteractionType: domain.EdgeInteractionSyncRequest,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
				{
					ID:              "edge-gateway-service",
					SourceNodeID:    "gateway-1",
					TargetNodeID:    "service-1",
					InteractionType: domain.EdgeInteractionSyncRequest,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
				{
					ID:              "edge-service-queue",
					SourceNodeID:    "service-1",
					TargetNodeID:    "queue-1",
					InteractionType: domain.EdgeInteractionAsyncEnqueue,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
				{
					ID:              "edge-queue-worker",
					SourceNodeID:    "queue-1",
					TargetNodeID:    "worker-1",
					InteractionType: domain.EdgeInteractionConsume,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
			},
		},
	}, domain.Workload{RequestsPerSecond: 12000})
	if err != nil {
		t.Fatalf("RunDesign() error = %v", err)
	}

	if result.Bottleneck == nil {
		t.Fatal("expected bottleneck")
	}

	if result.Bottleneck.NodeID != "worker-1" {
		t.Fatalf("bottleneck node = %q, want worker-1", result.Bottleneck.NodeID)
	}

	if len(result.Edges) != 4 {
		t.Fatalf("edge results = %d, want 4", len(result.Edges))
	}
}

func TestRunDesignAppliesFanoutToAsyncEdges(t *testing.T) {
	service := NewService()

	result, err := service.RunDesign(domain.Design{
		ID:   "design-fanout",
		Name: "Fanout Notifications",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "blue", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "service-1",
					Label:     "Notification Service",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 140, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      2,
						CapacityRPS:   10000,
						BaseLatencyMS: 18,
					},
				},
				{
					ID:        "queue-1",
					Label:     "Fanout Queue",
					Archetype: domain.NodeArchetypeQueue,
					Color:     "yellow",
					Position:  domain.NodePosition{X: 320, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   7000,
						BaseLatencyMS: 4,
					},
				},
			},
			Edges: []domain.Edge{
				{
					ID:              "edge-client-service",
					SourceNodeID:    "client-1",
					TargetNodeID:    "service-1",
					InteractionType: domain.EdgeInteractionSyncRequest,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
				{
					ID:              "edge-service-queue",
					SourceNodeID:    "service-1",
					TargetNodeID:    "queue-1",
					InteractionType: domain.EdgeInteractionAsyncEnqueue,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
			},
		},
	}, domain.Workload{
		RequestsPerSecond: 4000,
		FanoutCount:       4,
	})
	if err != nil {
		t.Fatalf("RunDesign() error = %v", err)
	}

	if result.Bottleneck == nil {
		t.Fatal("expected bottleneck")
	}

	if result.Bottleneck.NodeID != "queue-1" {
		t.Fatalf("bottleneck node = %q, want queue-1", result.Bottleneck.NodeID)
	}

	if len(result.Edges) != 2 {
		t.Fatalf("edge results = %d, want 2", len(result.Edges))
	}

	if result.Edges[1].RoutedRPS <= 4000 {
		t.Fatalf("fanout edge routed_rps = %.0f, want more than source throughput", result.Edges[1].RoutedRPS)
	}
}
