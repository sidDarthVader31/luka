package simulation

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

func newTestService(t *testing.T) *Service {
	t.Helper()
	repo := store.NewMemoryDesignRepository()
	if err := store.SeedSampleDesigns(context.Background(), repo); err != nil {
		t.Fatalf("SeedSampleDesigns() error = %v", err)
	}
	return NewService(repo, simulator.NewService())
}

func TestSimulateSeededDesign(t *testing.T) {
	result, err := newTestService(t).Simulate(context.Background(), domain.SimulateRequest{
		DesignID: store.SampleCacheAsideID,
		Workload: domain.Workload{
			RequestsPerSecond: 100000,
			ConcurrentUsers:   250000,
			ReadWriteRatio:    4,
			PayloadKB:         8,
			FanoutCount:       1,
		},
	})
	if err != nil {
		t.Fatalf("Simulate() error = %v", err)
	}

	if result == nil || result.Bottleneck == nil {
		t.Fatal("expected simulation result with bottleneck")
	}
	if len(result.Flows) != 1 {
		t.Fatalf("flows len = %d, want 1", len(result.Flows))
	}
	if result.Bottleneck.NodeID != "db-1" {
		t.Fatalf("bottleneck = %q, want db-1", result.Bottleneck.NodeID)
	}
}

func TestSimulateRejectsInvalidInlineGraph(t *testing.T) {
	_, err := newTestService(t).Simulate(context.Background(), domain.SimulateRequest{
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
		Workload: domain.Workload{RequestsPerSecond: 1000, PayloadKB: 2},
	})
	if !errors.Is(err, domain.ErrInvalid) {
		t.Fatalf("error = %v, want ErrInvalid", err)
	}
	if !strings.Contains(err.Error(), "exactly one client node is required") {
		t.Fatalf("error = %q, want client validation message", err.Error())
	}
}

func TestSimulateRejectsNegativeWorkloadValues(t *testing.T) {
	_, err := newTestService(t).Simulate(context.Background(), domain.SimulateRequest{
		DesignID: store.SampleCacheAsideID,
		Workload: domain.Workload{RequestsPerSecond: 1000, FanoutCount: -2},
	})
	if !errors.Is(err, domain.ErrInvalid) {
		t.Fatalf("error = %v, want ErrInvalid", err)
	}
	if !strings.Contains(err.Error(), "workload.fanout_count cannot be negative") {
		t.Fatalf("error = %q, want fanout validation message", err.Error())
	}
}

func TestSimulateUnknownDesignIsNotFound(t *testing.T) {
	_, err := newTestService(t).Simulate(context.Background(), domain.SimulateRequest{
		DesignID: "missing",
		Workload: domain.Workload{RequestsPerSecond: 1000},
	})
	if !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("error = %v, want ErrNotFound", err)
	}
}
