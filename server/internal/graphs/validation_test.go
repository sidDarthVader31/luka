package graphs

import (
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

func TestValidateGraphSaveRejectsUnknownEdgeReference(t *testing.T) {
	err := ValidateGraph(domain.Graph{
		Nodes: []domain.Node{
			{
				ID:        "service-1",
				Label:     "Service",
				Archetype: domain.NodeArchetypeStatelessService,
				Color:     "green",
				Position: domain.NodePosition{
					X: 10,
					Y: 10,
				},
			},
		},
		Edges: []domain.Edge{
			{
				ID:              "edge-1",
				SourceNodeID:    "service-1",
				TargetNodeID:    "db-1",
				InteractionType: domain.EdgeInteractionSyncRequest,
				RoutingRule: domain.RoutingRule{
					RuleType: domain.RoutingRuleAlways,
				},
			},
		},
	}, ModeSave)
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), `unknown target node "db-1"`) {
		t.Fatalf("error = %q, want unknown target node", err.Error())
	}
}

func TestValidateGraphRunRejectsCycle(t *testing.T) {
	err := ValidateGraph(domain.Graph{
		Nodes: []domain.Node{
			{
				ID:        "client-1",
				Label:     "Client",
				Archetype: domain.NodeArchetypeClient,
				Color:     "blue",
				Position:  domain.NodePosition{X: 0, Y: 0},
			},
			{
				ID:        "service-1",
				Label:     "Service",
				Archetype: domain.NodeArchetypeStatelessService,
				Color:     "green",
				Position:  domain.NodePosition{X: 100, Y: 0},
			},
		},
		Edges: []domain.Edge{
			{
				ID:              "edge-1",
				SourceNodeID:    "client-1",
				TargetNodeID:    "service-1",
				InteractionType: domain.EdgeInteractionSyncRequest,
				RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
			},
			{
				ID:              "edge-2",
				SourceNodeID:    "service-1",
				TargetNodeID:    "client-1",
				InteractionType: domain.EdgeInteractionSyncRequest,
				RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
			},
		},
	}, ModeRun)
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), "cycles are not supported") {
		t.Fatalf("error = %q, want cycle validation message", err.Error())
	}
}

func TestValidateGraphRejectsInvalidFallbackRule(t *testing.T) {
	err := ValidateGraph(domain.Graph{
		Nodes: []domain.Node{
			{
				ID:        "service-1",
				Label:     "Service",
				Archetype: domain.NodeArchetypeStatelessService,
				Color:     "green",
				Position:  domain.NodePosition{X: 0, Y: 0},
			},
			{
				ID:        "queue-1",
				Label:     "Queue",
				Archetype: domain.NodeArchetypeQueue,
				Color:     "yellow",
				Position:  domain.NodePosition{X: 100, Y: 0},
			},
		},
		Edges: []domain.Edge{
			{
				ID:              "edge-1",
				SourceNodeID:    "service-1",
				TargetNodeID:    "queue-1",
				InteractionType: domain.EdgeInteractionFallback,
				RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleCacheMiss},
			},
		},
	}, ModeSave)
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), "fallback edges must use routing rule") {
		t.Fatalf("error = %q, want fallback validation message", err.Error())
	}
}

func TestValidateGraphRejectsUnknownRequestClassReference(t *testing.T) {
	err := ValidateGraph(domain.Graph{
		RequestClasses: []domain.RequestClass{
			{ID: "flow-read", Name: "Read Path", TrafficShare: 100},
		},
		Nodes: []domain.Node{
			{
				ID:        "client-1",
				Label:     "Client",
				Archetype: domain.NodeArchetypeClient,
				Color:     "blue",
				Position:  domain.NodePosition{X: 0, Y: 0},
			},
			{
				ID:        "service-1",
				Label:     "Service",
				Archetype: domain.NodeArchetypeStatelessService,
				Color:     "green",
				Position:  domain.NodePosition{X: 100, Y: 0},
			},
		},
		Edges: []domain.Edge{
			{
				ID:              "edge-1",
				SourceNodeID:    "client-1",
				TargetNodeID:    "service-1",
				InteractionType: domain.EdgeInteractionSyncRequest,
				RequestClassIDs: []string{"flow-missing"},
				RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
			},
		},
	}, ModeSave)
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), `unknown request class "flow-missing"`) {
		t.Fatalf("error = %q, want request class validation message", err.Error())
	}
}

