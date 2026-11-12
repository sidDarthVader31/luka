package simulator

import (
	"math"
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// Golden tests: every expected number below is worked out by hand from
// docs/simulation-model.md and checked to 0.01.

const tol = 0.01

type P = domain.NodeProperties

const (
	kClient  = domain.NodeArchetypeClient
	kGateway = domain.NodeArchetypeGateway
	kService = domain.NodeArchetypeStatelessService
	kWorker  = domain.NodeArchetypeWorker
	kCache   = domain.NodeArchetypeCache
	kDB      = domain.NodeArchetypeDatabase
	kQueue   = domain.NodeArchetypeQueue
)

func nd(id string, kind domain.NodeArchetype, p P) domain.Node {
	return domain.Node{ID: id, Label: id, Archetype: kind, Properties: p}
}

func ed(from, to string, opts ...func(*domain.Edge)) domain.Edge {
	e := domain.Edge{ID: from + "->" + to, SourceNodeID: from, TargetNodeID: to}
	for _, o := range opts {
		o(&e)
	}
	return e
}

func reads(e *domain.Edge)  { e.Traffic = domain.EdgeTrafficReads }
func writes(e *domain.Edge) { e.Traffic = domain.EdgeTrafficWrites }
func async(e *domain.Edge)  { e.Mode = domain.EdgeModeAsync }
func weight(w float64) func(*domain.Edge) {
	return func(e *domain.Edge) { e.Weight = w }
}

// svc is a service with plenty of capacity: 1 instance of 1,000,000 req/s.
func svc(id string) domain.Node {
	return nd(id, kService, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 20, Availability: 0.999})
}

func run(t *testing.T, w domain.Workload, nodes []domain.Node, edges []domain.Edge) domain.SimulationResult {
	t.Helper()
	r, err := Run(domain.Graph{Nodes: nodes, Edges: edges}, w, catalog.Default())
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	return r
}

func node(t *testing.T, r domain.SimulationResult, id string) domain.NodeResult {
	t.Helper()
	for _, n := range r.Nodes {
		if n.NodeID == id {
			return n
		}
	}
	t.Fatalf("no node %q", id)
	return domain.NodeResult{}
}

func edge(t *testing.T, r domain.SimulationResult, id string) domain.EdgeResult {
	t.Helper()
	for _, e := range r.Edges {
		if e.EdgeID == id {
			return e
		}
	}
	t.Fatalf("no edge %q", id)
	return domain.EdgeResult{}
}

func near(t *testing.T, what string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > tol {
		t.Errorf("%s = %.4f, want %.4f", what, got, want)
	}
}

func nearPtr(t *testing.T, what string, got *float64, want float64) {
	t.Helper()
	if got == nil {
		t.Errorf("%s = nil, want %.4f", what, want)
		return
	}
	near(t, what, *got, want)
}

func traffic(t *testing.T, what string, got domain.Traffic, r, w float64) {
	t.Helper()
	near(t, what+" reads", got.Reads, r)
	near(t, what+" writes", got.Writes, w)
}

var w1000 = domain.Workload{RequestsPerSecond: 1000} // 900 reads, 100 writes

func TestClientEmission(t *testing.T) {
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), svc("s")}, []domain.Edge{ed("c", "s")})
	traffic(t, "client", node(t, r, "c").Demand, 900, 100) // 1000 × 0.9, 1000 × 0.1
	near(t, "read share default", *r.Workload.ReadShare, 0.9)
	near(t, "payload default", r.Workload.PayloadKB, 1)
	near(t, "reads demand", r.EndToEnd.Reads.DemandRPS, 900)
	near(t, "writes demand", r.EndToEnd.Writes.DemandRPS, 100)
}

func TestWritesOnlyWorkload(t *testing.T) {
	// An explicit 0 is a real value, not "use the default".
	r := run(t, domain.Workload{RequestsPerSecond: 1000, ReadShare: share(0)},
		[]domain.Node{nd("c", kClient, P{}), svc("s")}, []domain.Edge{ed("c", "s")})
	traffic(t, "client", node(t, r, "c").Demand, 0, 1000)
	near(t, "read share kept", *r.Workload.ReadShare, 0)
}

