package designs

import (
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

func TestCreateAndUpdateDesign(t *testing.T) {
	service := NewService(store.NewMemoryDesignRepository())

	created, err := service.Create(domain.CreateDesignRequest{
		Name:        "My Design",
		Description: "first pass",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{
					ID:        "client-1",
					Label:     "Client",
					Archetype: domain.NodeArchetypeClient,
					Color:     "blue",
					Position: domain.NodePosition{
						X: 80,
						Y: 120,
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if created.ID == "" {
		t.Fatal("expected created design id")
	}

	newName := "My Updated Design"
	updated, err := service.Update(created.ID, domain.UpdateDesignRequest{
		Name: &newName,
	})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}

	if updated.Name != newName {
		t.Fatalf("updated name = %q, want %q", updated.Name, newName)
	}
}

func TestCreateRejectsInvalidGraph(t *testing.T) {
	service := NewService(store.NewMemoryDesignRepository())

	_, err := service.Create(domain.CreateDesignRequest{
		Name: "Broken Design",
		Graph: domain.Graph{
			Nodes: []domain.Node{
				{
					ID:        "service-1",
					Label:     "Service",
					Archetype: domain.NodeArchetypeStatelessService,
					Color:     "green",
					Position:  domain.NodePosition{X: 80, Y: 120},
				},
			},
			Edges: []domain.Edge{
				{
					ID:              "edge-1",
					SourceNodeID:    "service-1",
					TargetNodeID:    "missing-db",
					InteractionType: domain.EdgeInteractionSyncRequest,
					RoutingRule: domain.RoutingRule{
						RuleType: domain.RoutingRuleAlways,
					},
				},
			},
		},
	})
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), `unknown target node "missing-db"`) {
		t.Fatalf("error = %q, want unknown target validation message", err.Error())
	}
}

func TestDuplicateDesign(t *testing.T) {
	service := NewService(store.NewMemoryDesignRepository())

	duplicate, err := service.Duplicate(store.SampleDesignID, domain.DuplicateDesignRequest{
		Name: "Sample Variant",
	})
	if err != nil {
		t.Fatalf("Duplicate() error = %v", err)
	}

	if duplicate.ID == "" || duplicate.ID == store.SampleDesignID {
		t.Fatalf("duplicate id = %q, want new design id", duplicate.ID)
	}

	if duplicate.Name != "Sample Variant" {
		t.Fatalf("duplicate name = %q, want Sample Variant", duplicate.Name)
	}

	if len(duplicate.Graph.Nodes) == 0 {
		t.Fatal("expected duplicated graph nodes")
	}
}
