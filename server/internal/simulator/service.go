package simulator

import (
	"errors"
	"fmt"
	"math"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

type Service struct{}

func NewService() *Service {
	return &Service{}
}

func (s *Service) RunDesign(design domain.Design, workload domain.Workload) (*domain.SimulationResult, error) {
	if workload.RequestsPerSecond <= 0 {
		return nil, errors.New("workload.requests_per_second must be greater than zero")
	}

	return s.runGraph(design, workload)
}

func (s *Service) runGraph(design domain.Design, workload domain.Workload) (*domain.SimulationResult, error) {
	nodeByID := make(map[string]domain.Node, len(design.Graph.Nodes))
	inDegree := make(map[string]int, len(design.Graph.Nodes))
	outgoing := make(map[string][]domain.Edge, len(design.Graph.Nodes))
	incomingRate := make(map[string]float64, len(design.Graph.Nodes))
	nodeResults := make(map[string]domain.NodeSimulationResult, len(design.Graph.Nodes))
	edgeResults := make([]domain.EdgeSimulationResult, 0, len(design.Graph.Edges))

	clientCount := 0
	for _, node := range design.Graph.Nodes {
		if node.ID == "" {
			return nil, errors.New("all nodes must have an id")
		}

		nodeByID[node.ID] = node
		inDegree[node.ID] = 0

		if node.Archetype == domain.NodeArchetypeClient {
			clientCount++
		}
	}

	if clientCount != 1 {
		return nil, fmt.Errorf("the first simulator slice supports exactly one client node, got %d", clientCount)
	}

	for _, edge := range design.Graph.Edges {
		if _, ok := nodeByID[edge.SourceNodeID]; !ok {
			return nil, fmt.Errorf("edge %q references unknown source node %q", edge.ID, edge.SourceNodeID)
		}

		if _, ok := nodeByID[edge.TargetNodeID]; !ok {
			return nil, fmt.Errorf("edge %q references unknown target node %q", edge.ID, edge.TargetNodeID)
		}

		inDegree[edge.TargetNodeID]++
		outgoing[edge.SourceNodeID] = append(outgoing[edge.SourceNodeID], edge)
	}

	queue := make([]string, 0, len(design.Graph.Nodes))
	for _, node := range design.Graph.Nodes {
		if inDegree[node.ID] == 0 {
			queue = append(queue, node.ID)
		}
	}

	processedNodes := 0
	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]
		node := nodeByID[nodeID]

		incoming := incomingRate[nodeID]
		if node.Archetype == domain.NodeArchetypeClient {
			incoming = workload.RequestsPerSecond
		}

		result := simulateNode(node, incoming)
		nodeResults[nodeID] = result
		processedNodes++

		for _, edge := range outgoing[nodeID] {
			routed, err := applyRoutingRule(edge, node, result.ProcessedRPS)
			if err != nil {
				return nil, err
			}

			incomingRate[edge.TargetNodeID] += routed
			edgeResults = append(edgeResults, domain.EdgeSimulationResult{
				EdgeID:       edge.ID,
				SourceNodeID: edge.SourceNodeID,
				TargetNodeID: edge.TargetNodeID,
				RuleType:     edge.RoutingRule.RuleType,
				RoutedRPS:    round(routed),
			})

			inDegree[edge.TargetNodeID]--
			if inDegree[edge.TargetNodeID] == 0 {
				queue = append(queue, edge.TargetNodeID)
			}
		}
	}

	if processedNodes != len(design.Graph.Nodes) {
		return nil, errors.New("the first simulator slice supports DAG graphs only")
	}

	nodeList := make([]domain.NodeSimulationResult, 0, len(design.Graph.Nodes))
	var bottleneck *domain.NodeSimulationResult

	for _, node := range design.Graph.Nodes {
		result := nodeResults[node.ID]
		nodeList = append(nodeList, result)

		if node.Archetype == domain.NodeArchetypeClient {
			continue
		}

		if bottleneck == nil || result.Utilization > bottleneck.Utilization {
			current := result
			bottleneck = &current
		}
	}

	if bottleneck == nil {
		return nil, errors.New("no bottleneck candidate found in design")
	}

	response := &domain.SimulationResult{
		Nodes:      nodeList,
		Edges:      edgeResults,
		Bottleneck: bottleneck,
		Summary:    summarize(design, workload, *bottleneck),
	}

	return response, nil
}

func simulateNode(node domain.Node, incomingRPS float64) domain.NodeSimulationResult {
	if node.Archetype == domain.NodeArchetypeClient {
		return domain.NodeSimulationResult{
			NodeID:               node.ID,
			Label:                node.Label,
			Archetype:            node.Archetype,
			IncomingRPS:          round(incomingRPS),
			ProcessedRPS:         round(incomingRPS),
			DroppedRPS:           0,
			EffectiveCapacityRPS: 0,
			Utilization:          0,
			EstimatedLatencyMS:   round(node.Properties.BaseLatencyMS),
			Saturated:            false,
			Explanation:          "Client emits workload into the graph.",
		}
	}

	effectiveCapacity := node.Properties.CapacityRPS
	if node.Properties.Replicas > 1 {
		effectiveCapacity *= float64(node.Properties.Replicas)
	}

	if effectiveCapacity <= 0 {
		effectiveCapacity = 1
	}

	processed := math.Min(incomingRPS, effectiveCapacity)
	dropped := math.Max(0, incomingRPS-effectiveCapacity)
	utilization := incomingRPS / effectiveCapacity
	latency := estimateLatency(node.Properties.BaseLatencyMS, utilization)
	saturated := utilization > 1

	return domain.NodeSimulationResult{
		NodeID:               node.ID,
		Label:                node.Label,
		Archetype:            node.Archetype,
		IncomingRPS:          round(incomingRPS),
		ProcessedRPS:         round(processed),
		DroppedRPS:           round(dropped),
		EffectiveCapacityRPS: round(effectiveCapacity),
		Utilization:          round(utilization),
		EstimatedLatencyMS:   round(latency),
		Saturated:            saturated,
		Explanation:          explainNode(node, incomingRPS, effectiveCapacity, saturated),
	}
}

