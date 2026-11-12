package review

import (
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
)

type P = domain.NodeProperties

func nd(id string, kind domain.NodeArchetype, p P) domain.Node {
	return domain.Node{ID: id, Label: id, Archetype: kind, Properties: p}
}

func ed(from, to string, mode domain.EdgeMode) domain.Edge {
	return domain.Edge{ID: from + "-" + to, SourceNodeID: from, TargetNodeID: to, Mode: mode}
}

const sync, async = domain.EdgeModeSync, domain.EdgeModeAsync

var (
	client = nd("client", domain.NodeArchetypeClient, P{})
	// svc has two instances and plenty of capacity.
	svc   = nd("svc", domain.NodeArchetypeStatelessService, P{Replicas: 2, CapacityRPS: 1e6, BaseLatencyMS: 20})
	cache = nd("cache", domain.NodeArchetypeCache, P{Replicas: 2, CapacityRPS: 1e6, BaseLatencyMS: 1, CacheHitRate: 0.9})
	db    = nd("db", domain.NodeArchetypeDatabase, P{Shards: 1, ReadReplicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 10})
)

func with(n domain.Node, f func(p *P)) domain.Node {
	f(&n.Properties)
	return n
}

func TestRules(t *testing.T) {
	w := domain.Workload{RequestsPerSecond: 1000} // 900 reads, 100 writes
	healthy := []domain.Node{client, svc, cache, db}
	healthyEdges := []domain.Edge{ed("client", "svc", sync), ed("svc", "cache", sync), ed("cache", "db", sync)}

	cases := []struct {
		name     string
		workload domain.Workload
		nodes    []domain.Node
		edges    []domain.Edge
		rule     string
		node     string
		fix      string // substring of the detail; empty: the rule must not fire
	}{
		{"overloaded service", w, []domain.Node{client, with(svc, func(p *P) { p.Replicas, p.CapacityRPS = 1, 500 }), cache, db}, healthyEdges,
			RuleOverloadedNode, "svc", "Scale svc to 3 instances"}, // 1,000 / (500 × 0.8) = 2.5 → 3
		{"overloaded database, reads", domain.Workload{RequestsPerSecond: 10000}, []domain.Node{client, svc, with(db, func(p *P) { p.ReadReplicas, p.CapacityRPS = 0, 5000 })},
			[]domain.Edge{ed("client", "svc", sync), ed("svc", "db", sync)},
			RuleOverloadedNode, "db", "Add read replicas (2 per shard"}, // 9,000 / (4,000 − 1,000) − 1 = 2
		{"no overload", w, healthy, healthyEdges, RuleOverloadedNode, "svc", ""},
		{"near capacity", w, []domain.Node{client, with(svc, func(p *P) { p.CapacityRPS = 550 }), cache, db}, healthyEdges,
			RuleNearCapacity, "svc", "Scale svc to 3 instances"}, // 1,000 / 1,100 = 91%
		{"at 80% is fine", w, []domain.Node{client, with(svc, func(p *P) { p.CapacityRPS = 625 }), cache, db}, healthyEdges,
			RuleNearCapacity, "svc", ""},
		{"single instance service", w, []domain.Node{client, with(svc, func(p *P) { p.Replicas = 1 }), cache, db}, healthyEdges,
			RuleSinglePointOfFailure, "svc", "at least 2 instances"},
		{"database without replicas", w, []domain.Node{client, svc, cache, with(db, func(p *P) { p.ReadReplicas = 0 })}, healthyEdges,
			RuleSinglePointOfFailure, "db", "Add a read replica"},
		{"async consumer is not on the sync path", w,
			[]domain.Node{client, svc, nd("q", domain.NodeArchetypeQueue, P{Replicas: 2, CapacityRPS: 1e6}), nd("worker", domain.NodeArchetypeWorker, P{Replicas: 1, CapacityRPS: 1e6})},
			[]domain.Edge{ed("client", "svc", sync), ed("svc", "q", async), ed("q", "worker", async)},
			RuleSinglePointOfFailure, "worker", ""},
		{"writes exceed primary", domain.Workload{RequestsPerSecond: 10000, ReadShare: share(0.5)}, []domain.Node{client, svc, with(db, func(p *P) { p.CapacityRPS = 4000 })},
			[]domain.Edge{ed("client", "svc", sync), ed("svc", "db", sync)},
			RuleWritesExceedPrimary, "db", "at least 2 shards"}, // 5,000 writes / (0.8 × 4,000) = 1.56 → 2
		{"writes within primary", w, healthy, healthyEdges, RuleWritesExceedPrimary, "db", ""},
		{"read heavy without cache", w, []domain.Node{client, svc, db}, []domain.Edge{ed("client", "svc", sync), ed("svc", "db", sync)},
			RuleReadHeavyWithoutCache, "db", "Route reads through a cache"},
		{"read heavy with cache", w, healthy, healthyEdges, RuleReadHeavyWithoutCache, "db", ""},
		{"write heavy without cache", domain.Workload{RequestsPerSecond: 1000, ReadShare: share(0.5)}, []domain.Node{client, svc, db},
			[]domain.Edge{ed("client", "svc", sync), ed("svc", "db", sync)}, RuleReadHeavyWithoutCache, "db", ""},
		{"queue without consumer", w, []domain.Node{client, svc, nd("q", domain.NodeArchetypeQueue, P{Replicas: 2, CapacityRPS: 1e6})},
			[]domain.Edge{ed("client", "svc", sync), ed("svc", "q", async)},
			RuleQueueWithoutConsumer, "q", "Connect a worker"},
		{"unconnected node", w, append(append([]domain.Node{}, healthy...), nd("spare", domain.NodeArchetypeCache, P{Replicas: 2})), healthyEdges,
			RuleUnconnectedNode, "spare", "Connect spare to the design or delete it"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			graph := domain.Graph{Nodes: tc.nodes, Edges: tc.edges}
			result, err := simulator.Run(graph, tc.workload, catalog.Default())
			if err != nil {
				t.Fatal(err)
			}
			var hit *domain.Finding
			for _, f := range Analyze(graph, result) {
				if f.RuleID == tc.rule && len(f.NodeIDs) == 1 && f.NodeIDs[0] == tc.node {
					f := f
					hit = &f
				}
			}
			if tc.fix == "" {
				if hit != nil {
					t.Fatalf("rule fired unexpectedly: %+v", *hit)
				}
				return
			}
			if hit == nil {
				t.Fatalf("rule %s did not fire for %s", tc.rule, tc.node)
			}
			if !strings.Contains(hit.Detail, tc.fix) {
				t.Fatalf("detail %q, want it to contain %q", hit.Detail, tc.fix)
			}
		})
	}
}