func TestMultiClientSplit(t *testing.T) {
	// Two connected clients share R; the unconnected one emits nothing.
	r := run(t, domain.Workload{RequestsPerSecond: 1000, ReadShare: share(0.8)},
		[]domain.Node{nd("c1", kClient, P{}), nd("c2", kClient, P{}), nd("c3", kClient, P{}), svc("s")},
		[]domain.Edge{ed("c1", "s"), ed("c2", "s")})
	traffic(t, "c1", node(t, r, "c1").Demand, 400, 100) // 500 × 0.8, 500 × 0.2
	traffic(t, "c2", node(t, r, "c2").Demand, 400, 100)
	traffic(t, "c3", node(t, r, "c3").Demand, 0, 0)
	traffic(t, "service", node(t, r, "s").Demand, 800, 200)
	near(t, "reads demand", r.EndToEnd.Reads.DemandRPS, 800)
}

func TestGatewayWeightedSplit(t *testing.T) {
	gw := nd("gw", kGateway, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 2, Availability: 0.999})
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), gw, svc("a"), svc("b")},
		[]domain.Edge{ed("c", "gw"), ed("gw", "a", weight(3)), ed("gw", "b", weight(1))})
	traffic(t, "a", node(t, r, "a").Demand, 675, 75) // 3/4 of 900 and 100
	traffic(t, "b", node(t, r, "b").Demand, 225, 25) // 1/4

	// With a filter, each class splits only across the edges carrying it.
	r = run(t, w1000, []domain.Node{nd("c", kClient, P{}), gw, svc("a"), svc("b")},
		[]domain.Edge{ed("c", "gw"), ed("gw", "a", reads), ed("gw", "b")})
	traffic(t, "a filtered", node(t, r, "a").Demand, 450, 0)
	traffic(t, "b filtered", node(t, r, "b").Demand, 450, 100)
}

func TestServiceFanOutAndEdgeFilters(t *testing.T) {
	r := run(t, w1000,
		[]domain.Node{nd("c", kClient, P{}), svc("s"), svc("all"), svc("r"), svc("w")},
		[]domain.Edge{ed("c", "s"), ed("s", "all"), ed("s", "r", reads), ed("s", "w", writes)})
	traffic(t, "all", edge(t, r, "s->all").Traffic, 900, 100) // every dependency gets every request
	traffic(t, "reads edge", edge(t, r, "s->r").Traffic, 900, 0)
	traffic(t, "writes edge", edge(t, r, "s->w").Traffic, 0, 100)
}

func TestCacheMissesPlusWrites(t *testing.T) {
	cache := nd("cache", kCache, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 1, CacheHitRate: 0.8, Availability: 0.999})
	db := nd("db", kDB, P{Shards: 1, CapacityRPS: 1e6, BaseLatencyMS: 10, Availability: 0.999})
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), svc("s"), cache, db},
		[]domain.Edge{ed("c", "s"), ed("s", "cache"), ed("cache", "db")})
	traffic(t, "db", node(t, r, "db").Demand, 180, 100) // 900 × (1 − 0.8), all 100 writes
}

func TestDatabasePrimaryReplicaShard(t *testing.T) {
	w := domain.Workload{RequestsPerSecond: 10000} // 9,000 reads, 1,000 writes
	for _, tc := range []struct {
		name          string
		shards, reps  int
		capacity, rho float64
	}{
		{"one primary", 1, 0, 5000, 2},                // (1,000 + 9,000) / 5,000
		{"two replicas", 1, 2, 5000, 0.8},             // (1,000 + 9,000/3) / 5,000 = 4,000 / 5,000
		{"two shards two replicas", 2, 2, 10000, 0.4}, // 4,000 / (2 × 5,000)
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := nd("db", kDB, P{Shards: tc.shards, ReadReplicas: tc.reps, CapacityRPS: 5000, BaseLatencyMS: 10, Availability: 0.999})
			r := run(t, w, []domain.Node{nd("c", kClient, P{}), svc("s"), db}, []domain.Edge{ed("c", "s"), ed("s", "db")})
			n := node(t, r, "db")
			near(t, "capacity", n.CapacityRPS, tc.capacity)
			near(t, "utilisation", n.Utilization, tc.rho)
			if tc.reps == 2 && tc.shards == 1 {
				want := []string{
					"primary load = 1,000 writes + 9,000 reads / 3 = 4,000 req/s",
					"primary capacity = 1 shard × 5,000 req/s = 5,000 req/s",
					"utilisation = 4,000 / 5,000 = 80%",
				}
				for _, line := range want {
					if !containsLine(n.Working, line) {
						t.Errorf("working %q missing line %q", n.Working, line)
					}
				}
			}
		})
	}
}

