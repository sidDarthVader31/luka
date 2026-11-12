package simulation

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
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

func TestSimulateSeededDesigns(t *testing.T) {
	for _, id := range []string{store.SampleCacheAsideID, store.SampleQueueWorkflowID} {
		result, err := newTestService(t).Simulate(context.Background(), domain.SimulateRequest{
			DesignID: id,
			Workload: &domain.Workload{RequestsPerSecond: 10000},
		})
		if err != nil {
			t.Fatalf("%s: Simulate() error = %v", id, err)
		}
		if len(result.Nodes) == 0 || result.BottleneckNodeID == "" {
			t.Fatalf("%s: expected nodes and a bottleneck, got %+v", id, result)
		}
		if *result.Workload.ReadShare != 0.9 || result.Workload.PayloadKB != 1 {
			t.Fatalf("%s: workload defaults not applied: %+v", id, result.Workload)
		}
	}
}

func TestSimulateWarnsAboutUnconnectedNodes(t *testing.T) {
	design := domain.Design{Graph: domain.Graph{
		Nodes: []domain.Node{
			{ID: "c", Label: "Client", Archetype: domain.NodeArchetypeClient},
			{ID: "s", Label: "Service", Archetype: domain.NodeArchetypeStatelessService},
			{ID: "x", Label: "Spare", Archetype: domain.NodeArchetypeCache},
		},
		Edges: []domain.Edge{{ID: "e", SourceNodeID: "c", TargetNodeID: "s"}},
	}}
	result, err := newTestService(t).Simulate(context.Background(), domain.SimulateRequest{
		Design: &design, Workload: &domain.Workload{RequestsPerSecond: 100},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Warnings) != 1 || !strings.Contains(result.Warnings[0], "Spare") {
		t.Fatalf("warnings = %v", result.Warnings)
	}
}

func TestSimulateErrors(t *testing.T) {
	inlineNoClient := &domain.Design{Graph: domain.Graph{Nodes: []domain.Node{
		{ID: "s", Label: "Service", Archetype: domain.NodeArchetypeStatelessService},
	}}}
	cases := []struct {
		name string
		req  domain.SimulateRequest
		want error
		msg  string
	}{
		{"no design", domain.SimulateRequest{Workload: &domain.Workload{RequestsPerSecond: 1}}, domain.ErrInvalid, "exactly one of"},
		{"no workload", domain.SimulateRequest{DesignID: store.SampleCacheAsideID}, domain.ErrInvalid, "workload is required"},
		{"zero rps", domain.SimulateRequest{DesignID: store.SampleCacheAsideID, Workload: &domain.Workload{}}, domain.ErrInvalid, "requests_per_second"},
		{"bad read share", domain.SimulateRequest{DesignID: store.SampleCacheAsideID, Workload: &domain.Workload{RequestsPerSecond: 1, ReadShare: share(1.5)}}, domain.ErrInvalid, "read_share"},
		{"no client", domain.SimulateRequest{Design: inlineNoClient, Workload: &domain.Workload{RequestsPerSecond: 1}}, domain.ErrInvalid, "client"},
		{"unknown problem", domain.SimulateRequest{Design: &domain.Design{ProblemID: "nope"}}, domain.ErrInvalid, "unknown problem"},
		{"unknown design", domain.SimulateRequest{DesignID: "missing", Workload: &domain.Workload{RequestsPerSecond: 1}}, domain.ErrNotFound, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := newTestService(t).Simulate(context.Background(), tc.req)
			if !errors.Is(err, tc.want) || !strings.Contains(err.Error(), tc.msg) {
				t.Fatalf("error = %v, want %v containing %q", err, tc.want, tc.msg)
			}
		})
	}
}

func share(v float64) *float64 { return &v }
