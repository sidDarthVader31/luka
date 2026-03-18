package graphs

import (
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/platform"
)

type Mode string

const (
	ModeSave Mode = "save"
	ModeRun  Mode = "run"
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

func (e *ValidationError) Unwrap() error {
	return errors.New("graph validation failed")
}

func ValidateGraph(graph domain.Graph, mode Mode) error {
	var issues []string

	if mode == ModeRun && len(graph.Nodes) == 0 {
		issues = append(issues, "at least one node is required to run a simulation")
	}

	nodeByID := make(map[string]domain.Node, len(graph.Nodes))
	nodeIDs := make(map[string]struct{}, len(graph.Nodes))
	clientCount := 0

	for index, node := range graph.Nodes {
		prefix := fmt.Sprintf("node[%d]", index)

		if node.ID == "" {
			issues = append(issues, fmt.Sprintf("%s id is required", prefix))
		} else {
			if _, exists := nodeIDs[node.ID]; exists {
				issues = append(issues, fmt.Sprintf("duplicate node id %q", node.ID))
			}
			nodeIDs[node.ID] = struct{}{}
		}

		if strings.TrimSpace(node.Label) == "" {
			issues = append(issues, fmt.Sprintf("%s label is required", prefix))
		}

		if !isSupportedArchetype(node.Archetype) {
			issues = append(issues, fmt.Sprintf("%s archetype %q is not supported", prefix, node.Archetype))
		}

		if node.Color != "" && !isSupportedColor(node.Color) {
			issues = append(issues, fmt.Sprintf("%s color %q is not supported", prefix, node.Color))
		}

		if !isFinite(node.Position.X) || !isFinite(node.Position.Y) {
			issues = append(issues, fmt.Sprintf("%s position must contain finite x and y values", prefix))
		}

		if node.Archetype == domain.NodeArchetypeClient {
			clientCount += 1
		}

		nodeByID[node.ID] = node
	}

	edgeIDs := make(map[string]struct{}, len(graph.Edges))
	adjacency := make(map[string][]string, len(graph.Nodes))

	for index, edge := range graph.Edges {
		prefix := fmt.Sprintf("edge[%d]", index)

		if edge.ID == "" {
			issues = append(issues, fmt.Sprintf("%s id is required", prefix))
		} else {
			if _, exists := edgeIDs[edge.ID]; exists {
				issues = append(issues, fmt.Sprintf("duplicate edge id %q", edge.ID))
			}
			edgeIDs[edge.ID] = struct{}{}
		}

		sourceNode, sourceExists := nodeByID[edge.SourceNodeID]
		if !sourceExists {
			issues = append(issues, fmt.Sprintf("%s references unknown source node %q", prefix, edge.SourceNodeID))
		}

		if _, targetExists := nodeByID[edge.TargetNodeID]; !targetExists {
			issues = append(issues, fmt.Sprintf("%s references unknown target node %q", prefix, edge.TargetNodeID))
		}

		if edge.SourceNodeID == edge.TargetNodeID && edge.SourceNodeID != "" {
			issues = append(issues, fmt.Sprintf("%s cannot connect node %q to itself", prefix, edge.SourceNodeID))
		}

		if !isSupportedInteraction(edge.InteractionType) {
			issues = append(issues, fmt.Sprintf("%s interaction_type %q is not supported", prefix, edge.InteractionType))
		}

		if !isSupportedRoutingRule(edge.RoutingRule.RuleType) {
			issues = append(issues, fmt.Sprintf("%s routing rule %q is not supported", prefix, edge.RoutingRule.RuleType))
		}

		if sourceExists {
			catalogEntry, exists := archetypeCatalog()[sourceNode.Archetype]
			if exists {
				if !slices.Contains(catalogEntry.SupportedInteractions, edge.InteractionType) {
					issues = append(issues, fmt.Sprintf("%s interaction_type %q is not valid for source archetype %q", prefix, edge.InteractionType, sourceNode.Archetype))
				}

				if !slices.Contains(catalogEntry.SupportedRoutingRules, edge.RoutingRule.RuleType) {
					issues = append(issues, fmt.Sprintf("%s routing rule %q is not valid for source archetype %q", prefix, edge.RoutingRule.RuleType, sourceNode.Archetype))
				}
			}

			if edge.RoutingRule.RuleType == domain.RoutingRuleCacheHit || edge.RoutingRule.RuleType == domain.RoutingRuleCacheMiss {
				if sourceNode.Archetype != domain.NodeArchetypeCache {
					issues = append(issues, fmt.Sprintf("%s uses %q but source node %q is not a cache", prefix, edge.RoutingRule.RuleType, edge.SourceNodeID))
				}
			}
		}

		if edge.SourceNodeID != "" && edge.TargetNodeID != "" {
			adjacency[edge.SourceNodeID] = append(adjacency[edge.SourceNodeID], edge.TargetNodeID)
		}
	}

	if mode == ModeRun {
		switch {
		case clientCount == 0:
			issues = append(issues, "exactly one client node is required for the current simulator")
		case clientCount > 1:
			issues = append(issues, fmt.Sprintf("the current simulator supports exactly one client node, found %d", clientCount))
		}

		if hasCycle(adjacency) {
			issues = append(issues, "cycles are not supported by the current simulator")
		}
	}

	if len(issues) > 0 {
		return &ValidationError{Issues: issues}
	}

	return nil
}

func archetypeCatalog() map[domain.NodeArchetype]domain.ComponentArchetype {
	items := platform.DefaultComponentArchetypes()
	catalog := make(map[domain.NodeArchetype]domain.ComponentArchetype, len(items))
	for _, item := range items {
		catalog[item.Archetype] = item
	}

	return catalog
}

func isSupportedArchetype(value domain.NodeArchetype) bool {
	_, ok := archetypeCatalog()[value]
	return ok
}

func isSupportedInteraction(value domain.EdgeInteractionType) bool {
	for _, item := range archetypeCatalog() {
		if slices.Contains(item.SupportedInteractions, value) {
			return true
		}
	}

	return false
}

func isSupportedRoutingRule(value domain.RoutingRuleType) bool {
	for _, item := range archetypeCatalog() {
		if slices.Contains(item.SupportedRoutingRules, value) {
			return true
		}
	}

	return false
}

func isSupportedColor(value string) bool {
	return value == "blue" || value == "green" || value == "yellow" || value == "red"
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func hasCycle(adjacency map[string][]string) bool {
	visited := make(map[string]bool, len(adjacency))
	inStack := make(map[string]bool, len(adjacency))

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

	for nodeID := range adjacency {
		if visit(nodeID) {
			return true
		}
	}

	return false
}