func containsLine(lines []string, want string) bool {
	for _, l := range lines {
		if l == want {
			return true
		}
	}
	return false
}

func TestQueueFanOutAsWrites(t *testing.T) {
	q := nd("q", kQueue, P{Replicas: 3, CapacityRPS: 50000, BaseLatencyMS: 5, Availability: 0.999})
	wk := func(id string) domain.Node {
		return nd(id, kWorker, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 50, Availability: 0.999})
	}
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), svc("s"), q, wk("w1"), wk("w2")},
		[]domain.Edge{ed("c", "s"), ed("s", "q", async), ed("q", "w1"), ed("q", "w2")})
	near(t, "queue utilisation", node(t, r, "q").Utilization, 1000.0/150000) // 1,000 msgs / (3 × 50,000)
	traffic(t, "w1", node(t, r, "w1").Demand, 0, 1000)                       // each consumer gets every message, as writes
	traffic(t, "w2", node(t, r, "w2").Demand, 0, 1000)
	if edge(t, r, "q->w1").Mode != domain.EdgeModeAsync {
		t.Error("edges out of a queue are async")
	}
}

func TestOverloadServedFraction(t *testing.T) {
	small := nd("s", kService, P{Replicas: 1, CapacityRPS: 500, BaseLatencyMS: 20, Availability: 0.999})
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), small, svc("down")},
		[]domain.Edge{ed("c", "s"), ed("s", "down")})
	n := node(t, r, "s")
	near(t, "utilisation", n.Utilization, 2) // 1,000 / 500
	if !n.Overloaded || n.LatencyP99MS != nil || n.LatencyP50MS != nil {
		t.Errorf("overloaded node must report no latency: %+v", n)
	}
	traffic(t, "served", n.Served, 450, 50) // 1/2 of demand
	traffic(t, "forwarded", node(t, r, "down").Demand, 450, 50)
	near(t, "reads served", r.EndToEnd.Reads.ServedRPS, 450)
	near(t, "success", r.EndToEnd.Reads.SuccessRate, 0.5)
	if r.EndToEnd.Reads.LatencyP99MS != nil {
		t.Error("end-to-end p99 through an overloaded node must be nil")
	}
}

func TestQuantile(t *testing.T) {
	for _, tc := range []struct{ s, rho, q, want float64 }{
		{10, 0, 0.99, 10},         // idle
		{10, 0.3, 0.5, 10},        // ln(0.6) < 0
		{10, 0.5, 0.5, 10},        // ln(1) = 0
		{10, 0.5, 0.99, 88.2405},  // 10 + 20 × ln(50)
		{10, 0.8, 0.5, 33.5002},   // 10 + 50 × ln(1.6)
		{10, 0.8, 0.99, 229.1013}, // 10 + 50 × ln(80)
	} {
		nearPtr(t, "quantile", Quantile(tc.s, tc.rho, tc.q), tc.want)
	}
	for _, rho := range []float64{1, 1.5} {
		if Quantile(10, rho, 0.99) != nil {
			t.Errorf("rho %v: want nil", rho)
		}
	}
}

