// Package graphs validates design graphs against the edge model in
// docs/simulation-model.md and the catalog's connection rules.
package graphs

import (
	"fmt"
	"math"
	"strings"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
)

type Mode string

const (
	// ModeSave checks structure only, so unfinished drafts can be saved.
	ModeSave Mode = "save"
	// ModeRun also checks what the simulator needs: a connected client and no cycles.
	ModeRun Mode = "run"
)

type ValidationError struct {
	Issues []string
}

func (e *ValidationError) Error() string {
	if len(e.Issues) == 0 {
		return "graph validation failed"
	}
	return fmt.Sprintf("graph validation failed: %s", strings.Join(e.Issues, "; "))
}

func (e *ValidationError) Is(target error) bool {
	return target == domain.ErrInvalid
}

// ValidateGraph checks a graph. Unconnected nodes are not errors; see Warnings.
func ValidateGraph(graph domain.Graph, mode Mode) error {
	var issues []string
	addf := func(format string, args ...any) { issues = append(issues, fmt.Sprintf(format, args...)) }

	if mode == ModeRun && len(graph.Nodes) == 0 {
		addf("at least one node is required to run a simulation")
	}

	nodeByID := make(map[string]domain.Node, len(graph.Nodes))
	cat := catalog.Default()

	for index, node := range graph.Nodes {
		prefix := fmt.Sprintf("node[%d]", index)
		if node.ID != "" {
			prefix = fmt.Sprintf("node %q", node.ID)
		}

		if node.ID == "" {
			addf("%s id is required", prefix)
		} else if _, exists := nodeByID[node.ID]; exists {
			addf("duplicate node id %q", node.ID)
		}
		if strings.TrimSpace(node.Label) == "" {
			addf("%s label is required", prefix)
		}
		if !catalog.IsKnownKind(node.Archetype) {
			addf("%s archetype %q is not supported", prefix, node.Archetype)
		}
		if node.ComponentID != "" {
			if component, ok := catalog.ItemByID(node.ComponentID); !ok {
				addf("%s component_id %q is not in the catalog", prefix, node.ComponentID)
			} else if component.Kind != node.Archetype {
				addf("%s component_id %q is a %q, not a %q", prefix, node.ComponentID, component.Kind, node.Archetype)
			}
		}
		if !isFinite(node.Position.X) || !isFinite(node.Position.Y) {
			addf("%s position must contain finite x and y values", prefix)
		}
		issues = append(issues, propertyIssues(prefix, node, cat)...)

		if node.ID != "" {
			nodeByID[node.ID] = node
		}
	}

	edgeIDs := make(map[string]struct{}, len(graph.Edges))
	adjacency := make(map[string][]string, len(graph.Nodes))

	for index, edge := range graph.Edges {
		prefix := fmt.Sprintf("edge[%d]", index)
		if edge.ID != "" {
			prefix = fmt.Sprintf("edge %q", edge.ID)
		}

		if edge.ID == "" {
			addf("%s id is required", prefix)
		} else {
			if _, exists := edgeIDs[edge.ID]; exists {
				addf("duplicate edge id %q", edge.ID)
			}
			edgeIDs[edge.ID] = struct{}{}
		}

		source, sourceExists := nodeByID[edge.SourceNodeID]
		if !sourceExists {
			addf("%s references unknown source node %q", prefix, edge.SourceNodeID)
		}
		target, targetExists := nodeByID[edge.TargetNodeID]
		if !targetExists {
			addf("%s references unknown target node %q", prefix, edge.TargetNodeID)
		}
		if edge.SourceNodeID == edge.TargetNodeID && edge.SourceNodeID != "" {
			addf("%s cannot connect node %q to itself", prefix, edge.SourceNodeID)
		}

		switch edge.Traffic {
		case "", domain.EdgeTrafficAll, domain.EdgeTrafficReads, domain.EdgeTrafficWrites:
		default:
			addf("%s traffic %q must be one of all, reads, writes", prefix, edge.Traffic)
		}
		switch edge.Mode {
		case "", domain.EdgeModeSync, domain.EdgeModeAsync:
		default:
			addf("%s mode %q must be sync or async", prefix, edge.Mode)
		}
		if !isFinite(edge.Weight) || edge.Weight < 0 {
			addf("%s weight must be a finite number, zero or more", prefix)
		}

		if sourceExists && targetExists && catalog.IsKnownKind(source.Archetype) && !catalog.CanConnect(source.Archetype, target.Archetype) {
			if len(catalog.AllowedTargets(source.Archetype)) == 0 {
				addf("%s: a %s cannot have outgoing connections", prefix, source.Archetype)
			} else {
				addf("%s cannot connect a %s to a %s", prefix, source.Archetype, target.Archetype)
			}
		}

		if sourceExists && targetExists {
			adjacency[edge.SourceNodeID] = append(adjacency[edge.SourceNodeID], edge.TargetNodeID)
		}
	}

	if mode == ModeRun {
		clients, connected := 0, 0
		for _, node := range graph.Nodes {
			if node.Archetype == domain.NodeArchetypeClient {
				clients++
				if len(adjacency[node.ID]) > 0 {
					connected++
				}
			}
		}
		switch {
		case clients == 0:
			addf("at least one client node is required")
		case connected == 0:
			addf("connect a client to something so traffic has somewhere to go")
		}
		if hasCycle(graph, adjacency) {
			addf("the design has a cycle; Luka models acyclic designs only")
		}
	}

	if len(issues) > 0 {
		return &ValidationError{Issues: issues}
	}
	return nil
}