func applyRoutingRule(edge domain.Edge, sourceNode domain.Node, processedRPS float64) (float64, error) {
	switch edge.RoutingRule.RuleType {
	case domain.RoutingRuleAlways:
		return processedRPS, nil
	case domain.RoutingRuleCacheHit:
		if sourceNode.Archetype != domain.NodeArchetypeCache {
			return 0, fmt.Errorf("edge %q uses cache_hit but source node %q is not a cache", edge.ID, sourceNode.ID)
		}

		return processedRPS * normalizedHitRate(sourceNode), nil
	case domain.RoutingRuleCacheMiss:
		if sourceNode.Archetype != domain.NodeArchetypeCache {
			return 0, fmt.Errorf("edge %q uses cache_miss but source node %q is not a cache", edge.ID, sourceNode.ID)
		}

		return processedRPS * (1 - normalizedHitRate(sourceNode)), nil
	default:
		return 0, fmt.Errorf("edge %q uses unsupported routing rule %q", edge.ID, edge.RoutingRule.RuleType)
	}
}

func normalizedHitRate(node domain.Node) float64 {
	return min(max(node.Properties.CacheHitRate, 0), 1)
}

func estimateLatency(baseLatencyMS, utilization float64) float64 {
	if baseLatencyMS <= 0 {
		baseLatencyMS = 1
	}

	switch {
	case utilization <= 0.7:
		return baseLatencyMS
	case utilization <= 1:
		return baseLatencyMS * (1 + ((utilization - 0.7) * 3))
	default:
		return baseLatencyMS * (1.9 + ((utilization - 1) * 4))
	}
}

func explainNode(node domain.Node, incomingRPS, effectiveCapacity float64, saturated bool) string {
	switch node.Archetype {
	case domain.NodeArchetypeGateway:
		if saturated {
			return fmt.Sprintf(
				"%s is the entry bottleneck: %.0f requests/sec arrive, but only %.0f requests/sec can be forwarded downstream.",
				node.Label,
				incomingRPS,
				effectiveCapacity,
			)
		}

		return fmt.Sprintf(
			"%s forwards %.0f requests/sec and still has headroom before its %.0f requests/sec ceiling.",
			node.Label,
			incomingRPS,
			effectiveCapacity,
		)
	case domain.NodeArchetypeQueue:
		if saturated {
			return fmt.Sprintf(
				"%s is receiving work faster than it can buffer or dispatch it. At %.0f requests/sec in and %.0f requests/sec of effective throughput, queue lag would grow.",
				node.Label,
				incomingRPS,
				effectiveCapacity,
			)
		}

		return fmt.Sprintf(
			"%s keeps up with %.0f queued operations/sec against an effective throughput of %.0f operations/sec.",
			node.Label,
			incomingRPS,
			effectiveCapacity,
		)
	case domain.NodeArchetypeWorker:
		if saturated {
			return fmt.Sprintf(
				"%s cannot consume queued work fast enough: %.0f requests/sec arrive for %.0f requests/sec of worker throughput.",
				node.Label,
				incomingRPS,
				effectiveCapacity,
			)
		}

		return fmt.Sprintf(
			"%s keeps up with queued work at %.0f requests/sec against %.0f requests/sec of worker throughput.",
			node.Label,
			incomingRPS,
			effectiveCapacity,
		)
	}

	if saturated {
		return fmt.Sprintf(
			"%s receives %.0f requests/sec but can only handle %.0f requests/sec with its current configuration.",
			node.Label,
			incomingRPS,
			effectiveCapacity,
		)
	}

	return fmt.Sprintf(
		"%s stays within capacity at %.0f requests/sec against an effective ceiling of %.0f requests/sec.",
		node.Label,
		incomingRPS,
		effectiveCapacity,
	)
}

func summarize(design domain.Design, workload domain.Workload, bottleneck domain.NodeSimulationResult) string {
	status := "is the tightest component but still within capacity"
	if bottleneck.Saturated {
		status = "saturates first"
	}

	return fmt.Sprintf(
		"For %.0f requests/sec on %q, %s %s at %.0f%% utilization.",
		workload.RequestsPerSecond,
		design.Name,
		bottleneck.Label,
		status,
		bottleneck.Utilization*100,
	)
}

func round(value float64) float64 {
	return math.Round(value*100) / 100
}

func min(a, b float64) float64 {
	return math.Min(a, b)
}

func max(a, b float64) float64 {
	return math.Max(a, b)
}