func TestEndToEndSequentialSum(t *testing.T) {
	s := nd("s", kService, P{Replicas: 1, CapacityRPS: 1000, BaseLatencyMS: 20, Availability: 0.999})
	db := nd("db", kDB, P{Shards: 1, CapacityRPS: 1000, BaseLatencyMS: 10, Availability: 0.999})
	r := run(t, domain.Workload{RequestsPerSecond: 100}, []domain.Node{nd("c", kClient, P{}), s, db},
		[]domain.Edge{ed("c", "s"), ed("s", "db")})
	// ρ = 0.1 at both: p50 = S; p99 = S + S/0.9 × ln(10).
	nearPtr(t, "p50", r.EndToEnd.Reads.LatencyP50MS, 30)       // 20 + 10
	nearPtr(t, "p99", r.EndToEnd.Reads.LatencyP99MS, 106.7528) // 71.1686 + 35.5843
}

func TestBranchQuantileRule(t *testing.T) {
	build := func(hit float64) domain.SimulationResult {
		cache := nd("cache", kCache, P{Replicas: 1, CapacityRPS: 1e9, BaseLatencyMS: 1, CacheHitRate: hit, Availability: 0.999})
		db := nd("db", kDB, P{Shards: 1, CapacityRPS: 1e9, BaseLatencyMS: 10, Availability: 0.999})
		return run(t, w1000, []domain.Node{nd("c", kClient, P{}), svc("s"), cache, db},
			[]domain.Edge{ed("c", "s"), ed("s", "cache"), ed("cache", "db")})
	}
	// Loads are tiny, so every node's quantile is its base latency.
	r := build(0.95) // miss 5%: in p99 (> 1%), not in p50 (≤ 50%)
	nearPtr(t, "p50 h=0.95", r.EndToEnd.Reads.LatencyP50MS, 21)
	nearPtr(t, "p99 h=0.95", r.EndToEnd.Reads.LatencyP99MS, 31)
	nearPtr(t, "writes always reach the db", r.EndToEnd.Writes.LatencyP50MS, 31)
	r = build(0.995) // miss 0.5%: not in p99
	nearPtr(t, "p99 h=0.995", r.EndToEnd.Reads.LatencyP99MS, 21)

	gw := nd("gw", kGateway, P{Replicas: 1, CapacityRPS: 1e9, BaseLatencyMS: 2, Availability: 0.999})
	slow := nd("slow", kService, P{Replicas: 1, CapacityRPS: 1e9, BaseLatencyMS: 100, Availability: 0.999})
	branches := func(slowWeight float64) domain.SimulationResult {
		return run(t, w1000, []domain.Node{nd("c", kClient, P{}), gw, svc("fast"), slow},
			[]domain.Edge{ed("c", "gw"), ed("gw", "fast", weight(1)), ed("gw", "slow", weight(slowWeight))})
	}
	r = branches(1) // 50/50: no branch passes p > 0.5, so the slowest is used
	nearPtr(t, "gateway p50 50/50", r.EndToEnd.Reads.LatencyP50MS, 102)
	nearPtr(t, "gateway p99 50/50", r.EndToEnd.Reads.LatencyP99MS, 102)
	r = branches(1.0 / 199) // slow branch p = 0.005: out of p99 and p50
	nearPtr(t, "gateway p99 rare slow", r.EndToEnd.Reads.LatencyP99MS, 22)
	nearPtr(t, "gateway p50 rare slow", r.EndToEnd.Reads.LatencyP50MS, 22)
}