// propertyIssues checks a node's properties after catalog defaults are applied.
func propertyIssues(prefix string, node domain.Node, cat domain.Catalog) []string {
	var issues []string
	addf := func(format string, args ...any) { issues = append(issues, fmt.Sprintf(format, args...)) }

	raw := node.Properties
	for _, v := range []float64{raw.CapacityRPS, raw.BaseLatencyMS, raw.CacheHitRate, raw.Availability} {
		if !isFinite(v) {
			addf("%s properties must be finite numbers", prefix)
			return issues
		}
	}
	if raw.CapacityRPS < 0 {
		addf("%s capacity_rps cannot be negative", prefix)
	}
	if raw.Replicas < 0 || raw.Shards < 0 || raw.ReadReplicas < 0 {
		addf("%s replicas, shards and read_replicas cannot be negative", prefix)
	}
	if raw.BaseLatencyMS < 0 {
		addf("%s base_latency_ms cannot be negative", prefix)
	}
	if raw.CacheHitRate < 0 || raw.CacheHitRate > 1 {
		addf("%s cache_hit_rate must be between 0 and 1", prefix)
	}
	if raw.Availability < 0 || raw.Availability > 1 {
		addf("%s availability must be between 0 and 1", prefix)
	}
	if catalog.HasCapacity(node.Archetype) {
		if resolved := catalog.ResolveProperties(cat, node); resolved.CapacityRPS <= 0 {
			addf("%s capacity_rps must be greater than zero", prefix)
		}
	}
	return issues
}

// Warnings lists graph problems that do not stop a run, such as unconnected nodes.
func Warnings(graph domain.Graph) []string {
	connected := make(map[string]bool, len(graph.Nodes))
	for _, edge := range graph.Edges {
		connected[edge.SourceNodeID] = true
		connected[edge.TargetNodeID] = true
	}
	var warnings []string
	for _, node := range graph.Nodes {
		if !connected[node.ID] {
			warnings = append(warnings, fmt.Sprintf("%s (%s) is not connected to anything", labelOf(node), node.ID))
		}
	}
	return warnings
}

func labelOf(node domain.Node) string {
	if strings.TrimSpace(node.Label) != "" {
		return node.Label
	}
	return node.ID
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

// hasCycle walks nodes in input order so the result does not depend on map order.
func hasCycle(graph domain.Graph, adjacency map[string][]string) bool {
	visited := make(map[string]bool, len(graph.Nodes))
	inStack := make(map[string]bool, len(graph.Nodes))

	var visit func(string) bool
	visit = func(nodeID string) bool {
		if inStack[nodeID] {
			return true
		}
		if visited[nodeID] {
			return false
		}
		visited[nodeID] = true
		inStack[nodeID] = true
		for _, next := range adjacency[nodeID] {
			if visit(next) {
				return true
			}
		}
		inStack[nodeID] = false
		return false
	}

	for _, node := range graph.Nodes {
		if visit(node.ID) {
			return true
		}
	}
	return false
}
