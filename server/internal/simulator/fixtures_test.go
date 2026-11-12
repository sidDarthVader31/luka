package simulator

import (
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// loadFixture reads a testdata file holding a POST /api/v1/simulate body, so the
// same file can be sent with curl.
func loadFixture(t *testing.T, name string) domain.SimulationResult {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var req domain.SimulateRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		t.Fatal(err)
	}
	r, err := Run(req.Design.Graph, *req.Workload, catalog.Default())
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func nearAvail(t *testing.T, what string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("%s = %.10f, want %.10f", what, got, want)
	}
}

// URL shortener: client → LB → svc-a, svc-b (equal weight) → Redis → Postgres.
// Workload 10,000 req/s, 90% reads: 9,000 reads + 1,000 writes.
//
// Traffic and utilisation:
//
//	LB        10,000 / (2 × 25,000)                 = 20%
//	svc-a, b  each 4,500 reads + 500 writes; 5,000 / (2 × 5,000) = 50%
//	Redis     9,000 + 1,000 = 10,000 / (2 × 50,000) = 10%; forwards 9,000 × 0.1 = 900 reads + 1,000 writes
//	Postgres  primary load 1,000 + 900 / 3 = 1,300; 1,300 / 5,000 = 26%
//
// Per-node latency, S + max(0, S/(1−ρ) · ln(ρ/(1−q))):
//
//	LB        p50 2 (ρ ≤ 0.5)   p99 2 + 2/0.8 · ln(20)    = 9.4893
//	service   p50 20 (ln 1 = 0) p99 20 + 40 · ln(50)      = 176.4809
//	Redis     p50 1             p99 1 + 1/0.9 · ln(10)    = 3.5584
//	Postgres  p50 10            p99 10 + 10/0.74 · ln(26) = 54.0283
//
// End to end:
//
//	reads p50  = 2 + 20 (50/50 branches: slowest) + 1 = 23 (miss 10% ≤ 50%: Postgres left out)
//	reads p99  = 9.4893 + 176.4809 + 3.5584 + 54.0283 = 243.5570 (miss 10% > 1%: Postgres included)
//	writes p50 = 2 + 20 + 1 + 10 = 33
//	writes p99 = 243.5570
//	success 100%; served 9,000 reads and 1,000 writes
//	availability: LB, services and Redis have 2 instances, 1 − 0.001² = 0.999999;
//	  Postgres 1 − 0.001³ = 0.999999999; reads = 0.999999 × (0.999999 × 0.999999 × 0.999999999)
//	  = 0.9999969990
//	bandwidth 10,000 × 1 / 1024 = 9.7656 MB/s; storage 1,000 × 86,400 / 1024² = 82.3975 GB/day,
//	  × 365 / 1024 = 29.3702 TB/year
//	bottleneck: svc-a and svc-b tie at 50%; svc-a is earlier in topological order
func TestURLShortenerFixture(t *testing.T) {
	r := loadFixture(t, "url_shortener.json")

	near(t, "lb utilisation", node(t, r, "lb").Utilization, 0.2)
	traffic(t, "svc-a demand", node(t, r, "svc-a").Demand, 4500, 500)
	near(t, "svc-a utilisation", node(t, r, "svc-a").Utilization, 0.5)
	near(t, "redis utilisation", node(t, r, "redis").Utilization, 0.1)
	traffic(t, "postgres demand", node(t, r, "pg").Demand, 900, 1000)
	near(t, "postgres utilisation", node(t, r, "pg").Utilization, 0.26)

	nearPtr(t, "lb p99", node(t, r, "lb").LatencyP99MS, 9.4893)
	nearPtr(t, "svc p99", node(t, r, "svc-a").LatencyP99MS, 176.4809)
	nearPtr(t, "redis p99", node(t, r, "redis").LatencyP99MS, 3.5584)
	nearPtr(t, "pg p99", node(t, r, "pg").LatencyP99MS, 54.0283)

	e := r.EndToEnd
	nearPtr(t, "reads p50", e.Reads.LatencyP50MS, 23)
	nearPtr(t, "reads p99", e.Reads.LatencyP99MS, 243.5570)
	nearPtr(t, "writes p50", e.Writes.LatencyP50MS, 33)
	nearPtr(t, "writes p99", e.Writes.LatencyP99MS, 243.5570)
	near(t, "reads served", e.Reads.ServedRPS, 9000)
	near(t, "writes served", e.Writes.ServedRPS, 1000)
	near(t, "reads success", e.Reads.SuccessRate, 1)
	nearAvail(t, "reads availability", e.Reads.Availability, 0.9999969990)

	near(t, "bandwidth", r.Estimates.BandwidthMBPerSec, 9.7656)
	near(t, "storage/day", r.Estimates.StorageGBPerDay, 82.3975)
	near(t, "storage/year", r.Estimates.StorageTBPerYear, 29.3702)
	if r.BottleneckNodeID != "svc-a" {
		t.Errorf("bottleneck = %q, want svc-a", r.BottleneckNodeID)
	}
	if len(e.Reads.Working) == 0 || len(r.Estimates.Working) == 0 || len(node(t, r, "pg").Working) == 0 {
		t.Error("working lines missing")
	}
}