func TestValidateGraphRejectsInvalidEdgeIntelligenceValues(t *testing.T) {
	err := ValidateGraph(domain.Graph{
		Nodes: []domain.Node{
			{
				ID:        "client-1",
				Label:     "Client",
				Archetype: domain.NodeArchetypeClient,
				Color:     "blue",
				Position:  domain.NodePosition{X: 0, Y: 0},
			},
			{
				ID:        "service-1",
				Label:     "Service",
				Archetype: domain.NodeArchetypeStatelessService,
				Color:     "green",
				Position:  domain.NodePosition{X: 100, Y: 0},
			},
		},
		Edges: []domain.Edge{
			{
				ID:              "edge-1",
				SourceNodeID:    "client-1",
				TargetNodeID:    "service-1",
				InteractionType: domain.EdgeInteractionSyncRequest,
				TimeoutMS:       -1,
				RetryAttempts:   -2,
				RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways, Value: -0.5},
			},
		},
	}, ModeSave)
	if err == nil {
		t.Fatal("expected validation error")
	}

	errorText := err.Error()
	if !strings.Contains(errorText, "timeout_ms cannot be negative") {
		t.Fatalf("error = %q, want timeout validation message", errorText)
	}
	if !strings.Contains(errorText, "retry_attempts cannot be negative") {
		t.Fatalf("error = %q, want retry validation message", errorText)
	}
	if !strings.Contains(errorText, "routing_rule.value cannot be negative") {
		t.Fatalf("error = %q, want routing weight validation message", errorText)
	}
}

func TestValidateGraphRejectsDisallowedArchetypeConnection(t *testing.T) {
	err := ValidateGraph(domain.Graph{
		Nodes: []domain.Node{
			{
				ID:        "cache-1",
				Label:     "Cache",
				Archetype: domain.NodeArchetypeCache,
				Color:     "amber",
				Position:  domain.NodePosition{X: 0, Y: 0},
			},
			{
				ID:        "gateway-1",
				Label:     "Gateway",
				Archetype: domain.NodeArchetypeGateway,
				Color:     "indigo",
				Position:  domain.NodePosition{X: 100, Y: 0},
			},
		},
		Edges: []domain.Edge{
			{
				ID:              "edge-1",
				SourceNodeID:    "cache-1",
				TargetNodeID:    "gateway-1",
				InteractionType: domain.EdgeInteractionSyncRequest,
				RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
			},
		},
	}, ModeSave)
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), `cannot connect source archetype "cache" to target archetype "gateway"`) {
		t.Fatalf("error = %q, want allowed connection validation message", err.Error())
	}
}

func TestValidateGraphAllowsQueueToWorkerConnection(t *testing.T) {
	err := ValidateGraph(domain.Graph{
		Nodes: []domain.Node{
			{
				ID:        "queue-1",
				Label:     "Queue",
				Archetype: domain.NodeArchetypeQueue,
				Color:     "orange",
				Position:  domain.NodePosition{X: 0, Y: 0},
			},
			{
				ID:        "worker-1",
				Label:     "Worker",
				Archetype: domain.NodeArchetypeWorker,
				Color:     "teal",
				Position:  domain.NodePosition{X: 100, Y: 0},
			},
		},
		Edges: []domain.Edge{
			{
				ID:              "edge-1",
				SourceNodeID:    "queue-1",
				TargetNodeID:    "worker-1",
				InteractionType: domain.EdgeInteractionConsume,
				RoutingRule:     domain.RoutingRule{RuleType: domain.RoutingRuleAlways},
			},
		},
	}, ModeSave)
	if err != nil {
		t.Fatalf("unexpected validation error = %v", err)
	}
}