func TestHealthyDesignHasNoFindings(t *testing.T) {
	graph := domain.Graph{Nodes: []domain.Node{client, svc, cache, db},
		Edges: []domain.Edge{ed("client", "svc", sync), ed("svc", "cache", sync), ed("cache", "db", sync)}}
	result, err := simulator.Run(graph, domain.Workload{RequestsPerSecond: 1000}, catalog.Default())
	if err != nil {
		t.Fatal(err)
	}
	if got := Analyze(graph, result); len(got) != 0 {
		t.Fatalf("findings = %+v", got)
	}
}

func TestSeverities(t *testing.T) {
	graph := domain.Graph{Nodes: []domain.Node{client, with(svc, func(p *P) { p.Replicas, p.CapacityRPS = 1, 500 }), db},
		Edges: []domain.Edge{ed("client", "svc", sync), ed("svc", "db", sync)}}
	result, _ := simulator.Run(graph, domain.Workload{RequestsPerSecond: 1000}, catalog.Default())
	want := map[string]domain.FindingSeverity{
		RuleOverloadedNode: domain.FindingSeverityError, RuleSinglePointOfFailure: domain.FindingSeverityWarning,
		RuleReadHeavyWithoutCache: domain.FindingSeverityInfo,
	}
	got := Analyze(graph, result)
	if len(got) != 3 {
		t.Fatalf("findings = %+v", got)
	}
	for i, rule := range []string{RuleOverloadedNode, RuleSinglePointOfFailure, RuleReadHeavyWithoutCache} {
		if got[i].RuleID != rule || got[i].Severity != want[rule] {
			t.Errorf("finding %d = %s/%s, want %s/%s", i, got[i].RuleID, got[i].Severity, rule, want[rule])
		}
	}
}

func share(v float64) *float64 { return &v }
