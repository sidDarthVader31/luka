package simulator

import (
	"fmt"
	"strings"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// endToEnd is the outcome for one class as the clients see it. With several
// clients, demand and served add up, latency is the slowest client's and
// availability is the average over clients.
func (m *model) endToEnd(c class) domain.ClassResult {
	r := domain.ClassResult{Working: []string{}}
	var p50, p99 *float64
	p50ok, p99ok := true, true
	availSum := 0.0
	multi := len(m.clients) > 1

	for _, i := range m.clients {
		n := m.nodes[i]
		prefix := ""
		if multi {
			prefix = n.label() + ": "
		}
		demand := get(n.demand, c)
		s := m.success(i, c)
		served := demand * s.v
		r.DemandRPS += demand
		r.ServedRPS += served
		if s.expr == "" {
			r.Working = append(r.Working, fmt.Sprintf("%ssuccess = 100%% (nothing on the path fails)", prefix))
		} else {
			r.Working = append(r.Working, fmt.Sprintf("%ssuccess = %s = %s", prefix, s.expr, pct(s.v)))
		}
		r.Working = append(r.Working, fmt.Sprintf("%sserved = %s × %s = %s %s/s", prefix, num(demand), pct(s.v), num(served), c))

		l50, l99 := m.pathLatency(i, c, q50), m.pathLatency(i, c, q99)
		r.Working = append(r.Working, fmt.Sprintf("%sp50 = %s", prefix, l50))
		r.Working = append(r.Working, fmt.Sprintf("%sp99 = %s (upper bound: sum of per-node p99s)", prefix, l99))
		p50, p50ok = maxLatency(p50, p50ok, l50.value)
		p99, p99ok = maxLatency(p99, p99ok, l99.value)

		a := m.availability(i, c)
		availSum += a.v
		r.Working = append(r.Working, fmt.Sprintf("%savailability = %s = %s", prefix, a.expr, availPct(a.v)))
	}

	if len(m.clients) > 0 {
		r.Availability = availSum / float64(len(m.clients))
	}
	if r.DemandRPS > 0 {
		r.SuccessRate = r.ServedRPS / r.DemandRPS
	} else if len(m.clients) > 0 {
		r.SuccessRate = m.success(m.clients[0], c).v
	}
	if p50ok {
		r.LatencyP50MS = p50
	}
	if p99ok {
		r.LatencyP99MS = p99
	}
	if multi {
		r.Working = append(r.Working, fmt.Sprintf("all clients: served %s of %s %s/s, latency is the slowest client's, availability = %s (average)",
			num(r.ServedRPS), num(r.DemandRPS), c, availPct(r.Availability)))
	}
	return r
}

// maxLatency folds one client's latency into the running maximum. Once any
// client's latency is undefined, the result stays undefined.
func maxLatency(cur *float64, ok bool, v *float64) (*float64, bool) {
	if !ok || v == nil {
		return nil, false
	}
	if cur == nil || *v > *cur {
		x := *v
		return &x, true
	}
	return cur, true
}

// estimates computes bandwidth and storage (docs/simulation-model.md, "Estimates").
func (m *model) estimates() domain.Estimates {
	w := m.workload
	est := domain.Estimates{Working: []string{}}
	est.BandwidthMBPerSec = w.RequestsPerSecond * w.PayloadKB / 1024
	est.Working = append(est.Working, fmt.Sprintf("bandwidth = %s req/s × %s KB / 1024 = %s MB/s",
		num(w.RequestsPerSecond), num(w.PayloadKB), num(est.BandwidthMBPerSec)))

	writes := 0.0
	var parts []string
	for _, i := range m.order {
		n := m.nodes[i]
		if n.kind() == domain.NodeArchetypeDatabase || n.kind() == domain.NodeArchetypeObjectStore {
			writes += n.served.Writes
			parts = append(parts, fmt.Sprintf("%s %s", n.label(), num(n.served.Writes)))
		}
	}
	est.StorageGBPerDay = writes * w.PayloadKB * 86400 / (1024 * 1024)
	est.StorageTBPerYear = est.StorageGBPerDay * 365 / 1024
	if len(parts) == 0 {
		est.Working = append(est.Working, "storage: no database or object storage receives writes")
		return est
	}
	est.Working = append(est.Working,
		fmt.Sprintf("stored writes = %s = %s writes/s", strings.Join(parts, " + "), num(writes)),
		fmt.Sprintf("storage per day = %s × %s KB × 86,400 / 1024² = %s GB/day", num(writes), num(w.PayloadKB), num(est.StorageGBPerDay)),
		fmt.Sprintf("storage per year = %s × 365 / 1024 = %s TB/year", num(est.StorageGBPerDay), num(est.StorageTBPerYear)),
	)
	return est
}
