// Package review turns a design and its simulation result into rule-based
// findings, each with a concrete fix. The rules are listed in
// docs/simulation-model.md, "Review findings".
package review

import (
	"fmt"
	"math"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
)

const (
	RuleOverloadedNode        = "overloaded_node"
	RuleNearCapacity          = "near_capacity"
	RuleSinglePointOfFailure  = "single_point_of_failure"
	RuleWritesExceedPrimary   = "writes_exceed_primary"
	RuleReadHeavyWithoutCache = "read_heavy_without_cache"
	RuleQueueWithoutConsumer  = "queue_without_consumer"
	RuleUnconnectedNode       = "unconnected_node"
)

// targetUtilisation is what scaling suggestions aim for: below the 80% warning line.
const targetUtilisation = 0.8

type analysis struct {
	graph  domain.Graph
	result domain.SimulationResult
	nodes  map[string]domain.Node
	props  map[string]domain.NodeProperties
	out    map[string][]domain.Edge
	in     map[string][]domain.Edge
	found  []domain.Finding
}

// Analyze applies every rule. Findings are ordered by rule (as in the spec's
// table), then by the result's node order, so the output is deterministic.
func Analyze(graph domain.Graph, result domain.SimulationResult) []domain.Finding {
	a := &analysis{
		graph:  graph,
		result: result,
		nodes:  map[string]domain.Node{},
		props:  map[string]domain.NodeProperties{},
		out:    map[string][]domain.Edge{},
		in:     map[string][]domain.Edge{},
		found:  []domain.Finding{},
	}
	cat := catalog.Default()
	for _, n := range graph.Nodes {
		a.nodes[n.ID] = n
		a.props[n.ID] = catalog.ResolveProperties(cat, n)
	}
	for _, e := range graph.Edges {
		a.out[e.SourceNodeID] = append(a.out[e.SourceNodeID], e)
		a.in[e.TargetNodeID] = append(a.in[e.TargetNodeID], e)
	}

	a.overloaded()
	a.nearCapacity()
	a.singlePointsOfFailure()
	a.writesExceedPrimary()
	a.readHeavyWithoutCache()
	a.queuesWithoutConsumer()
	a.unconnected()
	return a.found
}

func (a *analysis) add(rule string, sev domain.FindingSeverity, nodeID, title, detail string) {
	a.found = append(a.found, domain.Finding{RuleID: rule, Severity: sev, Title: title, Detail: detail, NodeIDs: []string{nodeID}})
}

func label(n domain.NodeResult) string {
	if n.Label != "" {
		return n.Label
	}
	return n.NodeID
}

func ceil(x float64) int { return int(math.Ceil(x - 1e-9)) }

// scaleFix suggests how to bring a node under the target utilisation.
func (a *analysis) scaleFix(n domain.NodeResult) string {
	p := a.props[n.NodeID]
	if n.Archetype == domain.NodeArchetypeDatabase {
		return dbFix(n, p)
	}
	load := n.Demand.Reads + n.Demand.Writes
	if p.CapacityRPS <= 0 {
		return "Raise its capacity."
	}
	need := max(ceil(load/(p.CapacityRPS*targetUtilisation)), max(p.Replicas, 1)+1)
	return fmt.Sprintf("Scale %s to %d instances to stay under 80%% utilisation.", label(n), need)
}

// dbFix suggests read replicas when reads are the problem and shards when writes are.
func dbFix(n domain.NodeResult, p domain.NodeProperties) string {
	k, m, c := float64(max(p.Shards, 1)), float64(max(p.ReadReplicas, 0)), p.CapacityRPS
	r, w := n.Demand.Reads, n.Demand.Writes
	budget := targetUtilisation * k * c
	if w < budget && r > 0 {
		replicas := max(ceil(r/(budget-w)-1), int(m)+1)
		return fmt.Sprintf("Add read replicas (%d per shard keeps the primary under 80%%) or put a cache in front of %s.", replicas, label(n))
	}
	shards := max(ceil((w+r/(1+m))/(targetUtilisation*c)), int(k)+1)
	return fmt.Sprintf("Shard %s into %d shards; writes only scale with more primaries.", label(n), shards)
}

func (a *analysis) overloaded() {
	for _, n := range a.result.Nodes {
		if n.Utilization > 1 {
			a.add(RuleOverloadedNode, domain.FindingSeverityError, n.NodeID,
				fmt.Sprintf("%s is overloaded", label(n)),
				fmt.Sprintf("Utilisation is %.0f%%, so it serves only %.0f%% of its demand and the rest fails. %s",
					n.Utilization*100, 100/n.Utilization, a.scaleFix(n)))
		}
	}
}

func (a *analysis) nearCapacity() {
	for _, n := range a.result.Nodes {
		if n.Utilization > 0.8 && n.Utilization <= 1 {
			a.add(RuleNearCapacity, domain.FindingSeverityWarning, n.NodeID,
				fmt.Sprintf("%s is near capacity", label(n)),
				fmt.Sprintf("Utilisation is %.0f%%; queueing makes p99 latency climb steeply above 80%%. %s",
					n.Utilization*100, a.scaleFix(n)))
		}
	}
}