// Async write path: client → gateway → API; API → Kafka (writes, sync) and
// API → Postgres (reads, sync); Kafka → worker (async) → Postgres.
// Workload 2,000 req/s, 50% reads: 1,000 reads + 1,000 writes.
//
//	gateway   2,000 / 40,000 = 5%
//	API       2,000 / 10,000 = 20%
//	Kafka     1,000 messages / 150,000 = 0.67%; delivers 1,000 writes to the worker
//	worker    1,000 / 4,000 = 25%
//	Postgres  1,000 reads (API) + 1,000 writes (worker); primary load 1,000 + 1,000 / 2 = 1,500; 1,500 / 5,000 = 30%
//
// p50 is S everywhere (ρ ≤ 0.5). p99:
//
//	gateway 5 + 5/0.95 · ln(5)   = 13.4707
//	API     20 + 25 · ln(20)     = 94.8933
//	Kafka   ln(0.0067/0.01) < 0  → 5
//	Postgres 10 + 10/0.7 · ln(30) = 58.5885
//
//	writes p50 = 5 + 20 + 5 = 30; writes p99 = 13.4707 + 94.8933 + 5 = 113.3640
//	(the worker and its database write are async, so they add no latency)
//	reads p50 = 5 + 20 + 10 = 35; reads p99 = 13.4707 + 94.8933 + 58.5885 = 166.9526
//	writes availability = 0.999999 × 0.999999 × (1 − 0.001³) = 0.9999979990
//	reads availability  = 0.999999 × 0.999999 × (1 − 0.001²) = 0.9999970000
//	storage 1,000 writes × 86,400 / 1024² = 82.3975 GB/day
//	bottleneck Postgres at 30%
func TestAsyncWriteFixture(t *testing.T) {
	r := loadFixture(t, "async_write.json")

	near(t, "kafka utilisation", node(t, r, "kafka").Utilization, 1000.0/150000)
	traffic(t, "worker demand", node(t, r, "worker").Demand, 0, 1000)
	near(t, "worker utilisation", node(t, r, "worker").Utilization, 0.25)
	traffic(t, "db demand", node(t, r, "db").Demand, 1000, 1000)
	near(t, "db utilisation", node(t, r, "db").Utilization, 0.3)

	e := r.EndToEnd
	nearPtr(t, "writes p50", e.Writes.LatencyP50MS, 30)
	nearPtr(t, "writes p99", e.Writes.LatencyP99MS, 113.3640)
	nearPtr(t, "reads p50", e.Reads.LatencyP50MS, 35)
	nearPtr(t, "reads p99", e.Reads.LatencyP99MS, 166.9526)
	near(t, "writes served", e.Writes.ServedRPS, 1000)
	nearAvail(t, "writes availability", e.Writes.Availability, 0.9999979990)
	nearAvail(t, "reads availability", e.Reads.Availability, 0.9999970000)
	near(t, "storage/day", r.Estimates.StorageGBPerDay, 82.3975)
	if r.BottleneckNodeID != "db" {
		t.Errorf("bottleneck = %q, want db", r.BottleneckNodeID)
	}
	if edge(t, r, "e5").Mode != domain.EdgeModeAsync {
		t.Error("kafka → worker must be async")
	}
}
