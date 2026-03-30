package simulator

import (
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

func TestRunDesignWithTickModeBuildsTimeline(t *testing.T) {
	service := NewService()

	result, err := service.RunDesignWithConfig(domain.Design{
		ID:   "design-ticks",
		Name: "Queue Lag Over Time",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "cobalt", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "service-1",
					Label:     "API",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "emerald",
					Position:  domain.NodePosition{X: 120, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   12000,
						BaseLatencyMS: 15,
					},
				},
				{
					ID:        "queue-1",
					Label:     "Jobs Queue",
					Archetype: domain.NodeArchetypeQueue,
					Color:     "orange",
					Position:  domain.NodePosition{X: 280, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   3500,
						BaseLatencyMS: 4,
					},
				},
				{
					ID:        "worker-1",
					Label:     "Worker",
					Archetype: domain.NodeArchetypeWorker,
					Color:     "teal",
					Position:  domain.NodePosition{X: 440, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   3200,
						BaseLatencyMS: 25,
					},
				},
			},
			Edges: []domain.Edge{
				{ID: "edge-client-service", SourceNodeID: "client-1", TargetNodeID: "service-1", InteractionType: domain.EdgeInteractionSyncRequest, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
				{ID: "edge-service-queue", SourceNodeID: "service-1", TargetNodeID: "queue-1", InteractionType: domain.EdgeInteractionAsyncEnqueue, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
				{ID: "edge-queue-worker", SourceNodeID: "queue-1", TargetNodeID: "worker-1", InteractionType: domain.EdgeInteractionConsume, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
			},
		},
	}, domain.Workload{
		RequestsPerSecond: 8000,
		FanoutCount:       2,
	}, domain.SimulationConfig{
		Mode:           domain.SimulationModeTickBased,
		TickCount:      6,
		TickDurationMS: 1000,
	})
	if err != nil {
		t.Fatalf("RunDesignWithConfig() error = %v", err)
	}

	if len(result.Ticks) != 6 {
		t.Fatalf("ticks len = %d, want 6", len(result.Ticks))
	}

	if result.Bottleneck == nil || result.Bottleneck.NodeID != "queue-1" {
		t.Fatalf("bottleneck = %#v, want queue-1", result.Bottleneck)
	}

	lastTick := result.Ticks[len(result.Ticks)-1]
	queueSeen := false
	for _, node := range lastTick.Nodes {
		if node.NodeID != "queue-1" {
			continue
		}
		queueSeen = true
		if node.QueueDepthEstimate <= 0 {
			t.Fatalf("queue depth = %.0f, want backlog > 0", node.QueueDepthEstimate)
		}
	}

	if !queueSeen {
		t.Fatal("expected queue node in final tick")
	}
}

func TestRunDesignWithTickModeSchedulesRetriesAcrossTicks(t *testing.T) {
	service := NewService()

	result, err := service.RunDesignWithConfig(domain.Design{
		ID:   "design-retries",
		Name: "Retry Pressure",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "cobalt", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "service-1",
					Label:     "API",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "emerald",
					Position:  domain.NodePosition{X: 120, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   7000,
						BaseLatencyMS: 15,
					},
				},
				{
					ID:        "worker-1",
					Label:     "Slow Worker",
					Archetype: domain.NodeArchetypeWorker,
					Color:     "teal",
					Position:  domain.NodePosition{X: 280, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   2500,
						BaseLatencyMS: 180,
					},
				},
			},
			Edges: []domain.Edge{
				{ID: "edge-client-service", SourceNodeID: "client-1", TargetNodeID: "service-1", InteractionType: domain.EdgeInteractionSyncRequest, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
				{ID: "edge-service-worker", SourceNodeID: "service-1", TargetNodeID: "worker-1", InteractionType: domain.EdgeInteractionSyncRequest, TimeoutMS: 80, RetryAttempts: 2, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
			},
		},
	}, domain.Workload{
		RequestsPerSecond: 3000,
	}, domain.SimulationConfig{
		Mode:           domain.SimulationModeTickBased,
		TickCount:      4,
		TickDurationMS: 1000,
	})
	if err != nil {
		t.Fatalf("RunDesignWithConfig() error = %v", err)
	}

	if len(result.Ticks) != 4 {
		t.Fatalf("ticks len = %d, want 4", len(result.Ticks))
	}

	retrySeen := false
	for _, tick := range result.Ticks[1:] {
		for _, edge := range tick.Edges {
			if edge.EdgeID == "edge-service-worker" && edge.RetriedRPS > 0 {
				retrySeen = true
			}
		}
	}
	if !retrySeen {
		t.Fatal("expected retried load on later ticks")
	}
}

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
					ID:               "edge-service-queue",
					SourceNodeID:     "service-1",
					TargetNodeID:     "queue-1",
					InteractionType:  domain.EdgeInteractionAsyncEnqueue,
					FanoutMultiplier: 3,
					RoutingRule:      domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
			},
		},
	}, domain.Workload{RequestsPerSecond: 4000})
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

