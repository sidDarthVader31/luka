package designs

import (
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
