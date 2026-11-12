package simulator

import (
	"fmt"
	"slices"
	"strings"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// topoOrder returns node indices in topological order. Among nodes that are ready
// at the same time the smaller node id comes first, so the order is deterministic
// and independent of input order.
func topoOrder(m *model) ([]int, error) {
	indeg := make([]int, len(m.nodes))
	for e := range m.edges {
		indeg[m.dst[e]]++
	}
	var ready []int
	for i := range m.nodes {
		if indeg[i] == 0 {
			ready = append(ready, i)
		}
	}
	byID := func(a, b int) int { return strings.Compare(m.nodes[a].node.ID, m.nodes[b].node.ID) }

	order := make([]int, 0, len(m.nodes))
	for len(ready) > 0 {
		slices.SortFunc(ready, byID)
		i := ready[0]
		ready = ready[1:]
		order = append(order, i)
		for _, e := range m.out[i] {
			t := m.dst[e]
			indeg[t]--
			if indeg[t] == 0 {
				ready = append(ready, t)
			}
		}
	}
	if len(order) != len(m.nodes) {
		return nil, fmt.Errorf("the design has a cycle; Luka models acyclic designs only")
	}
	return order, nil
}

// propagate moves traffic through the graph in topological order: each node's
// demand is the sum of its incoming edges; it serves what its capacity allows and
// forwards what it served according to its kind.
func (m *model) propagate() {
	for _, i := range m.order {
		n := m.nodes[i]
		if n.kind() == domain.NodeArchetypeClient {
			m.emit(i)
		} else {
			for _, e := range m.in[i] {
				n.demand = add(n.demand, m.flow[e])
			}
			n.addWorking("demand = %s reads + %s writes = %s req/s", num(n.demand.Reads), num(n.demand.Writes), num(total(n.demand)))
			m.capacity(n)
		}
		m.forward(i)
	}
}

// emit sets a client's traffic: R·s reads and R·(1−s) writes, split evenly across
// connected clients.
func (m *model) emit(i int) {
	n := m.nodes[i]
	n.avail = 1
	zero := 0.0
	n.p50, n.p99 = &zero, &zero
	if len(m.out[i]) == 0 {
		n.addWorking("not connected: emits nothing")
		return
	}
	w := m.workload
	share := *w.ReadShare // set by resolveWorkload
	k := float64(len(m.clients))
	n.demand = domain.Traffic{Reads: w.RequestsPerSecond * share / k, Writes: w.RequestsPerSecond * (1 - share) / k}
	n.served = n.demand
	if len(m.clients) > 1 {
		n.addWorking("share of traffic = %s req/s / %d clients = %s req/s", num(w.RequestsPerSecond), len(m.clients), num(w.RequestsPerSecond/k))
	}
	n.addWorking("reads = %s × %s = %s req/s", num(w.RequestsPerSecond/k), num(share), num(n.demand.Reads))
	n.addWorking("writes = %s × (1 − %s) = %s req/s", num(w.RequestsPerSecond/k), num(share), num(n.demand.Writes))
}

// forward assigns traffic to node i's outgoing edges.
func (m *model) forward(i int) {
	n := m.nodes[i]
	if len(m.out[i]) == 0 {
		return
	}
	s := n.served
	switch n.kind() {
	case domain.NodeArchetypeGateway:
		for _, c := range classes {
			es := m.edgesFor(i, c)
			shares := m.shares(es)
			for k, e := range es {
				set(&m.flow[e], c, get(s, c)*shares[k])
			}
		}
		var parts []string
		for _, e := range m.out[i] {
			parts = append(parts, fmt.Sprintf("%s %s reads + %s writes", m.nodes[m.dst[e]].label(), num(m.flow[e].Reads), num(m.flow[e].Writes)))
		}
		n.addWorking("splits by weight: %s", strings.Join(parts, "; "))
		return
	case domain.NodeArchetypeCache, domain.NodeArchetypeCDN:
		h := n.props.CacheHitRate
		misses := s.Reads * (1 - h)
		n.addWorking("forwards misses %s × (1 − %s) = %s reads + %s writes", num(s.Reads), num(h), num(misses), num(s.Writes))
		s = domain.Traffic{Reads: misses, Writes: s.Writes}
	case domain.NodeArchetypeQueue:
		msgs := total(s)
		n.addWorking("delivers %s messages/s to each consumer, as writes", num(msgs))
		s = domain.Traffic{Writes: msgs}
	case domain.NodeArchetypeDatabase, domain.NodeArchetypeObjectStore, domain.NodeArchetypeSearch:
		return // terminal
	default: // client, stateless_service, worker
		if n.kind() != domain.NodeArchetypeClient {
			n.addWorking("sends %s reads + %s writes to each dependency wired for them", num(s.Reads), num(s.Writes))
		}
	}
	for _, e := range m.out[i] {
		for _, c := range classes {
			if m.carries(e, c) {
				set(&m.flow[e], c, get(s, c))
			}
		}
	}
}