func TestRunDesignRoutesDroppedLoadThroughFallbackEdges(t *testing.T) {
	service := NewService()

	result, err := service.RunDesign(domain.Design{
		ID:   "design-fallback",
		Name: "Fallback Path",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "blue", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "service-1",
					Label:     "Primary Service",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 140, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   4000,
						BaseLatencyMS: 20,
					},
				},
				{
					ID:        "queue-1",
					Label:     "Fallback Queue",
					Archetype: domain.NodeArchetypeQueue,
					Color:     "yellow",
					Position:  domain.NodePosition{X: 320, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   10000,
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
					ID:              "edge-service-fallback",
					SourceNodeID:    "service-1",
					TargetNodeID:    "queue-1",
					InteractionType: domain.EdgeInteractionFallback,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
			},
		},
	}, domain.Workload{RequestsPerSecond: 9000})
	if err != nil {
		t.Fatalf("RunDesign() error = %v", err)
	}

	if len(result.Edges) != 2 {
		t.Fatalf("edge results = %d, want 2", len(result.Edges))
	}

	if result.Edges[1].RoutedRPS <= 0 {
		t.Fatalf("fallback edge routed_rps = %.0f, want dropped traffic routed", result.Edges[1].RoutedRPS)
	}

	if result.Edges[1].InteractionType != domain.EdgeInteractionFallback {
		t.Fatalf("fallback edge interaction = %q, want fallback", result.Edges[1].InteractionType)
	}
}

func TestRunDesignReturnsPerFlowResults(t *testing.T) {
	service := NewService()

	result, err := service.RunDesign(domain.Design{
		ID:   "design-flows",
		Name: "Read And Write Paths",
		Graph: domain.Graph{
			RequestClasses: []domain.RequestClass{
				{ID: "flow-read", Name: "Read Path", TrafficShare: 70},
				{ID: "flow-write", Name: "Write Path", TrafficShare: 30},
			},
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "blue", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "service-1",
					Label:     "API Service",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 140, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      2,
						CapacityRPS:   9000,
						BaseLatencyMS: 20,
					},
				},
				{
					ID:        "cache-1",
					Label:     "Cache",
					Archetype: domain.NodeArchetypeCache,
					Color:     "yellow",
					Position:  domain.NodePosition{X: 320, Y: -80},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   14000,
						BaseLatencyMS: 3,
						CacheHitRate:  0.9,
					},
				},
				{
					ID:        "db-1",
					Label:     "DB",
					Archetype: domain.NodeArchetypeDatabase,
					Color:     "red",
					Position:  domain.NodePosition{X: 500, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   2500,
						BaseLatencyMS: 25,
					},
				},
				{
					ID:        "queue-1",
					Label:     "Queue",
					Archetype: domain.NodeArchetypeQueue,
					Color:     "yellow",
					Position:  domain.NodePosition{X: 320, Y: 80},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   9000,
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
					RequestClassIDs: []string{"flow-read", "flow-write"},
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
				{
					ID:              "edge-service-cache",
					SourceNodeID:    "service-1",
					TargetNodeID:    "cache-1",
					InteractionType: domain.EdgeInteractionSyncRequest,
					RequestClassIDs: []string{"flow-read"},
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
				{
					ID:              "edge-cache-db",
					SourceNodeID:    "cache-1",
					TargetNodeID:    "db-1",
					InteractionType: domain.EdgeInteractionConditionalPath,
					RequestClassIDs: []string{"flow-read"},
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleCacheMiss},
				},
				{
					ID:              "edge-service-queue",
					SourceNodeID:    "service-1",
					TargetNodeID:    "queue-1",
					InteractionType: domain.EdgeInteractionAsyncEnqueue,
					RequestClassIDs: []string{"flow-write"},
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
			},
		},
	}, domain.Workload{RequestsPerSecond: 10000})
	if err != nil {
		t.Fatalf("RunDesign() error = %v", err)
	}

	if len(result.Flows) != 2 {
		t.Fatalf("flows len = %d, want 2", len(result.Flows))
	}

	if result.Flows[0].RequestClassID != "flow-read" {
		t.Fatalf("first flow = %q, want flow-read", result.Flows[0].RequestClassID)
	}

	if result.Flows[0].Workload.RequestsPerSecond <= result.Flows[1].Workload.RequestsPerSecond {
		t.Fatal("expected read flow to receive higher traffic share")
	}
}

