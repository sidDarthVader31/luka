package simulator

import (
	"errors"
	"fmt"
	"math"
	"slices"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

type Service struct{}

type normalizedWorkload struct {
	RequestsPerSecond float64
	ConcurrentUsers   float64
	ReadWriteRatio    float64
	ReadShare         float64
	WriteShare        float64
	PayloadKB         float64
	FanoutCount       float64
}

type normalizedRequestClass struct {
	ID           string
	Name         string
	TrafficShare float64
}

type graphMetrics struct {
	Nodes      []domain.NodeSimulationResult
	Edges      []domain.EdgeSimulationResult
	Bottleneck *domain.NodeSimulationResult
}

func NewService() *Service {
	return &Service{}
}

func (s *Service) RunDesign(design domain.Design, workload domain.Workload) (*domain.SimulationResult, error) {
	if workload.RequestsPerSecond <= 0 {
		return nil, errors.New("workload.requests_per_second must be greater than zero")
	}

	globalWorkload := normalizeWorkload(workload)
	requestClasses := normalizeRequestClasses(design.Graph.RequestClasses)
	defaultRequestClassID := requestClasses[0].ID

	flowResults := make([]domain.FlowSimulationResult, 0, len(requestClasses))
	aggregateIncomingByNode := make(map[string]float64, len(design.Graph.Nodes))
	aggregateRoutedByEdge := make(map[string]float64, len(design.Graph.Edges))

	for _, requestClass := range requestClasses {
		flowWorkload := scaleWorkload(workload, requestClass.TrafficShare)
		normalizedFlowWorkload := normalizeWorkload(flowWorkload)
		flowEdges := filterEdgesForRequestClass(
			design.Graph.Edges,
			requestClass.ID,
			defaultRequestClassID,
		)

		metrics, err := s.runGraph(design.Graph.Nodes, flowEdges, normalizedFlowWorkload)
		if err != nil {
			return nil, err
		}

		for _, node := range metrics.Nodes {
			aggregateIncomingByNode[node.NodeID] += node.IncomingRPS
		}

		for _, edge := range metrics.Edges {
			aggregateRoutedByEdge[edge.EdgeID] += edge.RoutedRPS
		}

		flowResults = append(flowResults, domain.FlowSimulationResult{
			RequestClassID: requestClass.ID,
			Name:           requestClass.Name,
			TrafficShare:   round(requestClass.TrafficShare * 100),
			Workload:       flowWorkload,
			Summary:        summarizeFlow(design.Name, requestClass.Name, normalizedFlowWorkload, *metrics.Bottleneck),
			Bottleneck:     metrics.Bottleneck,
			Nodes:          metrics.Nodes,
			Edges:          metrics.Edges,
		})
	}

	overallMetrics := aggregateMetrics(
		design,
		globalWorkload,
		aggregateIncomingByNode,
		aggregateRoutedByEdge,
	)

	return &domain.SimulationResult{
		Nodes:      overallMetrics.Nodes,
		Edges:      overallMetrics.Edges,
		Bottleneck: overallMetrics.Bottleneck,
		Summary:    summarize(design, globalWorkload, *overallMetrics.Bottleneck),
		Flows:      flowResults,
	}, nil
}

func (s *Service) runGraph(
	nodes []domain.Node,
	edges []domain.Edge,
	workload normalizedWorkload,
) (*graphMetrics, error) {
	nodeByID := make(map[string]domain.Node, len(nodes))
	inDegree := make(map[string]int, len(nodes))
	outgoing := make(map[string][]domain.Edge, len(nodes))
	incomingRate := make(map[string]float64, len(nodes))
	nodeResults := make(map[string]domain.NodeSimulationResult, len(nodes))
	edgeResults := make([]domain.EdgeSimulationResult, 0, len(edges))

	clientCount := 0
	for _, node := range nodes {
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

	for _, edge := range edges {
		if _, ok := nodeByID[edge.SourceNodeID]; !ok {
			return nil, fmt.Errorf("edge %q references unknown source node %q", edge.ID, edge.SourceNodeID)
		}

		if _, ok := nodeByID[edge.TargetNodeID]; !ok {
			return nil, fmt.Errorf("edge %q references unknown target node %q", edge.ID, edge.TargetNodeID)
		}

		inDegree[edge.TargetNodeID]++
		outgoing[edge.SourceNodeID] = append(outgoing[edge.SourceNodeID], edge)
	}

	queue := make([]string, 0, len(nodes))
	for _, node := range nodes {
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

		result := simulateNode(node, incoming, workload)
		nodeResults[nodeID] = result
		processedNodes++

		for _, edge := range outgoing[nodeID] {
			routed, err := applyRoutingRule(edge, node, result, workload)
			if err != nil {
				return nil, err
			}

			incomingRate[edge.TargetNodeID] += routed
			edgeResults = append(edgeResults, domain.EdgeSimulationResult{
				EdgeID:           edge.ID,
				SourceNodeID:     edge.SourceNodeID,
				TargetNodeID:     edge.TargetNodeID,
				InteractionType:  edge.InteractionType,
				FanoutMultiplier: round(normalizedEdgeFanout(edge)),
				RuleType:         edge.RoutingRule.RuleType,
				RoutedRPS:        round(routed),
			})

			inDegree[edge.TargetNodeID]--
			if inDegree[edge.TargetNodeID] == 0 {
				queue = append(queue, edge.TargetNodeID)
			}
		}
	}

	if processedNodes != len(nodes) {
		return nil, errors.New("the first simulator slice supports DAG graphs only")
	}

	nodeList := make([]domain.NodeSimulationResult, 0, len(nodes))
	var bottleneck *domain.NodeSimulationResult

	for _, node := range nodes {
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

	return &graphMetrics{
		Nodes:      nodeList,
		Edges:      edgeResults,
		Bottleneck: bottleneck,
	}, nil
}

func simulateNode(node domain.Node, incomingRPS float64, workload normalizedWorkload) domain.NodeSimulationResult {
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

	effectiveCapacity = effectiveCapacity / capacityPenalty(node, workload)
	if effectiveCapacity <= 0 {
		effectiveCapacity = 1
	}

	processed := math.Min(incomingRPS, effectiveCapacity)
	dropped := math.Max(0, incomingRPS-effectiveCapacity)
	utilization := incomingRPS / effectiveCapacity
	latency := estimateLatency(node.Properties.BaseLatencyMS, utilization, node, workload)
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

func applyRoutingRule(
	edge domain.Edge,
	sourceNode domain.Node,
	sourceResult domain.NodeSimulationResult,
	workload normalizedWorkload,
) (float64, error) {
	var routed float64

	if edge.InteractionType == domain.EdgeInteractionFallback {
		routed = sourceResult.DroppedRPS
	} else {
		switch edge.RoutingRule.RuleType {
		case domain.RoutingRuleAlways:
			routed = sourceResult.ProcessedRPS
		case domain.RoutingRuleCacheHit:
			if sourceNode.Archetype != domain.NodeArchetypeCache {
				return 0, fmt.Errorf("edge %q uses cache_hit but source node %q is not a cache", edge.ID, sourceNode.ID)
			}

			routed = sourceResult.ProcessedRPS * normalizedHitRate(sourceNode)
		case domain.RoutingRuleCacheMiss:
			if sourceNode.Archetype != domain.NodeArchetypeCache {
				return 0, fmt.Errorf("edge %q uses cache_miss but source node %q is not a cache", edge.ID, sourceNode.ID)
			}

			routed = sourceResult.ProcessedRPS * (1 - normalizedHitRate(sourceNode))
		default:
			return 0, fmt.Errorf("edge %q uses unsupported routing rule %q", edge.ID, edge.RoutingRule.RuleType)
		}
	}

	if edge.InteractionType == domain.EdgeInteractionAsyncEnqueue && workload.FanoutCount > 1 {
		routed *= workload.FanoutCount
	}

	routed *= normalizedEdgeFanout(edge)

	return routed, nil
}

func normalizedEdgeFanout(edge domain.Edge) float64 {
	if edge.FanoutMultiplier <= 0 {
		return 1
	}

	return edge.FanoutMultiplier
}

func normalizedHitRate(node domain.Node) float64 {
	return min(max(node.Properties.CacheHitRate, 0), 1)
}

func estimateLatency(
	baseLatencyMS float64,
	utilization float64,
	node domain.Node,
	workload normalizedWorkload,
) float64 {
	if baseLatencyMS <= 0 {
		baseLatencyMS = 1
	}

	baseLatencyMS *= 1 + ((payloadPenalty(workload.PayloadKB) - 1) * 0.4)
	baseLatencyMS *= 1 + ((concurrencyPenalty(node, workload) - 1) * 0.35)

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

func summarize(design domain.Design, workload normalizedWorkload, bottleneck domain.NodeSimulationResult) string {
	status := "is the tightest component but still within capacity"
	if bottleneck.Saturated {
		status = "saturates first"
	}

	return fmt.Sprintf(
		"For %.0f requests/sec with %.0f concurrent users, %.1f:1 read/write, %.0f KB payload, and fanout x%.0f on %q, %s %s at %.0f%% utilization.",
		workload.RequestsPerSecond,
		workload.ConcurrentUsers,
		workload.ReadWriteRatio,
		workload.PayloadKB,
		workload.FanoutCount,
		design.Name,
		bottleneck.Label,
		status,
		bottleneck.Utilization*100,
	)
}

func summarizeFlow(
	designName string,
	flowName string,
	workload normalizedWorkload,
	bottleneck domain.NodeSimulationResult,
) string {
	status := "is the tightest component but still within capacity"
	if bottleneck.Saturated {
		status = "saturates first"
	}

	return fmt.Sprintf(
		"%q on %q runs at %.0f requests/sec and %s %s at %.0f%% utilization.",
		flowName,
		designName,
		workload.RequestsPerSecond,
		bottleneck.Label,
		status,
		bottleneck.Utilization*100,
	)
}

func normalizeRequestClasses(requestClasses []domain.RequestClass) []normalizedRequestClass {
	if len(requestClasses) == 0 {
		return []normalizedRequestClass{
			{
				ID:           "primary-flow",
				Name:         "Primary Flow",
				TrafficShare: 1,
			},
		}
	}

	totalShare := 0.0
	normalized := make([]normalizedRequestClass, 0, len(requestClasses))
	for _, requestClass := range requestClasses {
		share := requestClass.TrafficShare
		if share <= 0 {
			share = 1
		}

		totalShare += share
		normalized = append(normalized, normalizedRequestClass{
			ID:           requestClass.ID,
			Name:         requestClass.Name,
			TrafficShare: share,
		})
	}

	for index := range normalized {
		normalized[index].TrafficShare /= totalShare
	}

	return normalized
}

func scaleWorkload(workload domain.Workload, share float64) domain.Workload {
	return domain.Workload{
		RequestsPerSecond: workload.RequestsPerSecond * share,
		ConcurrentUsers:   int(math.Round(float64(workload.ConcurrentUsers) * share)),
		ReadWriteRatio:    workload.ReadWriteRatio,
		PayloadKB:         workload.PayloadKB,
		FanoutCount:       workload.FanoutCount,
	}
}

func filterEdgesForRequestClass(
	edges []domain.Edge,
	requestClassID string,
	defaultRequestClassID string,
) []domain.Edge {
	filtered := make([]domain.Edge, 0, len(edges))
	for _, edge := range edges {
		if len(edge.RequestClassIDs) == 0 {
			if requestClassID == defaultRequestClassID {
				filtered = append(filtered, edge)
			}
			continue
		}

		if slices.Contains(edge.RequestClassIDs, requestClassID) {
			filtered = append(filtered, edge)
		}
	}

	return filtered
}

func aggregateMetrics(
	design domain.Design,
	workload normalizedWorkload,
	incomingByNode map[string]float64,
	routedByEdge map[string]float64,
) *graphMetrics {
	nodeList := make([]domain.NodeSimulationResult, 0, len(design.Graph.Nodes))
	edgeList := make([]domain.EdgeSimulationResult, 0, len(design.Graph.Edges))
	var bottleneck *domain.NodeSimulationResult

	for _, node := range design.Graph.Nodes {
		incoming := incomingByNode[node.ID]
		if node.Archetype == domain.NodeArchetypeClient {
			incoming = workload.RequestsPerSecond
		}

		result := simulateNode(node, incoming, workload)
		nodeList = append(nodeList, result)

		if node.Archetype == domain.NodeArchetypeClient {
			continue
		}

		if bottleneck == nil || result.Utilization > bottleneck.Utilization {
			current := result
			bottleneck = &current
		}
	}

	for _, edge := range design.Graph.Edges {
		edgeList = append(edgeList, domain.EdgeSimulationResult{
			EdgeID:           edge.ID,
			SourceNodeID:     edge.SourceNodeID,
			TargetNodeID:     edge.TargetNodeID,
			InteractionType:  edge.InteractionType,
			FanoutMultiplier: round(normalizedEdgeFanout(edge)),
			RuleType:         edge.RoutingRule.RuleType,
			RoutedRPS:        round(routedByEdge[edge.ID]),
		})
	}

	return &graphMetrics{
		Nodes:      nodeList,
		Edges:      edgeList,
		Bottleneck: bottleneck,
	}
}

func normalizeWorkload(workload domain.Workload) normalizedWorkload {
	readWriteRatio := workload.ReadWriteRatio
	if readWriteRatio <= 0 {
		readWriteRatio = 4
	}

	payloadKB := workload.PayloadKB
	if payloadKB <= 0 {
		payloadKB = 4
	}

	fanoutCount := workload.FanoutCount
	if fanoutCount <= 0 {
		fanoutCount = 1
	}

	concurrentUsers := workload.ConcurrentUsers
	if concurrentUsers < 0 {
		concurrentUsers = 0
	}

	writeShare := 1 / (readWriteRatio + 1)
	readShare := 1 - writeShare

	return normalizedWorkload{
		RequestsPerSecond: workload.RequestsPerSecond,
		ConcurrentUsers:   float64(concurrentUsers),
		ReadWriteRatio:    readWriteRatio,
		ReadShare:         readShare,
		WriteShare:        writeShare,
		PayloadKB:         payloadKB,
		FanoutCount:       float64(fanoutCount),
	}
}

func capacityPenalty(node domain.Node, workload normalizedWorkload) float64 {
	penalty := payloadPenalty(workload.PayloadKB)
	penalty *= writePenalty(node.Archetype, workload.WriteShare)
	penalty *= concurrencyPenalty(node, workload)

	if penalty < 1 {
		return 1
	}

	return penalty
}

func payloadPenalty(payloadKB float64) float64 {
	if payloadKB <= 4 {
		return 1
	}

	return 1 + ((payloadKB - 4) / 32)
}

func writePenalty(archetype domain.NodeArchetype, writeShare float64) float64 {
	switch archetype {
	case domain.NodeArchetypeDatabase:
		return 1 + (writeShare * 1.35)
	case domain.NodeArchetypeQueue, domain.NodeArchetypeWorker:
		return 1 + (writeShare * 0.9)
	case domain.NodeArchetypeStatelessService:
		return 1 + (writeShare * 0.45)
	case domain.NodeArchetypeGateway:
		return 1 + (writeShare * 0.2)
	case domain.NodeArchetypeCache:
		return 1 + (writeShare * 0.1)
	default:
		return 1
	}
}

func concurrencyPenalty(node domain.Node, workload normalizedWorkload) float64 {
	if workload.ConcurrentUsers <= 0 {
		return 1
	}

	replicas := 1
	if node.Properties.Replicas > 1 {
		replicas = node.Properties.Replicas
	}

	perReplicaSessions := workload.ConcurrentUsers / float64(replicas)

	switch node.Archetype {
	case domain.NodeArchetypeGateway:
		return 1 + min(perReplicaSessions/120000, 1.4)
	case domain.NodeArchetypeStatelessService, domain.NodeArchetypeWorker:
		return 1 + min(perReplicaSessions/180000, 1.1)
	case domain.NodeArchetypeQueue:
		return 1 + min(perReplicaSessions/280000, 0.5)
	default:
		return 1
	}
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
