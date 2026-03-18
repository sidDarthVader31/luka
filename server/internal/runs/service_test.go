package runs

import (
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

func TestCreateRunWithSeededDesign(t *testing.T) {
	service := NewService(
		store.NewMemoryDesignRepository(),
		store.NewMemoryRunRepository(),
		simulator.NewService(),
	)

	run, err := service.Create(domain.CreateRunRequest{
		DesignID: store.SampleDesignID,
		Workload: domain.Workload{
			RequestsPerSecond: 100000,
		},
		SimulationConfig: domain.SimulationConfig{
			Mode: domain.SimulationModeAnalytical,
		},
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}

	if run.DesignID != store.SampleDesignID {
		t.Fatalf("DesignID = %q, want %q", run.DesignID, store.SampleDesignID)
	}

	if run.Result == nil || run.Result.Bottleneck == nil {
		t.Fatal("expected simulation result with bottleneck")
	}

	if run.Result.Bottleneck.NodeID != "db-1" {
		t.Fatalf("bottleneck = %q, want db-1", run.Result.Bottleneck.NodeID)
	}
}