func TestRunDesignSplitsLoadAcrossParallelSyncEdges(t *testing.T) {
	service := NewService()

	result, err := service.RunDesign(domain.Design{
		ID:   "design-load-split",
		Name: "Gateway Load Split",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "blue", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "gateway-1",
					Label:     "Gateway",
					Archetype: domain.NodeArchetypeGateway,
					Color:     "blue",
					Position:  domain.NodePosition{X: 140, Y: 0},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   12000,
						BaseLatencyMS: 8,
					},
				},
				{
					ID:        "service-1",
					Label:     "Service A",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 320, Y: -80},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   7000,
						BaseLatencyMS: 20,
					},
				},
				{
					ID:        "service-2",
					Label:     "Service B",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 320, Y: 80},
					Properties: domain.NodeProperties{
						Replicas:      1,
						CapacityRPS:   7000,
						BaseLatencyMS: 20,
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
					ID:              "edge-gateway-service-a",
					SourceNodeID:    "gateway-1",
					TargetNodeID:    "service-1",
					InteractionType: domain.EdgeInteractionSyncRequest,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
				{
					ID:              "edge-gateway-service-b",
					SourceNodeID:    "gateway-1",
					TargetNodeID:    "service-2",
					InteractionType: domain.EdgeInteractionSyncRequest,
					RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
				},
			},
		},
	}, domain.Workload{RequestsPerSecond: 10000})
	if err != nil {
		t.Fatalf("RunDesign() error = %v", err)
	}

	var serviceA, serviceB *domain.NodeSimulationResult
	for index := range result.Nodes {
		switch result.Nodes[index].NodeID {
		case "service-1":
			serviceA = &result.Nodes[index]
		case "service-2":
			serviceB = &result.Nodes[index]
		}
	}

	if serviceA == nil || serviceB == nil {
		t.Fatal("expected both services in node results")
	}

	if serviceA.IncomingRPS != 5000 || serviceB.IncomingRPS != 5000 {
		t.Fatalf("parallel services got %.0f and %.0f rps, want 5000 each", serviceA.IncomingRPS, serviceB.IncomingRPS)
	}
}

func TestRunDesignUsesWeightedRoutingValues(t *testing.T) {
	service := NewService()

	result, err := service.RunDesign(domain.Design{
		ID:   "design-weighted-routing",
		Name: "Weighted Split",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "blue", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "gateway-1",
					Label:     "Gateway",
					Archetype: domain.NodeArchetypeGateway,
					Color:     "blue",
					Position:  domain.NodePosition{X: 120, Y: 0},
					Properties: domain.NodeProperties{
						CapacityRPS:   15000,
						BaseLatencyMS: 8,
					},
				},
				{
					ID:        "service-1",
					Label:     "Service A",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 280, Y: -60},
					Properties: domain.NodeProperties{
						CapacityRPS:   12000,
						BaseLatencyMS: 15,
					},
				},
				{
					ID:        "service-2",
					Label:     "Service B",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 280, Y: 60},
					Properties: domain.NodeProperties{
						CapacityRPS:   12000,
						BaseLatencyMS: 15,
					},
				},
			},
			Edges: []domain.Edge{
				{ID: "edge-client-gateway", SourceNodeID: "client-1", TargetNodeID: "gateway-1", InteractionType: domain.EdgeInteractionSyncRequest, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
				{ID: "edge-gateway-service-a", SourceNodeID: "gateway-1", TargetNodeID: "service-1", InteractionType: domain.EdgeInteractionSyncRequest, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways, Value: 3}},
				{ID: "edge-gateway-service-b", SourceNodeID: "gateway-1", TargetNodeID: "service-2", InteractionType: domain.EdgeInteractionSyncRequest, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways, Value: 1}},
			},
		},
	}, domain.Workload{RequestsPerSecond: 8000})
	if err != nil {
		t.Fatalf("RunDesign() error = %v", err)
	}

	var serviceA, serviceB *domain.NodeSimulationResult
	for index := range result.Nodes {
		switch result.Nodes[index].NodeID {
		case "service-1":
			serviceA = &result.Nodes[index]
		case "service-2":
			serviceB = &result.Nodes[index]
		}
	}

	if serviceA == nil || serviceB == nil {
		t.Fatal("expected weighted route targets in node results")
	}

	if serviceA.IncomingRPS != 6000 || serviceB.IncomingRPS != 2000 {
		t.Fatalf("weighted targets got %.0f and %.0f rps, want 6000 and 2000", serviceA.IncomingRPS, serviceB.IncomingRPS)
	}
}

