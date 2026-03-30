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
	Paths      []domain.PathExplanation
	Bottleneck *domain.NodeSimulationResult
	Ticks      []domain.SimulationTick
}

const queueBacklogWindowSeconds = 5.0

func NewService() *Service {
	return &Service{}
}

func (s *Service) RunDesign(
	design domain.Design,
	workload domain.Workload,
) (*domain.SimulationResult, error) {
	return s.RunDesignWithConfig(design, workload, domain.SimulationConfig{
		Mode: domain.SimulationModeAnalytical,
	})
}

func (s *Service) RunDesignWithConfig(
	design domain.Design,
	workload domain.Workload,
	config domain.SimulationConfig,
) (*domain.SimulationResult, error) {
	if workload.RequestsPerSecond <= 0 {
		return nil, errors.New("workload.requests_per_second must be greater than zero")
	}

	config = normalizeSimulationConfig(config)
	globalWorkload := normalizeWorkload(workload)
	requestClasses := normalizeRequestClasses(design.Graph.RequestClasses)
	defaultRequestClassID := requestClasses[0].ID

	flowResults := make([]domain.FlowSimulationResult, 0, len(requestClasses))
	aggregateIncomingByNode := make(map[string]float64, len(design.Graph.Nodes))
	aggregateRoutedByEdge := make(map[string]float64, len(design.Graph.Edges))
	aggregateTicks := make([]domain.SimulationTick, 0)

	for _, requestClass := range requestClasses {
		flowWorkload := scaleWorkload(workload, requestClass.TrafficShare)
		normalizedFlowWorkload := normalizeWorkload(flowWorkload)
		flowEdges := filterEdgesForRequestClass(
			design.Graph.Edges,
			requestClass.ID,
			defaultRequestClassID,
		)

		var (
			metrics *graphMetrics
			err     error
		)
		switch config.Mode {
		case domain.SimulationModeTickBased:
			metrics, err = s.runGraphTickBased(design.Graph.Nodes, flowEdges, normalizedFlowWorkload, config)
		default:
			metrics, err = s.runGraph(design.Graph.Nodes, flowEdges, normalizedFlowWorkload)
		}
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
			Paths:          metrics.Paths,
			Ticks:          metrics.Ticks,
		})

		if len(metrics.Ticks) > 0 {
			aggregateTicks = mergeSimulationTicks(aggregateTicks, metrics.Ticks)
		}
	}

	overallMetrics := aggregateMetrics(design, globalWorkload, aggregateIncomingByNode, aggregateRoutedByEdge)
	if len(aggregateTicks) > 0 {
		overallMetrics = aggregateTickMetrics(design.Graph.Nodes, design.Graph.Edges, aggregateTicks)
	}

	return &domain.SimulationResult{
		Nodes:      overallMetrics.Nodes,
		Edges:      overallMetrics.Edges,
		Paths:      overallMetrics.Paths,
		Bottleneck: overallMetrics.Bottleneck,
		Summary:    summarize(design, globalWorkload, *overallMetrics.Bottleneck),
		Flows:      flowResults,
		Ticks:      aggregateTicks,
	}, nil
}

