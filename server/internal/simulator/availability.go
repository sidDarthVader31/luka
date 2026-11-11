package simulator

import (
	"math"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// nodeAvailability sets one node's availability from its per-instance
// availability a: 1 − (1−a)^n for n instances; for a database each shard needs
// its primary or a replica, 1 − (1−a)^(1+m), and every one of k shards must be up.
func (m *model) nodeAvailability(n *nodeState) {
	if n.kind() == domain.NodeArchetypeClient {
		n.avail = 1
		return
	}
	a := n.props.Availability
	if n.kind() == domain.NodeArchetypeDatabase {
		k, r := max(n.props.Shards, 1), max(n.props.ReadReplicas, 0)
		shard := 1 - math.Pow(1-a, float64(1+r))
		n.avail = math.Pow(shard, float64(k))
		n.addWorking("availability per shard = 1 − (1 − %s)^%d = %s", dec(a, 5), 1+r, availPct(shard))
		if k > 1 {
			n.addWorking("availability = %s^%d = %s", availPct(shard), k, availPct(n.avail))
		}
		return
	}
	reps := max(n.props.Replicas, 1)
	n.avail = 1 - math.Pow(1-a, float64(reps))
	n.addWorking("availability = 1 − (1 − %s)^%d = %s", dec(a, 5), reps, availPct(n.avail))
}
