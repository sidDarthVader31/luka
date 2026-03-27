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
