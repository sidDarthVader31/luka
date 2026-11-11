package designs

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/graphs"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	repo := store.NewMemoryDesignRepository()
	if err := store.SeedSampleDesigns(context.Background(), repo); err != nil {
		t.Fatalf("SeedSampleDesigns() error = %v", err)
	}
	return NewService(repo)
}

func TestCreateAndUpdateDesign(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	created, err := service.Create(ctx, domain.CreateDesignRequest{
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
	updated, err := service.Update(ctx, created.ID, domain.UpdateDesignRequest{
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
	service := newTestService(t)
	ctx := context.Background()

	_, err := service.Create(ctx, domain.CreateDesignRequest{
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
					InteractionType: domain.EdgeInteractionTypeSyncRequest,
					RoutingRule: domain.RoutingRule{
						RuleType: domain.RoutingRuleTypeAlways,
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
	service := newTestService(t)
	ctx := context.Background()

	duplicate, err := service.Duplicate(ctx, store.SampleCacheAsideID, domain.DuplicateDesignRequest{
		Name: "Sample Variant",
	})
	if err != nil {
		t.Fatalf("Duplicate() error = %v", err)
	}

	if duplicate.ID == "" || duplicate.ID == store.SampleCacheAsideID {
		t.Fatalf("duplicate id = %q, want new design id", duplicate.ID)
	}

	if duplicate.Name != "Sample Variant" {
		t.Fatalf("duplicate name = %q, want Sample Variant", duplicate.Name)
	}

	if len(duplicate.Graph.Nodes) == 0 {
		t.Fatal("expected duplicated graph nodes")
	}
}

func TestUpdateRejectsSamples(t *testing.T) {
	service := newTestService(t)
	name := "renamed"

	_, err := service.Update(context.Background(), store.SampleCacheAsideID, domain.UpdateDesignRequest{Name: &name})
	if !errors.Is(err, domain.ErrInvalid) {
		t.Fatalf("Update() error = %v, want ErrInvalid", err)
	}
}

func TestTemplatesAndListSeparation(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()

	templates, err := service.Templates(ctx)
	if err != nil {
		t.Fatalf("Templates() error = %v", err)
	}
	if len(templates) != len(store.SampleDesigns()) {
		t.Fatalf("templates len = %d, want %d", len(templates), len(store.SampleDesigns()))
	}

	items, err := service.List(ctx)
	if err != nil {
		t.Fatalf("List() error = %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("List() len = %d, want 0 (samples excluded)", len(items))
	}
}

func TestMissingDesignIsNotFound(t *testing.T) {
	service := newTestService(t)

	_, err := service.Get(context.Background(), "nope")
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get() error = %v, want ErrNotFound", err)
	}
}

func TestNewIDIsRandom(t *testing.T) {
	a, b := domain.NewID("des"), domain.NewID("des")
	if a == b || !strings.HasPrefix(a, "des_") {
		t.Fatalf("ids = %q, %q", a, b)
	}
}

func TestSceneRoundTrip(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	scene := json.RawMessage(`{"elements":[{"id":"a"}],"appState":{}}`)

	created, err := service.Create(ctx, domain.CreateDesignRequest{Name: "Scene", Scene: scene})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if string(created.Scene) != string(scene) {
		t.Fatalf("created scene = %s", created.Scene)
	}

	// An update without a scene keeps the stored one.
	name := "Renamed"
	updated, err := service.Update(ctx, created.ID, domain.UpdateDesignRequest{Name: &name})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	if string(updated.Scene) != string(scene) {
		t.Fatalf("scene lost on update without scene: %s", updated.Scene)
	}

	// An update with a scene replaces it.
	next := json.RawMessage(`{"elements":[]}`)
	updated, err = service.Update(ctx, created.ID, domain.UpdateDesignRequest{Scene: next})
	if err != nil {
		t.Fatalf("Update() error = %v", err)
	}
	got, err := service.Get(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if string(updated.Scene) != string(next) || string(got.Scene) != string(next) {
		t.Fatalf("scene not replaced: %s / %s", updated.Scene, got.Scene)
	}

	dup, err := service.Duplicate(ctx, created.ID, domain.DuplicateDesignRequest{})
	if err != nil {
		t.Fatalf("Duplicate() error = %v", err)
	}
	if string(dup.Scene) != string(next) {
		t.Fatalf("duplicate scene = %s", dup.Scene)
	}
}

func TestSceneTooLarge(t *testing.T) {
	service := newTestService(t)
	ctx := context.Background()
	big := json.RawMessage(`"` + strings.Repeat("x", MaxSceneBytes) + `"`)

	_, err := service.Create(ctx, domain.CreateDesignRequest{Name: "Big", Scene: big})
	if !errors.Is(err, domain.ErrInvalid) {
		t.Fatalf("Create() error = %v, want ErrInvalid", err)
	}

	created, err := service.Create(ctx, domain.CreateDesignRequest{Name: "Small"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.Update(ctx, created.ID, domain.UpdateDesignRequest{Scene: big}); !errors.Is(err, domain.ErrInvalid) {
		t.Fatalf("Update() error = %v, want ErrInvalid", err)
	}
}

func TestSamplesHaveComponentIDs(t *testing.T) {
	for _, sample := range store.SampleDesigns() {
		for _, n := range sample.Graph.Nodes {
			if n.ComponentID == "" {
				t.Errorf("%s/%s has no component_id", sample.ID, n.ID)
			}
		}
		if err := graphs.ValidateGraph(sample.Graph, graphs.ModeSave); err != nil {
			t.Errorf("%s: %v", sample.ID, err)
		}
	}
}