func (s *Service) StreamDesignWithConfig(
	design domain.Design,
	workload domain.Workload,
	config domain.SimulationConfig,
	observeTick func(domain.SimulationTick),
) (*domain.SimulationResult, error) {
	if workload.RequestsPerSecond <= 0 {
		return nil, errors.New("workload.requests_per_second must be greater than zero")
	}

	config = normalizeSimulationConfig(config)
	config.Mode = domain.SimulationModeTickBased

	globalWorkload := normalizeWorkload(workload)
	requestClasses := normalizeRequestClasses(design.Graph.RequestClasses)
	defaultRequestClassID := requestClasses[0].ID

	flowResults := make([]domain.FlowSimulationResult, 0, len(requestClasses))
	aggregateTicks := make([]domain.SimulationTick, 0)

	for _, requestClass := range requestClasses {
		flowWorkload := scaleWorkload(workload, requestClass.TrafficShare)
		normalizedFlowWorkload := normalizeWorkload(flowWorkload)
		flowEdges := filterEdgesForRequestClass(design.Graph.Edges, requestClass.ID, defaultRequestClassID)

		metrics, err := s.runGraphTickBasedWithObserver(
			design.Graph.Nodes,
			flowEdges,
			normalizedFlowWorkload,
			config,
			nil,
		)
		if err != nil {
			return nil, err
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
			Paths:          metrics.Paths,
			Ticks:          metrics.Ticks,
		})

		if len(metrics.Ticks) > 0 {
			aggregateTicks = mergeSimulationTicks(aggregateTicks, metrics.Ticks)
		}
	}

	overallMetrics := aggregateTickMetrics(design.Graph.Nodes, design.Graph.Edges, aggregateTicks)
	result := &domain.SimulationResult{
		Nodes:      overallMetrics.Nodes,
		Edges:      overallMetrics.Edges,
		Paths:      overallMetrics.Paths,
		Bottleneck: overallMetrics.Bottleneck,
		Summary:    summarize(design, globalWorkload, *overallMetrics.Bottleneck),
		Flows:      flowResults,
		Ticks:      aggregateTicks,
	}

	if observeTick != nil {
		for _, tick := range aggregateTicks {
			observeTick(tick)
		}
	}

	return result, nil
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
	rawEdgeResults := make([]domain.EdgeSimulationResult, 0, len(edges))

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

			routed *= routeShare(edge, outgoing[nodeID])

			incomingRate[edge.TargetNodeID] += routed
			rawEdgeResults = append(rawEdgeResults, domain.EdgeSimulationResult{
				EdgeID:           edge.ID,
				SourceNodeID:     edge.SourceNodeID,
				TargetNodeID:     edge.TargetNodeID,
				InteractionType:  edge.InteractionType,
				FanoutMultiplier: round(normalizedEdgeFanout(edge)),
				TimeoutMS:        round(edge.TimeoutMS),
				RetryAttempts:    edge.RetryAttempts,
				RetryBudgetRatio: round(edge.RetryBudgetRatio),
				RuleType:         edge.RoutingRule.RuleType,
				RoutingWeight:    round(routingWeight(edge)),
				AttemptedRPS:     round(routed),
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

	edgeResults := enrichEdgeResults(edges, rawEdgeResults, nodeResults)
	paths := buildPathExplanations(nodes, edgeResults, nodeResults, bottleneck)

	return &graphMetrics{
		Nodes:      nodeList,
		Edges:      edgeResults,
		Paths:      paths,
		Bottleneck: bottleneck,
		Ticks:      nil,
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

	effectiveCapacity := effectiveNodeCapacityRPS(node, workload, incomingRPS)
	if effectiveCapacity <= 0 {
		effectiveCapacity = 1
	}

	processed := math.Min(incomingRPS, effectiveCapacity)
	dropped := math.Max(0, incomingRPS-effectiveCapacity)
	utilization := incomingRPS / effectiveCapacity
	latency := estimateLatency(node.Properties.BaseLatencyMS, utilization, node, workload)
	queueDepthEstimate := 0.0
	queueLagMS := 0.0
	if node.Archetype == domain.NodeArchetypeQueue && effectiveCapacity > 0 {
		queueDepthEstimate = math.Max(0, incomingRPS-effectiveCapacity) * queueBacklogWindowSeconds
		queueLagMS = (queueDepthEstimate / effectiveCapacity) * 1000
		latency += queueLagMS
	}
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
		QueueDepthEstimate:   round(queueDepthEstimate),
		QueueLagMS:           round(queueLagMS),
		Saturated:            saturated,
		Explanation:          explainNode(node, incomingRPS, effectiveCapacity, saturated, queueLagMS),
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

func effectiveNodeCapacityRPS(node domain.Node, workload normalizedWorkload, incomingRPS float64) float64 {
	replicas := max(float64(node.Properties.Replicas), 1)
	baseCapacity := node.Properties.CapacityRPS
	if baseCapacity <= 0 {
		baseCapacity = 1
	}

	switch node.Archetype {
	case domain.NodeArchetypeDatabase:
		readCapacity := node.Properties.ReadCapacityRPS
		writeCapacity := node.Properties.WriteCapacityRPS
		if readCapacity <= 0 {
			readCapacity = baseCapacity
		}
		if writeCapacity <= 0 {
			writeCapacity = max(baseCapacity*0.55, 1)
		}

		readPoolSize := max(replicas-1, 1)
		writePoolSize := 1.0
		if replicas == 1 {
			readPoolSize = 1
		}

		totalReadCapacity := readCapacity * readPoolSize
		totalWriteCapacity := writeCapacity * writePoolSize
		baseCapacity = weightedOperationCapacity(totalReadCapacity, totalWriteCapacity, workload.ReadShare, workload.WriteShare)
	default:
		baseCapacity *= replicas
	}

	effectiveCapacity := baseCapacity / capacityPenalty(node, workload)
	if node.Archetype == domain.NodeArchetypeDatabase && node.Properties.ConnectionLimit > 0 {
		effectiveCapacity /= connectionPressurePenalty(node.Properties.ConnectionLimit, incomingRPS)
	}

	return max(effectiveCapacity, 1)
}

func routeShare(edge domain.Edge, siblingEdges []domain.Edge) float64 {
	if !shouldSplitOutgoingLoad(edge) {
		return 1
	}

	peers := make([]domain.Edge, 0, len(siblingEdges))
	totalWeight := 0.0

	for _, sibling := range siblingEdges {
		if sibling.InteractionType != edge.InteractionType {
			continue
		}

		if sibling.RoutingRule.RuleType != edge.RoutingRule.RuleType {
			continue
		}

		peers = append(peers, sibling)
		totalWeight += routingWeight(sibling)
	}

	if len(peers) <= 1 || totalWeight <= 0 {
		return 1
	}

	return routingWeight(edge) / totalWeight
}

func shouldSplitOutgoingLoad(edge domain.Edge) bool {
	switch edge.InteractionType {
	case domain.EdgeInteractionSyncRequest, domain.EdgeInteractionConsume, domain.EdgeInteractionConditionalPath, domain.EdgeInteractionFallback:
		return true
	default:
		return false
	}
}

func routingWeight(edge domain.Edge) float64 {
	if edge.RoutingRule.Value > 0 {
		return edge.RoutingRule.Value
	}

	return 1
}

func normalizedEdgeFanout(edge domain.Edge) float64 {
	if edge.FanoutMultiplier <= 0 {
		return 1
	}

	return edge.FanoutMultiplier
}

func normalizedHitRate(node domain.Node) float64 {
	hitRate := min(max(node.Properties.CacheHitRate, 0), 1)
	if node.Properties.CacheInvalidationRate > 0 {
		hitRate *= 1 - min(max(node.Properties.CacheInvalidationRate, 0), 0.95)
	}
	return min(max(hitRate, 0), 1)
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

func explainNode(node domain.Node, incomingRPS, effectiveCapacity float64, saturated bool, queueLagMS float64) string {
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
				"%s is receiving work faster than it can buffer or dispatch it. At %.0f requests/sec in and %.0f requests/sec of effective throughput, queue lag grows toward %.0f ms.",
				node.Label,
				incomingRPS,
				effectiveCapacity,
				queueLagMS,
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
	nodeResults := make(map[string]domain.NodeSimulationResult, len(design.Graph.Nodes))
	var bottleneck *domain.NodeSimulationResult

	for _, node := range design.Graph.Nodes {
		incoming := incomingByNode[node.ID]
		if node.Archetype == domain.NodeArchetypeClient {
			incoming = workload.RequestsPerSecond
		}

		result := simulateNode(node, incoming, workload)
		nodeList = append(nodeList, result)
		nodeResults[node.ID] = result

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
			TimeoutMS:        round(edge.TimeoutMS),
			RetryAttempts:    edge.RetryAttempts,
			RetryBudgetRatio: round(edge.RetryBudgetRatio),
			RuleType:         edge.RoutingRule.RuleType,
			RoutingWeight:    round(routingWeight(edge)),
			AttemptedRPS:     round(routedByEdge[edge.ID]),
			RoutedRPS:        round(routedByEdge[edge.ID]),
		})
	}

	edgeList = enrichEdgeResults(design.Graph.Edges, edgeList, nodeResults)
	paths := buildPathExplanations(design.Graph.Nodes, edgeList, nodeResults, bottleneck)

	return &graphMetrics{
		Nodes:      nodeList,
		Edges:      edgeList,
		Paths:      paths,
		Bottleneck: bottleneck,
		Ticks:      nil,
	}
}

func enrichEdgeResults(
	edges []domain.Edge,
	rawEdgeResults []domain.EdgeSimulationResult,
	nodeResults map[string]domain.NodeSimulationResult,
) []domain.EdgeSimulationResult {
	edgeByID := make(map[string]domain.Edge, len(edges))
	for _, edge := range edges {
		edgeByID[edge.ID] = edge
	}

	enriched := make([]domain.EdgeSimulationResult, 0, len(rawEdgeResults))
	for _, edgeResult := range rawEdgeResults {
		edge := edgeByID[edgeResult.EdgeID]
		targetResult, hasTarget := nodeResults[edgeResult.TargetNodeID]
		if !hasTarget {
			enriched = append(enriched, edgeResult)
			continue
		}

		attempted := edgeResult.RoutedRPS
		delivered := edgeResult.RoutedRPS
		retried := 0.0
		timedOut := 0.0

		timeoutRatio := timeoutFailureRatio(edge.TimeoutMS, targetResult.EstimatedLatencyMS)
		if timeoutRatio > 0 {
			baseFailures := edgeResult.RoutedRPS * timeoutRatio
			delivered = edgeResult.RoutedRPS - baseFailures
			remainingFailures := baseFailures

			for attempt := 0; attempt < edge.RetryAttempts; attempt++ {
				retried += remainingFailures
				attempted += remainingFailures
				recovered := remainingFailures * (1 - timeoutRatio)
				delivered += recovered
				remainingFailures = remainingFailures * timeoutRatio
			}

			timedOut = remainingFailures
		}

		edgeResult.AttemptedRPS = round(attempted)
		edgeResult.RetriedRPS = round(retried)
		edgeResult.TimedOutRPS = round(timedOut)
		edgeResult.RoutedRPS = round(max(0, delivered))
		enriched = append(enriched, edgeResult)
	}

	return enriched
}

func timeoutFailureRatio(timeoutMS, targetLatencyMS float64) float64 {
	if timeoutMS <= 0 || targetLatencyMS <= timeoutMS {
		return 0
	}

	ratio := (targetLatencyMS - timeoutMS) / max(targetLatencyMS, 1)
	return min(max(ratio, 0.05), 0.95)
}

func buildPathExplanations(
	nodes []domain.Node,
	edges []domain.EdgeSimulationResult,
	nodeResults map[string]domain.NodeSimulationResult,
	bottleneck *domain.NodeSimulationResult,
) []domain.PathExplanation {
	if bottleneck == nil {
		return nil
	}

	nodeByID := make(map[string]domain.Node, len(nodes))
	incomingByTarget := make(map[string][]domain.EdgeSimulationResult, len(edges))
	for _, node := range nodes {
		nodeByID[node.ID] = node
	}
	for _, edge := range edges {
		incomingByTarget[edge.TargetNodeID] = append(incomingByTarget[edge.TargetNodeID], edge)
	}

	criticalNodeIDs, criticalEdgeIDs := traceCriticalPath(bottleneck.NodeID, incomingByTarget)
	criticalLatency := 0.0
	totalQueueLag := 0.0
	totalRetried := 0.0
	totalTimedOut := 0.0
	nodeLabels := make([]string, 0, len(criticalNodeIDs))
	for _, nodeID := range criticalNodeIDs {
		if node, ok := nodeByID[nodeID]; ok {
			nodeLabels = append(nodeLabels, node.Label)
		}
		if result, ok := nodeResults[nodeID]; ok {
			criticalLatency += result.EstimatedLatencyMS
			totalQueueLag += result.QueueLagMS
		}
	}
	for _, edgeID := range criticalEdgeIDs {
		for _, edge := range edges {
			if edge.EdgeID == edgeID {
				totalRetried += edge.RetriedRPS
				totalTimedOut += edge.TimedOutRPS
				break
			}
		}
	}

	paths := []domain.PathExplanation{
		{
			Kind:               "critical_path",
			Summary:            buildCriticalPathSummary(nodeLabels, *bottleneck, totalQueueLag, totalRetried, totalTimedOut),
			NodeIDs:            criticalNodeIDs,
			EdgeIDs:            criticalEdgeIDs,
			EstimatedLatencyMS: round(criticalLatency),
			QueueLagMS:         round(totalQueueLag),
			RetriedRPS:         round(totalRetried),
			TimedOutRPS:        round(totalTimedOut),
		},
	}

	var slowestQueue *domain.NodeSimulationResult
	for _, result := range nodeResults {
		if result.Archetype != domain.NodeArchetypeQueue || result.QueueLagMS <= 0 {
			continue
		}
		if slowestQueue == nil || result.QueueLagMS > slowestQueue.QueueLagMS {
			current := result
			slowestQueue = &current
		}
	}

	if slowestQueue != nil {
		queueNodeIDs, queueEdgeIDs := traceCriticalPath(slowestQueue.NodeID, incomingByTarget)
		paths = append(paths, domain.PathExplanation{
			Kind:               "queue_backlog",
			Summary:            fmt.Sprintf("%s is building backlog with %.0f ms of queue lag while %.0f requests/sec arrive and %.0f requests/sec are processed.", slowestQueue.Label, slowestQueue.QueueLagMS, slowestQueue.IncomingRPS, slowestQueue.ProcessedRPS),
			NodeIDs:            queueNodeIDs,
			EdgeIDs:            queueEdgeIDs,
			EstimatedLatencyMS: round(slowestQueue.EstimatedLatencyMS),
			QueueLagMS:         round(slowestQueue.QueueLagMS),
		})
	}

	var fallbackEdge *domain.EdgeSimulationResult
	for _, edge := range edges {
		if edge.FallbackRPS <= 0 && edge.DeadLetteredRPS <= 0 {
			continue
		}
		if fallbackEdge == nil || (edge.FallbackRPS+edge.DeadLetteredRPS) > (fallbackEdge.FallbackRPS+fallbackEdge.DeadLetteredRPS) {
			current := edge
			fallbackEdge = &current
		}
	}

	if fallbackEdge != nil {
		fallbackNodeIDs, fallbackEdgeIDs := traceCriticalPath(fallbackEdge.SourceNodeID, incomingByTarget)
		fallbackNodeIDs = append(fallbackNodeIDs, fallbackEdge.TargetNodeID)
		fallbackEdgeIDs = append(fallbackEdgeIDs, fallbackEdge.EdgeID)
		summary := fmt.Sprintf("Fallback path activated with %.0f requests/sec.", fallbackEdge.FallbackRPS)
		kind := "fallback_activation"
		if fallbackEdge.DeadLetteredRPS > 0 {
			summary = fmt.Sprintf("Dead-letter handling activated with %.0f requests/sec moved into a queue fallback.", fallbackEdge.DeadLetteredRPS)
			kind = "dead_letter_path"
		}
		paths = append(paths, domain.PathExplanation{
			Kind:            kind,
			Summary:         summary,
			NodeIDs:         fallbackNodeIDs,
			EdgeIDs:         fallbackEdgeIDs,
			FallbackRPS:     round(fallbackEdge.FallbackRPS),
			DeadLetteredRPS: round(fallbackEdge.DeadLetteredRPS),
			TimedOutRPS:     round(fallbackEdge.TimedOutRPS),
		})
	}

	return paths
}

func traceCriticalPath(targetNodeID string, incomingByTarget map[string][]domain.EdgeSimulationResult) ([]string, []string) {
	nodeIDs := []string{targetNodeID}
	edgeIDs := make([]string, 0)
	visited := map[string]struct{}{targetNodeID: {}}
	currentNodeID := targetNodeID

	for {
		incomingEdges := incomingByTarget[currentNodeID]
		if len(incomingEdges) == 0 {
			break
		}

		bestEdge := incomingEdges[0]
		for _, candidate := range incomingEdges[1:] {
			if candidate.RoutedRPS > bestEdge.RoutedRPS {
				bestEdge = candidate
			}
		}

		if bestEdge.RoutedRPS <= 0 {
			break
		}

		if _, seen := visited[bestEdge.SourceNodeID]; seen {
			break
		}

		nodeIDs = append([]string{bestEdge.SourceNodeID}, nodeIDs...)
		edgeIDs = append([]string{bestEdge.EdgeID}, edgeIDs...)
		visited[bestEdge.SourceNodeID] = struct{}{}
		currentNodeID = bestEdge.SourceNodeID
	}

	return nodeIDs, edgeIDs
}

func buildCriticalPathSummary(
	nodeLabels []string,
	bottleneck domain.NodeSimulationResult,
	queueLagMS float64,
	retriedRPS float64,
	timedOutRPS float64,
) string {
	pathLabel := bottleneck.Label
	if len(nodeLabels) > 0 {
		pathLabel = ""
		for index, label := range nodeLabels {
			if index > 0 {
				pathLabel += " -> "
			}
			pathLabel += label
		}
	}

	summary := fmt.Sprintf("%s is the hottest path and converges on %s at %.0f%% utilization.", pathLabel, bottleneck.Label, bottleneck.Utilization*100)
	if queueLagMS > 0 {
		summary += fmt.Sprintf(" Queue lag on this path adds about %.0f ms.", queueLagMS)
	}
	if retriedRPS > 0 {
		summary += fmt.Sprintf(" Retries amplify load by %.0f requests/sec.", retriedRPS)
	}
	if timedOutRPS > 0 {
		summary += fmt.Sprintf(" About %.0f requests/sec still time out after retries.", timedOutRPS)
	}

	return summary
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

func weightedOperationCapacity(readCapacity, writeCapacity, readShare, writeShare float64) float64 {
	readCapacity = max(readCapacity, 1)
	writeCapacity = max(writeCapacity, 1)
	totalShare := max(readShare+writeShare, 1)
	readShare /= totalShare
	writeShare /= totalShare
	return 1 / ((readShare / readCapacity) + (writeShare / writeCapacity))
}

func connectionPressurePenalty(connectionLimit int, incomingRPS float64) float64 {
	if connectionLimit <= 0 {
		return 1
	}
	connectionLoad := incomingRPS / float64(connectionLimit)
	if connectionLoad <= 1 {
		return 1
	}
	return 1 + min((connectionLoad-1)*0.75, 2.5)
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