func TestRunDesignAddsRetriesTimeoutsQueueLagAndPathExplanations(t *testing.T) {
	service := NewService()

	result, err := service.RunDesign(domain.Design{
		ID:   "design-intelligence",
		Name: "Timeout Pressure Path",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{ID: "client-1", Label: "Client", Archetype: domain.NodeArchetypeClient, Color: "blue", Position: domain.NodePosition{X: 0, Y: 0}},
				{
					ID:        "service-1",
					Label:     "API Service",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 140, Y: 0},
					Properties: domain.NodeProperties{
						CapacityRPS:   15000,
						BaseLatencyMS: 18,
					},
				},
				{
					ID:        "queue-1",
					Label:     "Work Queue",
					Archetype: domain.NodeArchetypeQueue,
					Color:     "yellow",
					Position:  domain.NodePosition{X: 320, Y: 0},
					Properties: domain.NodeProperties{
						CapacityRPS:   3000,
						BaseLatencyMS: 5,
					},
				},
				{
					ID:        "worker-1",
					Label:     "Worker",
					Archetype: domain.NodeArchetypeWorker,
					Color:     "green",
					Position:  domain.NodePosition{X: 500, Y: 0},
					Properties: domain.NodeProperties{
						CapacityRPS:   2800,
						BaseLatencyMS: 180,
					},
				},
			},
			Edges: []domain.Edge{
				{ID: "edge-client-service", SourceNodeID: "client-1", TargetNodeID: "service-1", InteractionType: domain.EdgeInteractionSyncRequest, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
				{ID: "edge-service-queue", SourceNodeID: "service-1", TargetNodeID: "queue-1", InteractionType: domain.EdgeInteractionAsyncEnqueue, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
				{ID: "edge-queue-worker", SourceNodeID: "queue-1", TargetNodeID: "worker-1", InteractionType: domain.EdgeInteractionConsume, TimeoutMS: 80, RetryAttempts: 2, RoutingRule: domain.RoutingRule{RuleType: domain.RoutingRuleAlways}},
			},
		},
	}, domain.Workload{RequestsPerSecond: 6000, FanoutCount: 2})
	if err != nil {
		t.Fatalf("RunDesign() error = %v", err)
	}

	var queueNode *domain.NodeSimulationResult
	var workerEdge *domain.EdgeSimulationResult
	for index := range result.Nodes {
		if result.Nodes[index].NodeID == "queue-1" {
			queueNode = &result.Nodes[index]
		}
	}
	for index := range result.Edges {
		if result.Edges[index].EdgeID == "edge-queue-worker" {
			workerEdge = &result.Edges[index]
		}
	}

	if queueNode == nil || queueNode.QueueLagMS <= 0 {
		t.Fatalf("queue lag = %.0f, want positive lag", func() float64 {
			if queueNode == nil {
				return 0
			}
			return queueNode.QueueLagMS
		}())
	}

	if workerEdge == nil {
		t.Fatal("expected queue -> worker edge result")
	}

	if workerEdge.RetriedRPS <= 0 {
		t.Fatalf("retried_rps = %.0f, want retries to appear", workerEdge.RetriedRPS)
	}

	if workerEdge.TimedOutRPS <= 0 {
		t.Fatalf("timed_out_rps = %.0f, want remaining timed out load", workerEdge.TimedOutRPS)
	}

	if len(result.Paths) == 0 {
		t.Fatal("expected path explanations")
	}

	if result.Paths[0].Kind != "critical_path" {
		t.Fatalf("first path kind = %q, want critical_path", result.Paths[0].Kind)
	}
}