func TestBackpressureThroughOverloadedDatabase(t *testing.T) {
	db := nd("db", kDB, P{Shards: 1, CapacityRPS: 500, BaseLatencyMS: 10, Availability: 0.999})
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), svc("s"), db}, []domain.Edge{ed("c", "s"), ed("s", "db")})
	near(t, "db utilisation", node(t, r, "db").Utilization, 2) // 1,000 / 500
	traffic(t, "service serves everything itself", node(t, r, "s").Served, 900, 100)
	near(t, "reads served end to end", r.EndToEnd.Reads.ServedRPS, 450) // 900 × 1/2
	near(t, "writes served end to end", r.EndToEnd.Writes.ServedRPS, 50)

	// With a cache: reads success = h + (1−h) × σ_db; writes = σ_db.
	cache := nd("cache", kCache, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 1, CacheHitRate: 0.8, Availability: 0.999})
	db = nd("db", kDB, P{Shards: 1, CapacityRPS: 140, BaseLatencyMS: 10, Availability: 0.999})
	r = run(t, w1000, []domain.Node{nd("c", kClient, P{}), svc("s"), cache, db},
		[]domain.Edge{ed("c", "s"), ed("s", "cache"), ed("cache", "db")})
	near(t, "db utilisation", node(t, r, "db").Utilization, 2)  // (100 + 180) / 140
	near(t, "reads success", r.EndToEnd.Reads.SuccessRate, 0.9) // 0.8 + 0.2 × 0.5
	near(t, "reads served", r.EndToEnd.Reads.ServedRPS, 810)
	near(t, "writes success", r.EndToEnd.Writes.SuccessRate, 0.5)
}

func TestAvailability(t *testing.T) {
	s2 := nd("s", kService, P{Replicas: 2, CapacityRPS: 1e6, BaseLatencyMS: 20, Availability: 0.999})
	db := nd("db", kDB, P{Shards: 2, ReadReplicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 10, Availability: 0.999})
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), s2, db}, []domain.Edge{ed("c", "s"), ed("s", "db")})
	near(t, "client", node(t, r, "c").Availability, 1)
	if got, want := node(t, r, "s").Availability, 1-0.001*0.001; math.Abs(got-want) > 1e-12 {
		t.Errorf("instances: %v, want %v", got, want) // 0.999999
	}
	if got, want := node(t, r, "db").Availability, (1-0.001*0.001)*(1-0.001*0.001); math.Abs(got-want) > 1e-12 {
		t.Errorf("shards with replicas: %v, want %v", got, want) // (1 − 0.001²)² = 0.999998
	}

	// Series: 0.999999 × 0.999 (single-instance database).
	db1 := nd("db", kDB, P{Shards: 1, CapacityRPS: 1e6, BaseLatencyMS: 10, Availability: 0.999})
	r = run(t, w1000, []domain.Node{nd("c", kClient, P{}), s2, db1}, []domain.Edge{ed("c", "s"), ed("s", "db")})
	if got, want := r.EndToEnd.Reads.Availability, 0.999999*0.999; math.Abs(got-want) > 1e-12 {
		t.Errorf("series: %v, want %v", got, want)
	}

	// Gateway average: 0.99 × (0.5 × 0.9 + 0.5 × 0.99) = 0.93555.
	gw := nd("gw", kGateway, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 2, Availability: 0.99})
	a := nd("a", kService, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 20, Availability: 0.9})
	b := nd("b", kService, P{Replicas: 1, CapacityRPS: 1e6, BaseLatencyMS: 20, Availability: 0.99})
	r = run(t, w1000, []domain.Node{nd("c", kClient, P{}), gw, a, b},
		[]domain.Edge{ed("c", "gw"), ed("gw", "a"), ed("gw", "b")})
	if got := r.EndToEnd.Writes.Availability; math.Abs(got-0.93555) > 1e-9 {
		t.Errorf("gateway average: %v, want 0.93555", got)
	}
}

func TestEstimates(t *testing.T) {
	db := nd("db", kDB, P{Shards: 1, CapacityRPS: 1e6, BaseLatencyMS: 10, Availability: 0.999})
	r := run(t, domain.Workload{RequestsPerSecond: 1000, PayloadKB: 2},
		[]domain.Node{nd("c", kClient, P{}), svc("s"), db}, []domain.Edge{ed("c", "s"), ed("s", "db")})
	near(t, "bandwidth", r.Estimates.BandwidthMBPerSec, 1.9531)   // 1,000 × 2 / 1024
	near(t, "storage/day", r.Estimates.StorageGBPerDay, 16.4795)  // 100 × 2 × 86,400 / 1024²
	near(t, "storage/year", r.Estimates.StorageTBPerYear, 5.8740) // 16.4795 × 365 / 1024
	if len(r.Estimates.Working) != 4 {
		t.Errorf("estimates working = %q", r.Estimates.Working)
	}
}