// syncPath returns the nodes reachable from a client over sync edges.
func (a *analysis) syncPath() map[string]bool {
	seen := map[string]bool{}
	var visit func(id string)
	visit = func(id string) {
		if seen[id] {
			return
		}
		seen[id] = true
		if a.nodes[id].Archetype == domain.NodeArchetypeQueue {
			return // edges out of a queue are async
		}
		for _, e := range a.out[id] {
			if e.Mode != domain.EdgeModeAsync {
				visit(e.TargetNodeID)
			}
		}
	}
	for _, n := range a.graph.Nodes {
		if n.Archetype == domain.NodeArchetypeClient && len(a.out[n.ID]) > 0 {
			visit(n.ID)
		}
	}
	return seen
}

func (a *analysis) singlePointsOfFailure() {
	onPath := a.syncPath()
	for _, n := range a.result.Nodes {
		if !onPath[n.NodeID] || n.Archetype == domain.NodeArchetypeClient {
			continue
		}
		p := a.props[n.NodeID]
		if n.Archetype == domain.NodeArchetypeDatabase {
			if max(p.Shards, 1) == 1 && p.ReadReplicas == 0 {
				a.add(RuleSinglePointOfFailure, domain.FindingSeverityWarning, n.NodeID,
					fmt.Sprintf("%s is a single point of failure", label(n)),
					"It has one primary and no replicas, so one failure takes the request path down. Add a read replica that can be promoted on failover.")
			}
			continue
		}
		if p.Replicas <= 1 {
			a.add(RuleSinglePointOfFailure, domain.FindingSeverityWarning, n.NodeID,
				fmt.Sprintf("%s is a single point of failure", label(n)),
				fmt.Sprintf("It runs one instance on the request path. Run at least 2 instances of %s.", label(n)))
		}
	}
}

func (a *analysis) writesExceedPrimary() {
	for _, n := range a.result.Nodes {
		if n.Archetype != domain.NodeArchetypeDatabase || n.CapacityRPS <= 0 || n.Demand.Writes <= n.CapacityRPS {
			continue
		}
		p := a.props[n.NodeID]
		shards := ceil(n.Demand.Writes / (targetUtilisation * p.CapacityRPS))
		a.add(RuleWritesExceedPrimary, domain.FindingSeverityError, n.NodeID,
			fmt.Sprintf("Writes exceed %s's primary capacity", label(n)),
			fmt.Sprintf("Writes alone are %.0f/s against %.0f/s of primary capacity; read replicas do not help. Shard it into at least %d shards or pick a store with more write capacity.",
				n.Demand.Writes, n.CapacityRPS, shards))
	}
}

// behindCache reports whether a cache or CDN is upstream of the node.
func (a *analysis) behindCache(id string) bool {
	seen := map[string]bool{}
	var visit func(id string) bool
	visit = func(id string) bool {
		for _, e := range a.in[id] {
			src := e.SourceNodeID
			if seen[src] {
				continue
			}
			seen[src] = true
			kind := a.nodes[src].Archetype
			if kind == domain.NodeArchetypeCache || kind == domain.NodeArchetypeCDN || visit(src) {
				return true
			}
		}
		return false
	}
	return visit(id)
}

func (a *analysis) readHeavyWithoutCache() {
	if *a.result.Workload.ReadShare < 0.8 {
		return
	}
	for _, n := range a.result.Nodes {
		if n.Archetype == domain.NodeArchetypeDatabase && n.Demand.Reads > 0 && !a.behindCache(n.NodeID) {
			a.add(RuleReadHeavyWithoutCache, domain.FindingSeverityInfo, n.NodeID,
				fmt.Sprintf("Every read reaches %s", label(n)),
				fmt.Sprintf("The workload is %.0f%% reads and nothing caches them. Route reads through a cache (service → Redis → %s) so only misses reach the database.",
					*a.result.Workload.ReadShare*100, label(n)))
		}
	}
}

func (a *analysis) queuesWithoutConsumer() {
	for _, n := range a.result.Nodes {
		if n.Archetype == domain.NodeArchetypeQueue && len(a.out[n.NodeID]) == 0 {
			a.add(RuleQueueWithoutConsumer, domain.FindingSeverityError, n.NodeID,
				fmt.Sprintf("Nothing consumes %s", label(n)),
				fmt.Sprintf("Messages pile up forever. Connect a worker (or service) to %s to process them.", label(n)))
		}
	}
}

func (a *analysis) unconnected() {
	for _, n := range a.result.Nodes {
		if len(a.out[n.NodeID]) == 0 && len(a.in[n.NodeID]) == 0 {
			a.add(RuleUnconnectedNode, domain.FindingSeverityWarning, n.NodeID,
				fmt.Sprintf("%s is not connected", label(n)),
				fmt.Sprintf("It takes no part in the simulation. Connect %s to the design or delete it.", label(n)))
		}
	}
}
