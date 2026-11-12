// Package simulator is Luka's steady-state analytical model. Every rule it applies
// is written down in docs/simulation-model.md; keep the two in step.
package simulator

import (
	"fmt"
	"math"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// Workload defaults (docs/simulation-model.md, "Inputs").
const (
	DefaultReadShare = 0.9
	DefaultPayloadKB = 1.0
)

// class is a request class: reads or writes.
type class int

const (
	classRead class = iota
	classWrite
)

var classes = [...]class{classRead, classWrite}

func (c class) String() string {
	if c == classRead {
		return "reads"
	}
	return "writes"
}

func get(t domain.Traffic, c class) float64 {
	if c == classRead {
		return t.Reads
	}
	return t.Writes
}

func set(t *domain.Traffic, c class, v float64) {
	if c == classRead {
		t.Reads = v
	} else {
		t.Writes = v
	}
}

func add(a, b domain.Traffic) domain.Traffic {
	return domain.Traffic{Reads: a.Reads + b.Reads, Writes: a.Writes + b.Writes}
}

func total(t domain.Traffic) float64 { return t.Reads + t.Writes }

// nodeState is the engine's working copy of one node.
type nodeState struct {
	node  domain.Node
	props domain.NodeProperties

	demand   domain.Traffic
	served   domain.Traffic
	capacity float64
	util     float64
	p50, p99 *float64
	avail    float64
	working  []string
}

func (n *nodeState) kind() domain.NodeArchetype { return n.node.Archetype }
func (n *nodeState) label() string {
	if n.node.Label != "" {
		return n.node.Label
	}
	return n.node.ID
}
func (n *nodeState) overloaded() bool { return n.util > 1 }

// servedFraction is served/demand for the node: 1 unless overloaded.
func (n *nodeState) servedFraction() float64 {
	if n.overloaded() {
		return 1 / n.util
	}
	return 1
}

func (n *nodeState) addWorking(format string, args ...any) {
	n.working = append(n.working, fmt.Sprintf(format, args...))
}

type model struct {
	workload domain.Workload
	edges    []domain.Edge
	nodes    []*nodeState // by input index
	order    []int        // node indices in topological order
	out      [][]int      // outgoing edge indices per node, in input order
	in       [][]int      // incoming edge indices per node, in input order
	src, dst []int        // edge endpoints as node indices
	flow     []domain.Traffic
	clients  []int // connected clients, in topological order
}

// Run evaluates a design under a workload. It fills every field of the result
// except Findings and Targets. The graph is assumed to have passed validation;
// Run still refuses inputs it cannot model.
func Run(graph domain.Graph, workload domain.Workload, cat domain.Catalog) (domain.SimulationResult, error) {
	w, err := resolveWorkload(workload)
	if err != nil {
		return domain.SimulationResult{}, err
	}

	m, err := newModel(graph, w, cat)
	if err != nil {
		return domain.SimulationResult{}, err
	}
	if len(m.clients) == 0 {
		return domain.SimulationResult{}, fmt.Errorf("the design needs a client connected to something")
	}

	m.propagate()
	for _, i := range m.order {
		m.nodeLatency(m.nodes[i])
		m.nodeAvailability(m.nodes[i])
	}

	result := domain.SimulationResult{
		Workload:  w,
		Nodes:     make([]domain.NodeResult, 0, len(m.order)),
		Edges:     make([]domain.EdgeResult, 0, len(m.edges)),
		Findings:  []domain.Finding{},
		Estimates: m.estimates(),
	}
	for _, i := range m.order {
		n := m.nodes[i]
		result.Nodes = append(result.Nodes, domain.NodeResult{
			NodeID:       n.node.ID,
			Label:        n.node.Label,
			Archetype:    n.node.Archetype,
			ComponentID:  n.node.ComponentID,
			Demand:       n.demand,
			Served:       n.served,
			CapacityRPS:  n.capacity,
			Utilization:  n.util,
			Overloaded:   n.overloaded(),
			LatencyP50MS: n.p50,
			LatencyP99MS: n.p99,
			Availability: n.avail,
			Working:      n.working,
		})
	}
	for e, edge := range m.edges {
		result.Edges = append(result.Edges, domain.EdgeResult{
			EdgeID:       edge.ID,
			SourceNodeID: edge.SourceNodeID,
			TargetNodeID: edge.TargetNodeID,
			Mode:         m.mode(e),
			Traffic:      m.flow[e],
		})
	}
	result.EndToEnd = domain.EndToEnd{Reads: m.endToEnd(classRead), Writes: m.endToEnd(classWrite)}
	result.BottleneckNodeID = m.bottleneck()

	return result, nil
}

func resolveWorkload(w domain.Workload) (domain.Workload, error) {
	if !finite(w.RequestsPerSecond) || w.RequestsPerSecond <= 0 {
		return w, fmt.Errorf("workload requests_per_second must be greater than zero")
	}
	if w.ReadShare == 0 {
		w.ReadShare = DefaultReadShare
	}
	if !finite(w.ReadShare) || w.ReadShare < 0 || w.ReadShare > 1 {
		return w, fmt.Errorf("workload read_share must be between 0 and 1")
	}
	if w.PayloadKB == 0 {
		w.PayloadKB = DefaultPayloadKB
	}
	if !finite(w.PayloadKB) || w.PayloadKB < 0 {
		return w, fmt.Errorf("workload payload_kb cannot be negative")
	}
	return w, nil
}

func finite(v float64) bool { return !math.IsNaN(v) && !math.IsInf(v, 0) }

func newModel(graph domain.Graph, w domain.Workload, cat domain.Catalog) (*model, error) {
	m := &model{
		workload: w,
		edges:    graph.Edges,
		nodes:    make([]*nodeState, len(graph.Nodes)),
		out:      make([][]int, len(graph.Nodes)),
		in:       make([][]int, len(graph.Nodes)),
		src:      make([]int, len(graph.Edges)),
		dst:      make([]int, len(graph.Edges)),
		flow:     make([]domain.Traffic, len(graph.Edges)),
	}

	byID := make(map[string]int, len(graph.Nodes))
	for i, node := range graph.Nodes {
		if _, dup := byID[node.ID]; dup {
			return nil, fmt.Errorf("duplicate node id %q", node.ID)
		}
		byID[node.ID] = i
		m.nodes[i] = &nodeState{node: node, props: catalog.ResolveProperties(cat, node)}
	}
	for e, edge := range graph.Edges {
		s, ok := byID[edge.SourceNodeID]
		if !ok {
			return nil, fmt.Errorf("edge %q references unknown node %q", edge.ID, edge.SourceNodeID)
		}
		t, ok := byID[edge.TargetNodeID]
		if !ok {
			return nil, fmt.Errorf("edge %q references unknown node %q", edge.ID, edge.TargetNodeID)
		}
		m.src[e], m.dst[e] = s, t
		m.out[s] = append(m.out[s], e)
		m.in[t] = append(m.in[t], e)
	}

	order, err := topoOrder(m)
	if err != nil {
		return nil, err
	}
	m.order = order
	for _, i := range m.order {
		if m.nodes[i].kind() == domain.NodeArchetypeClient && len(m.out[i]) > 0 {
			m.clients = append(m.clients, i)
		}
	}
	return m, nil
}

// mode is the effective mode of an edge: async when set, or when it leaves a queue.
func (m *model) mode(e int) domain.EdgeMode {
	if m.edges[e].Mode == domain.EdgeModeAsync || m.nodes[m.src[e]].kind() == domain.NodeArchetypeQueue {
		return domain.EdgeModeAsync
	}
	return domain.EdgeModeSync
}

func (m *model) sync(e int) bool { return m.mode(e) == domain.EdgeModeSync }

// carries reports whether edge e carries requests of class c.
func (m *model) carries(e int, c class) bool {
	switch m.edges[e].Traffic {
	case domain.EdgeTrafficReads:
		return c == classRead
	case domain.EdgeTrafficWrites:
		return c == classWrite
	default:
		return true
	}
}

func (m *model) weight(e int) float64 {
	if w := m.edges[e].Weight; w > 0 {
		return w
	}
	return 1
}

// edgesFor returns the outgoing edges of node i that carry class c.
func (m *model) edgesFor(i int, c class) []int {
	var es []int
	for _, e := range m.out[i] {
		if m.carries(e, c) {
			es = append(es, e)
		}
	}
	return es
}

// shares returns, for a gateway, the probability of each edge in es by weight.
func (m *model) shares(es []int) []float64 {
	sum := 0.0
	for _, e := range es {
		sum += m.weight(e)
	}
	out := make([]float64, len(es))
	for k, e := range es {
		out[k] = m.weight(e) / sum
	}
	return out
}

func (m *model) bottleneck() string {
	best, bestUtil := "", 0.0
	for _, i := range m.order { // topological order breaks ties
		if n := m.nodes[i]; n.util > bestUtil {
			best, bestUtil = n.node.ID, n.util
		}
	}
	return best
}