func TestBottleneckTieBreak(t *testing.T) {
	half := func(id string) domain.Node {
		return nd(id, kService, P{Replicas: 1, CapacityRPS: 2000, BaseLatencyMS: 20, Availability: 0.999})
	}
	// Same utilisation at the same depth: the smaller id is earlier in topological order.
	r := run(t, w1000, []domain.Node{nd("c", kClient, P{}), half("b-svc"), half("a-svc")},
		[]domain.Edge{ed("c", "b-svc"), ed("c", "a-svc")})
	if r.BottleneckNodeID != "a-svc" {
		t.Errorf("bottleneck = %q, want a-svc", r.BottleneckNodeID)
	}
	// Topological order beats id: z-gw comes before a-svc.
	gw := nd("z-gw", kGateway, P{Replicas: 1, CapacityRPS: 2000, BaseLatencyMS: 2, Availability: 0.999})
	r = run(t, w1000, []domain.Node{nd("c", kClient, P{}), gw, half("a-svc")},
		[]domain.Edge{ed("c", "z-gw"), ed("z-gw", "a-svc")})
	if r.BottleneckNodeID != "z-gw" {
		t.Errorf("bottleneck = %q, want z-gw", r.BottleneckNodeID)
	}
	if r.Nodes[0].NodeID != "c" || r.Nodes[1].NodeID != "z-gw" {
		t.Errorf("nodes not in topological order: %v, %v", r.Nodes[0].NodeID, r.Nodes[1].NodeID)
	}
}

func TestDefaultsAndDeterminism(t *testing.T) {
	// Only component ids: every property comes from the catalog.
	nodes := []domain.Node{
		{ID: "c", Label: "Client", Archetype: kClient, ComponentID: "client"},
		{ID: "s", Label: "Service", Archetype: kService, ComponentID: "service"},
		{ID: "db", Label: "DB", Archetype: kDB, ComponentID: "postgres"},
	}
	edges := []domain.Edge{ed("c", "s"), ed("s", "db")}
	a := run(t, w1000, nodes, edges)
	near(t, "service capacity from catalog", node(t, a, "s").CapacityRPS, 10000) // 2 × 5,000
	near(t, "db capacity from catalog", node(t, a, "db").CapacityRPS, 5000)

	// Input order does not change the output.
	b := run(t, w1000, []domain.Node{nodes[2], nodes[0], nodes[1]}, edges)
	for i := range a.Nodes {
		if a.Nodes[i].NodeID != b.Nodes[i].NodeID || strings.Join(a.Nodes[i].Working, "|") != strings.Join(b.Nodes[i].Working, "|") {
			t.Fatalf("order-dependent result at %d", i)
		}
	}
}

func TestRunRejects(t *testing.T) {
	cat := catalog.Default()
	g := domain.Graph{Nodes: []domain.Node{nd("c", kClient, P{}), svc("a"), svc("b")},
		Edges: []domain.Edge{ed("c", "a"), ed("a", "b"), ed("b", "a")}}
	if _, err := Run(g, w1000, cat); err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Errorf("cycle: err = %v", err)
	}
	if _, err := Run(domain.Graph{Nodes: []domain.Node{nd("c", kClient, P{})}}, w1000, cat); err == nil {
		t.Error("unconnected client: want error")
	}
	if _, err := Run(g, domain.Workload{}, cat); err == nil {
		t.Error("zero rps: want error")
	}
}

func TestNumberFormatting(t *testing.T) {
	for in, want := range map[float64]string{4000: "4,000", 1234567.891: "1,234,567.89", 0.126: "0.13", 80: "80", -1500: "-1,500"} {
		if got := num(in); got != want {
			t.Errorf("num(%v) = %q, want %q", in, got, want)
		}
	}
	if got := pct(0.8); got != "80%" {
		t.Errorf("pct = %q", got)
	}
}

func share(v float64) *float64 { return &v }
