package runs

import (
	"strings"
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
			ConcurrentUsers:   250000,
			ReadWriteRatio:    4,
			PayloadKB:         8,
			FanoutCount:       1,
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

func TestCreateRunRejectsInvalidInlineGraph(t *testing.T) {
	service := NewService(
		store.NewMemoryDesignRepository(),
		store.NewMemoryRunRepository(),
		simulator.NewService(),
	)

	_, err := service.Create(domain.CreateRunRequest{
		Design: &domain.Design{
			ID:   "adhoc",
			Name: "Broken Inline Design",
			Graph: domain.Graph{
				Nodes: []domain.Node{
					{
						ID:        "service-1",
						Label:     "Service",
						Archetype: domain.NodeArchetypeStatelessService,
						Color:     "green",
						Position:  domain.NodePosition{X: 10, Y: 10},
					},
				},
			},
		},
		Workload: domain.Workload{
			RequestsPerSecond: 1000,
			PayloadKB:         2,
		},
		SimulationConfig: domain.SimulationConfig{
			Mode: domain.SimulationModeAnalytical,
		},
	})
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), "exactly one client node is required") {
		t.Fatalf("error = %q, want client validation message", err.Error())
	}
}

func TestCreateRunRejectsNegativeWorkloadValues(t *testing.T) {
	service := NewService(
		store.NewMemoryDesignRepository(),
		store.NewMemoryRunRepository(),
		simulator.NewService(),
	)

	_, err := service.Create(domain.CreateRunRequest{
		DesignID: store.SampleDesignID,
		Workload: domain.Workload{
			RequestsPerSecond: 1000,
			FanoutCount:       -2,
		},
		SimulationConfig: domain.SimulationConfig{
			Mode: domain.SimulationModeAnalytical,
		},
	})
	if err == nil {
		t.Fatal("expected validation error")
	}

	if !strings.Contains(err.Error(), "workload.fanout_count cannot be negative") {
		t.Fatalf("error = %q, want fanout validation message", err.Error())
	}
}

func TestListRunsByDesign(t *testing.T) {
	service := NewService(
		store.NewMemoryDesignRepository(),
		store.NewMemoryRunRepository(),
		simulator.NewService(),
	)

	firstRun, err := service.Create(domain.CreateRunRequest{
		DesignID: store.SampleDesignID,
		Workload: domain.Workload{
			RequestsPerSecond: 1000,
		},
		SimulationConfig: domain.SimulationConfig{
			Mode: domain.SimulationModeAnalytical,
		},
	})
	if err != nil {
		t.Fatalf("Create() first run error = %v", err)
	}

	secondRun, err := service.Create(domain.CreateRunRequest{
		DesignID: store.SampleDesignID,
		Workload: domain.Workload{
			RequestsPerSecond: 2000,
		},
		SimulationConfig: domain.SimulationConfig{
			Mode: domain.SimulationModeAnalytical,
		},
	})
	if err != nil {
		t.Fatalf("Create() second run error = %v", err)
	}

	runs, err := service.ListByDesign(store.SampleDesignID)
	if err != nil {
		t.Fatalf("ListByDesign() error = %v", err)
	}

	if len(runs) != 2 {
		t.Fatalf("runs len = %d, want 2", len(runs))
	}

	if runs[0].ID != secondRun.ID {
		t.Fatalf("first returned run = %q, want latest run %q", runs[0].ID, secondRun.ID)
	}

	if runs[1].ID != firstRun.ID {
		t.Fatalf("second returned run = %q, want first run %q", runs[1].ID, firstRun.ID)
	}
}
