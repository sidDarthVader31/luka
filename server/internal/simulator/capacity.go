package simulator

import (
	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// capacity sets a node's capacity, utilisation and served traffic.
func (m *model) capacity(n *nodeState) {
	p := n.props
	d := n.demand
	var load float64

	if n.kind() == domain.NodeArchetypeDatabase {
		k := max(p.Shards, 1)
		r := max(p.ReadReplicas, 0)
		c := p.CapacityRPS
		load = d.Writes + d.Reads/float64(1+r)
		n.capacity = float64(k) * c
		n.addWorking("primary load = %s writes + %s reads / %d = %s req/s", num(d.Writes), num(d.Reads), 1+r, num(load))
		n.addWorking("primary capacity = %s × %s req/s = %s req/s", plural(k, "shard", "shards"), num(c), num(n.capacity))
	} else {
		reps := max(p.Replicas, 1)
		load = total(d)
		n.capacity = float64(reps) * p.CapacityRPS
		n.addWorking("capacity = %s × %s req/s = %s req/s", plural(reps, "instance", "instances"), num(p.CapacityRPS), num(n.capacity))
	}

	if n.capacity > 0 {
		n.util = load / n.capacity
	}
	n.addWorking("utilisation = %s / %s = %s", num(load), num(n.capacity), pct(n.util))

	if n.overloaded() {
		f := 1 / n.util
		n.served = domain.Traffic{Reads: d.Reads * f, Writes: d.Writes * f}
		n.addWorking("overloaded: serves 1 / %s = %s of demand = %s reads + %s writes; the rest fails",
			dec(n.util, 4), pct(f), num(n.served.Reads), num(n.served.Writes))
	} else {
		n.served = d
	}
}
