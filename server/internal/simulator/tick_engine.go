package simulator

import (
	"errors"
	"fmt"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

const (
	defaultTickCount      = 24
	defaultTickDurationMS = 1000
)

type tickEdgeAttempt struct {
	edge          domain.Edge
	baseRoutedRPS float64
	retryLoadsRPS []float64
}

func normalizeSimulationConfig(config domain.SimulationConfig) domain.SimulationConfig {
	if config.Mode == "" {
		config.Mode = domain.SimulationModeTickBased
	}
	if config.TickCount <= 0 {
		config.TickCount = defaultTickCount
	}
	if config.TickDurationMS <= 0 {
		config.TickDurationMS = defaultTickDurationMS
	}
	return config
}

func (s *Service) runGraphTickBased(
	nodes []domain.Node,
	edges []domain.Edge,
	workload normalizedWorkload,
	config domain.SimulationConfig,
) (*graphMetrics, error) {
	nodeByID, outgoing, topoOrder, err := buildGraphExecutionPlan(nodes, edges)
	if err != nil {
		return nil, err
	}

	queueDepthByNode := make(map[string]float64, len(nodes))
	retryStateByEdge := make(map[string][]float64, len(edges))
	for _, edge := range edges {
		retryStateByEdge[edge.ID] = make([]float64, edge.RetryAttempts+1)
	}

	ticks := make([]domain.SimulationTick, 0, config.TickCount)
	nodePeakResults := make(map[string]domain.NodeSimulationResult, len(nodes))
	edgePeakResults := make(map[string]domain.EdgeSimulationResult, len(edges))

	tickDurationSeconds := float64(config.TickDurationMS) / 1000
	if tickDurationSeconds <= 0 {
		tickDurationSeconds = 1
	}

	for tickIndex := 0; tickIndex < config.TickCount; tickIndex++ {
		incomingByNode := make(map[string]float64, len(nodes))
		for _, edge := range edges {
			retryLoads := retryStateByEdge[edge.ID]
			if len(retryLoads) == 0 {
				continue
			}

			for stage := 1; stage < len(retryLoads); stage++ {
				incomingByNode[edge.TargetNodeID] += retryLoads[stage]
			}
		}

		nodeResults := make(map[string]domain.NodeSimulationResult, len(nodes))
		attemptsByEdge := make(map[string]tickEdgeAttempt, len(edges))

		for _, nodeID := range topoOrder {
			node := nodeByID[nodeID]
			incomingRPS := incomingByNode[nodeID]
			if node.Archetype == domain.NodeArchetypeClient {
				incomingRPS = workload.RequestsPerSecond
			}

			priorQueueDepth := 0.0
			if node.Archetype == domain.NodeArchetypeQueue {
				priorQueueDepth = queueDepthByNode[nodeID]
			}

			result, nextQueueDepth := simulateNodeTick(node, incomingRPS, priorQueueDepth, workload, tickDurationSeconds)
			nodeResults[nodeID] = result
			if node.Archetype == domain.NodeArchetypeQueue {
				queueDepthByNode[nodeID] = nextQueueDepth
			}

			for _, edge := range outgoing[nodeID] {
				routedRPS, routeErr := applyRoutingRule(edge, node, result, workload)
				if routeErr != nil {
					return nil, routeErr
				}

				routedRPS *= routeShare(edge, outgoing[nodeID])
				incomingByNode[edge.TargetNodeID] += routedRPS

				retryLoads := cloneFloatSlice(retryStateByEdge[edge.ID])
				attemptsByEdge[edge.ID] = tickEdgeAttempt{
					edge:          edge,
					baseRoutedRPS: routedRPS,
					retryLoadsRPS: retryLoads,
				}
			}
		}

		nextRetryState := make(map[string][]float64, len(edges))
		edgeResults := make([]domain.EdgeSimulationResult, 0, len(edges))

		for _, edge := range edges {
			attempt, exists := attemptsByEdge[edge.ID]
			if !exists {
				attempt = tickEdgeAttempt{
					edge:          edge,
					baseRoutedRPS: 0,
					retryLoadsRPS: cloneFloatSlice(retryStateByEdge[edge.ID]),
				}
			}

			edgeResult, scheduledRetries := finalizeTickEdgeResult(attempt, nodeResults[edge.TargetNodeID])
			nextRetryState[edge.ID] = scheduledRetries
			edgeResults = append(edgeResults, edgeResult)
		}

		retryStateByEdge = nextRetryState

		tickNodes := make([]domain.NodeTickState, 0, len(nodes))
		tickEdges := make([]domain.EdgeTickState, 0, len(edges))
		var tickBottleneck *domain.NodeSimulationResult

		for _, node := range nodes {
			result := nodeResults[node.ID]
			tickNodes = append(tickNodes, domain.NodeTickState{
				NodeID:             result.NodeID,
				IncomingRPS:        result.IncomingRPS,
				ProcessedRPS:       result.ProcessedRPS,
				DroppedRPS:         result.DroppedRPS,
				Utilization:        result.Utilization,
				EstimatedLatencyMS: result.EstimatedLatencyMS,
				QueueDepthEstimate: result.QueueDepthEstimate,
				QueueLagMS:         result.QueueLagMS,
				Saturated:          result.Saturated,
			})

			existing, exists := nodePeakResults[node.ID]
			if !exists || nodeSeverityScore(result) > nodeSeverityScore(existing) {
				nodePeakResults[node.ID] = result
			}

			if node.Archetype == domain.NodeArchetypeClient {
				continue
			}
			if tickBottleneck == nil || result.Utilization > tickBottleneck.Utilization {
				current := result
				tickBottleneck = &current
			}
		}

		for _, edgeResult := range edgeResults {
			tickEdges = append(tickEdges, domain.EdgeTickState{
				EdgeID:        edgeResult.EdgeID,
				AttemptedRPS:  edgeResult.AttemptedRPS,
				RoutedRPS:     edgeResult.RoutedRPS,
				RetriedRPS:    edgeResult.RetriedRPS,
				TimedOutRPS:   edgeResult.TimedOutRPS,
				RoutingWeight: edgeResult.RoutingWeight,
			})

			existing, exists := edgePeakResults[edgeResult.EdgeID]
			if !exists || edgeSeverityScore(edgeResult) > edgeSeverityScore(existing) {
				edgePeakResults[edgeResult.EdgeID] = edgeResult
			}
		}

		tickSummary := ""
		if tickBottleneck != nil {
			tickSummary = fmt.Sprintf(
				"Tick %d: %s is the tightest component at %.0f%% utilization.",
				tickIndex+1,
				tickBottleneck.Label,
				tickBottleneck.Utilization*100,
			)
		}

		ticks = append(ticks, domain.SimulationTick{
			Index:   tickIndex,
			TimeMS:  config.TickDurationMS * (tickIndex + 1),
			Summary: tickSummary,
			Nodes:   tickNodes,
			Edges:   tickEdges,
		})
	}

	nodeList := make([]domain.NodeSimulationResult, 0, len(nodes))
	var bottleneck *domain.NodeSimulationResult
	for _, node := range nodes {
		result := nodePeakResults[node.ID]
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

	edgeList := make([]domain.EdgeSimulationResult, 0, len(edges))
	for _, edge := range edges {
		edgeList = append(edgeList, edgePeakResults[edge.ID])
	}

	nodeResultsByID := make(map[string]domain.NodeSimulationResult, len(nodeList))
	for _, result := range nodeList {
		nodeResultsByID[result.NodeID] = result
	}

	paths := buildPathExplanations(nodes, edgeList, nodeResultsByID, bottleneck)
	return &graphMetrics{
		Nodes:      nodeList,
		Edges:      edgeList,
		Paths:      paths,
		Bottleneck: bottleneck,
		Ticks:      ticks,
	}, nil
}

func buildGraphExecutionPlan(
	nodes []domain.Node,
	edges []domain.Edge,
) (map[string]domain.Node, map[string][]domain.Edge, []string, error) {
	nodeByID := make(map[string]domain.Node, len(nodes))
	inDegree := make(map[string]int, len(nodes))
	outgoing := make(map[string][]domain.Edge, len(nodes))
	clientCount := 0

	for _, node := range nodes {
		if node.ID == "" {
			return nil, nil, nil, errors.New("all nodes must have an id")
		}
		nodeByID[node.ID] = node
		inDegree[node.ID] = 0
		if node.Archetype == domain.NodeArchetypeClient {
			clientCount++
		}
	}

	if clientCount != 1 {
		return nil, nil, nil, fmt.Errorf("the current simulator supports exactly one client node, got %d", clientCount)
	}

	for _, edge := range edges {
		if _, ok := nodeByID[edge.SourceNodeID]; !ok {
			return nil, nil, nil, fmt.Errorf("edge %q references unknown source node %q", edge.ID, edge.SourceNodeID)
		}
		if _, ok := nodeByID[edge.TargetNodeID]; !ok {
			return nil, nil, nil, fmt.Errorf("edge %q references unknown target node %q", edge.ID, edge.TargetNodeID)
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

	order := make([]string, 0, len(nodes))
	for len(queue) > 0 {
		nodeID := queue[0]
		queue = queue[1:]
		order = append(order, nodeID)

		for _, edge := range outgoing[nodeID] {
			inDegree[edge.TargetNodeID]--
			if inDegree[edge.TargetNodeID] == 0 {
				queue = append(queue, edge.TargetNodeID)
			}
		}
	}

	if len(order) != len(nodes) {
		return nil, nil, nil, errors.New("the current simulator supports DAG graphs only")
	}

	return nodeByID, outgoing, order, nil
}

func simulateNodeTick(
	node domain.Node,
	incomingRPS float64,
	priorQueueDepth float64,
	workload normalizedWorkload,
	tickDurationSeconds float64,
) (domain.NodeSimulationResult, float64) {
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
		}, 0
	}

	effectiveCapacityRPS := node.Properties.CapacityRPS
	if node.Properties.Replicas > 1 {
		effectiveCapacityRPS *= float64(node.Properties.Replicas)
	}
	effectiveCapacityRPS = effectiveCapacityRPS / capacityPenalty(node, workload)
	if effectiveCapacityRPS <= 0 {
		effectiveCapacityRPS = 1
	}

	demandRPS := incomingRPS
	if node.Archetype == domain.NodeArchetypeQueue && priorQueueDepth > 0 && tickDurationSeconds > 0 {
		demandRPS += priorQueueDepth / tickDurationSeconds
	}

	processedRPS := min(demandRPS, effectiveCapacityRPS)
	droppedRPS := max(0, demandRPS-effectiveCapacityRPS)
	queueDepth := 0.0
	queueLagMS := 0.0

	if node.Archetype == domain.NodeArchetypeQueue {
		queueDepth = max(0, priorQueueDepth+((incomingRPS-processedRPS)*tickDurationSeconds))
		droppedRPS = 0
		if effectiveCapacityRPS > 0 {
			queueLagMS = (queueDepth / effectiveCapacityRPS) * 1000
		}
	}

	utilization := demandRPS / effectiveCapacityRPS
	latency := estimateLatency(node.Properties.BaseLatencyMS, utilization, node, workload) + queueLagMS

	result := domain.NodeSimulationResult{
		NodeID:               node.ID,
		Label:                node.Label,
		Archetype:            node.Archetype,
		IncomingRPS:          round(demandRPS),
		ProcessedRPS:         round(processedRPS),
		DroppedRPS:           round(droppedRPS),
		EffectiveCapacityRPS: round(effectiveCapacityRPS),
		Utilization:          round(utilization),
		EstimatedLatencyMS:   round(latency),
		QueueDepthEstimate:   round(queueDepth),
		QueueLagMS:           round(queueLagMS),
		Saturated:            utilization > 1,
		Explanation:          explainNode(node, demandRPS, effectiveCapacityRPS, utilization > 1, queueLagMS),
	}

	return result, queueDepth
}

func finalizeTickEdgeResult(
	attempt tickEdgeAttempt,
	targetResult domain.NodeSimulationResult,
) (domain.EdgeSimulationResult, []float64) {
	stageLoads := make([]float64, len(attempt.retryLoadsRPS))
	if len(stageLoads) == 0 {
		stageLoads = make([]float64, attempt.edge.RetryAttempts+1)
	}
	stageLoads[0] = attempt.baseRoutedRPS
	for stage := 1; stage < len(stageLoads) && stage < len(attempt.retryLoadsRPS); stage++ {
		stageLoads[stage] = attempt.retryLoadsRPS[stage]
	}

	timeoutRatio := timeoutFailureRatio(attempt.edge.TimeoutMS, targetResult.EstimatedLatencyMS)
	attemptedRPS := 0.0
	deliveredRPS := 0.0
	retriedRPS := 0.0
	timedOutRPS := 0.0
	nextRetries := make([]float64, len(stageLoads))

	for stage, loadRPS := range stageLoads {
		if loadRPS <= 0 {
			continue
		}

		attemptedRPS += loadRPS
		if stage > 0 {
			retriedRPS += loadRPS
		}

		failuresRPS := loadRPS * timeoutRatio
		deliveredRPS += loadRPS - failuresRPS

		if failuresRPS <= 0 {
			continue
		}

		if stage < attempt.edge.RetryAttempts {
			nextRetries[stage+1] += failuresRPS
			continue
		}

		timedOutRPS += failuresRPS
	}

	return domain.EdgeSimulationResult{
		EdgeID:           attempt.edge.ID,
		SourceNodeID:     attempt.edge.SourceNodeID,
		TargetNodeID:     attempt.edge.TargetNodeID,
		InteractionType:  attempt.edge.InteractionType,
		FanoutMultiplier: round(normalizedEdgeFanout(attempt.edge)),
		TimeoutMS:        round(attempt.edge.TimeoutMS),
		RetryAttempts:    attempt.edge.RetryAttempts,
		RuleType:         attempt.edge.RoutingRule.RuleType,
		RoutingWeight:    round(routingWeight(attempt.edge)),
		AttemptedRPS:     round(attemptedRPS),
		RetriedRPS:       round(retriedRPS),
		TimedOutRPS:      round(timedOutRPS),
		RoutedRPS:        round(max(0, deliveredRPS)),
	}, nextRetries
}

func aggregateTickMetrics(
	nodes []domain.Node,
	edges []domain.Edge,
	ticks []domain.SimulationTick,
) *graphMetrics {
	nodeByID := make(map[string]domain.Node, len(nodes))
	for _, node := range nodes {
		nodeByID[node.ID] = node
	}

	nodePeakResults := make(map[string]domain.NodeSimulationResult, len(nodes))
	for _, node := range nodes {
		nodePeakResults[node.ID] = domain.NodeSimulationResult{
			NodeID:    node.ID,
			Label:     node.Label,
			Archetype: node.Archetype,
		}
	}

	edgePeakResults := make(map[string]domain.EdgeSimulationResult, len(edges))
	for _, edge := range edges {
		edgePeakResults[edge.ID] = domain.EdgeSimulationResult{
			EdgeID:           edge.ID,
			SourceNodeID:     edge.SourceNodeID,
			TargetNodeID:     edge.TargetNodeID,
			InteractionType:  edge.InteractionType,
			FanoutMultiplier: round(normalizedEdgeFanout(edge)),
			TimeoutMS:        round(edge.TimeoutMS),
			RetryAttempts:    edge.RetryAttempts,
			RuleType:         edge.RoutingRule.RuleType,
			RoutingWeight:    round(routingWeight(edge)),
		}
	}

	for _, tick := range ticks {
		for _, tickNode := range tick.Nodes {
			node := nodeByID[tickNode.NodeID]
			candidate := domain.NodeSimulationResult{
				NodeID:             tickNode.NodeID,
				Label:              node.Label,
				Archetype:          node.Archetype,
				IncomingRPS:        round(tickNode.IncomingRPS),
				ProcessedRPS:       round(tickNode.ProcessedRPS),
				DroppedRPS:         round(tickNode.DroppedRPS),
				Utilization:        round(tickNode.Utilization),
				EstimatedLatencyMS: round(tickNode.EstimatedLatencyMS),
				QueueDepthEstimate: round(tickNode.QueueDepthEstimate),
				QueueLagMS:         round(tickNode.QueueLagMS),
				Saturated:          tickNode.Saturated,
				Explanation:        buildTickNodeExplanation(node.Label, tickNode),
			}
			existing := nodePeakResults[tickNode.NodeID]
			if nodeSeverityScore(candidate) > nodeSeverityScore(existing) {
				candidate.EffectiveCapacityRPS = deriveEffectiveCapacity(candidate)
				nodePeakResults[tickNode.NodeID] = candidate
			}
		}

		for _, tickEdge := range tick.Edges {
			existing := edgePeakResults[tickEdge.EdgeID]
			candidate := existing
			candidate.AttemptedRPS = round(max(existing.AttemptedRPS, tickEdge.AttemptedRPS))
			candidate.RoutedRPS = round(max(existing.RoutedRPS, tickEdge.RoutedRPS))
			candidate.RetriedRPS = round(max(existing.RetriedRPS, tickEdge.RetriedRPS))
			candidate.TimedOutRPS = round(max(existing.TimedOutRPS, tickEdge.TimedOutRPS))
			if edgeSeverityScore(candidate) > edgeSeverityScore(existing) {
				edgePeakResults[tickEdge.EdgeID] = candidate
			}
		}
	}

	nodeList := make([]domain.NodeSimulationResult, 0, len(nodes))
	var bottleneck *domain.NodeSimulationResult
	for _, node := range nodes {
		result := nodePeakResults[node.ID]
		if result.EffectiveCapacityRPS == 0 {
			result.EffectiveCapacityRPS = deriveEffectiveCapacity(result)
		}
		nodeList = append(nodeList, result)
		if node.Archetype == domain.NodeArchetypeClient {
			continue
		}
		if bottleneck == nil || result.Utilization > bottleneck.Utilization {
			current := result
			bottleneck = &current
		}
	}

	edgeList := make([]domain.EdgeSimulationResult, 0, len(edges))
	for _, edge := range edges {
		edgeList = append(edgeList, edgePeakResults[edge.ID])
	}

	nodeResultsByID := make(map[string]domain.NodeSimulationResult, len(nodeList))
	for _, result := range nodeList {
		nodeResultsByID[result.NodeID] = result
	}
	paths := buildPathExplanations(nodes, edgeList, nodeResultsByID, bottleneck)

	return &graphMetrics{
		Nodes:      nodeList,
		Edges:      edgeList,
		Paths:      paths,
		Bottleneck: bottleneck,
		Ticks:      ticks,
	}
}

func mergeSimulationTicks(existing []domain.SimulationTick, incoming []domain.SimulationTick) []domain.SimulationTick {
	if len(existing) == 0 {
		return cloneTicks(incoming)
	}

	maxTicks := len(existing)
	if len(incoming) < maxTicks {
		maxTicks = len(incoming)
	}

	merged := make([]domain.SimulationTick, 0, maxTicks)
	for tickIndex := 0; tickIndex < maxTicks; tickIndex++ {
		left := existing[tickIndex]
		right := incoming[tickIndex]

		nodeByID := make(map[string]domain.NodeTickState, len(left.Nodes))
		for _, node := range left.Nodes {
			nodeByID[node.NodeID] = node
		}
		for _, node := range right.Nodes {
			current, exists := nodeByID[node.NodeID]
			if !exists {
				nodeByID[node.NodeID] = node
				continue
			}
			current.IncomingRPS += node.IncomingRPS
			current.ProcessedRPS += node.ProcessedRPS
			current.DroppedRPS += node.DroppedRPS
			current.QueueDepthEstimate += node.QueueDepthEstimate
			current.QueueLagMS += node.QueueLagMS
			current.EstimatedLatencyMS = max(current.EstimatedLatencyMS, node.EstimatedLatencyMS)
			current.Utilization = max(current.Utilization, node.Utilization)
			current.Saturated = current.Saturated || node.Saturated
			nodeByID[node.NodeID] = current
		}

		edgeByID := make(map[string]domain.EdgeTickState, len(left.Edges))
		for _, edge := range left.Edges {
			edgeByID[edge.EdgeID] = edge
		}
		for _, edge := range right.Edges {
			current, exists := edgeByID[edge.EdgeID]
			if !exists {
				edgeByID[edge.EdgeID] = edge
				continue
			}
			current.AttemptedRPS += edge.AttemptedRPS
			current.RoutedRPS += edge.RoutedRPS
			current.RetriedRPS += edge.RetriedRPS
			current.TimedOutRPS += edge.TimedOutRPS
			current.RoutingWeight = max(current.RoutingWeight, edge.RoutingWeight)
			edgeByID[edge.EdgeID] = current
		}

		nodes := make([]domain.NodeTickState, 0, len(nodeByID))
		for _, node := range nodeByID {
			nodes = append(nodes, normalizeTickNode(node))
		}
		edges := make([]domain.EdgeTickState, 0, len(edgeByID))
		for _, edge := range edgeByID {
			edges = append(edges, normalizeTickEdge(edge))
		}

		merged = append(merged, domain.SimulationTick{
			Index:   left.Index,
			TimeMS:  left.TimeMS,
			Summary: left.Summary,
			Nodes:   nodes,
			Edges:   edges,
		})
	}

	return merged
}

func cloneTicks(source []domain.SimulationTick) []domain.SimulationTick {
	cloned := make([]domain.SimulationTick, 0, len(source))
	for _, tick := range source {
		nodes := make([]domain.NodeTickState, len(tick.Nodes))
		copy(nodes, tick.Nodes)
		edges := make([]domain.EdgeTickState, len(tick.Edges))
		copy(edges, tick.Edges)
		cloned = append(cloned, domain.SimulationTick{
			Index:   tick.Index,
			TimeMS:  tick.TimeMS,
			Summary: tick.Summary,
			Nodes:   nodes,
			Edges:   edges,
		})
	}
	return cloned
}

func cloneFloatSlice(values []float64) []float64 {
	cloned := make([]float64, len(values))
	copy(cloned, values)
	return cloned
}

func nodeSeverityScore(result domain.NodeSimulationResult) float64 {
	return (result.Utilization * 1000) + result.QueueLagMS + (result.DroppedRPS * 0.1)
}

func edgeSeverityScore(result domain.EdgeSimulationResult) float64 {
	return result.TimedOutRPS + result.RetriedRPS + result.RoutedRPS + result.AttemptedRPS
}

func buildTickNodeExplanation(label string, tickNode domain.NodeTickState) string {
	if tickNode.QueueLagMS > 0 {
		return fmt.Sprintf("%s builds queue lag up to %.0f ms while %.0f requests/sec arrive.", label, tickNode.QueueLagMS, tickNode.IncomingRPS)
	}
	if tickNode.Saturated {
		return fmt.Sprintf("%s saturates around %.0f%% utilization at %.0f requests/sec.", label, tickNode.Utilization*100, tickNode.IncomingRPS)
	}
	return fmt.Sprintf("%s remains healthy at %.0f requests/sec.", label, tickNode.IncomingRPS)
}

func deriveEffectiveCapacity(result domain.NodeSimulationResult) float64 {
	if result.Utilization <= 0 {
		return result.EffectiveCapacityRPS
	}
	return round(result.IncomingRPS / result.Utilization)
}

func normalizeTickNode(node domain.NodeTickState) domain.NodeTickState {
	node.IncomingRPS = round(node.IncomingRPS)
	node.ProcessedRPS = round(node.ProcessedRPS)
	node.DroppedRPS = round(node.DroppedRPS)
	node.Utilization = round(node.Utilization)
	node.EstimatedLatencyMS = round(node.EstimatedLatencyMS)
	node.QueueDepthEstimate = round(node.QueueDepthEstimate)
	node.QueueLagMS = round(node.QueueLagMS)
	return node
}

func normalizeTickEdge(edge domain.EdgeTickState) domain.EdgeTickState {
	edge.AttemptedRPS = round(edge.AttemptedRPS)
	edge.RoutedRPS = round(edge.RoutedRPS)
	edge.RetriedRPS = round(edge.RetriedRPS)
	edge.TimedOutRPS = round(edge.TimedOutRPS)
	edge.RoutingWeight = round(edge.RoutingWeight)
	return edge
}
