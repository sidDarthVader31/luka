package domain

import "time"

type SimulationMode string

const (
	SimulationModeAnalytical SimulationMode = "analytical"
)

type RunStatus string

const (
	RunStatusCompleted RunStatus = "completed"
)

type Workload struct {
	RequestsPerSecond float64 `json:"requests_per_second"`
	ConcurrentUsers   int     `json:"concurrent_users,omitempty"`
	ReadWriteRatio    float64 `json:"read_write_ratio,omitempty"`
	PayloadKB         float64 `json:"payload_kb,omitempty"`
	FanoutCount       int     `json:"fanout_count,omitempty"`
}

type SimulationConfig struct {
	Mode SimulationMode `json:"mode"`
}

type CreateRunRequest struct {
	DesignID         string           `json:"design_id,omitempty"`
	Design           *Design          `json:"design,omitempty"`
	Workload         Workload         `json:"workload"`
	SimulationConfig SimulationConfig `json:"simulation_config"`
}

type Run struct {
	ID               string            `json:"id"`
	DesignID         string            `json:"design_id,omitempty"`
	DesignSnapshot   Design            `json:"design_snapshot"`
	Workload         Workload          `json:"workload"`
	SimulationConfig SimulationConfig  `json:"simulation_config"`
	Status           RunStatus         `json:"status"`
	Result           *SimulationResult `json:"result,omitempty"`
	Error            *string           `json:"error,omitempty"`
	CreatedAt        time.Time         `json:"created_at"`
	CompletedAt      *time.Time        `json:"completed_at,omitempty"`
}

type SimulationResult struct {
	Summary    string                 `json:"summary"`
	Bottleneck *NodeSimulationResult  `json:"bottleneck,omitempty"`
	Nodes      []NodeSimulationResult `json:"nodes"`
	Edges      []EdgeSimulationResult `json:"edges"`
	Paths      []PathExplanation      `json:"paths,omitempty"`
	Flows      []FlowSimulationResult `json:"flows,omitempty"`
}

type FlowSimulationResult struct {
	RequestClassID string                 `json:"request_class_id"`
	Name           string                 `json:"name"`
	TrafficShare   float64                `json:"traffic_share"`
	Workload       Workload               `json:"workload"`
	Summary        string                 `json:"summary"`
	Bottleneck     *NodeSimulationResult  `json:"bottleneck,omitempty"`
	Nodes          []NodeSimulationResult `json:"nodes"`
	Edges          []EdgeSimulationResult `json:"edges"`
	Paths          []PathExplanation      `json:"paths,omitempty"`
}

type NodeSimulationResult struct {
	NodeID               string        `json:"node_id"`
	Label                string        `json:"label"`
	Archetype            NodeArchetype `json:"archetype"`
	IncomingRPS          float64       `json:"incoming_rps"`
	ProcessedRPS         float64       `json:"processed_rps"`
	DroppedRPS           float64       `json:"dropped_rps"`
	EffectiveCapacityRPS float64       `json:"effective_capacity_rps"`
	Utilization          float64       `json:"utilization"`
	EstimatedLatencyMS   float64       `json:"estimated_latency_ms"`
	QueueDepthEstimate   float64       `json:"queue_depth_estimate,omitempty"`
	QueueLagMS           float64       `json:"queue_lag_ms,omitempty"`
	Saturated            bool          `json:"saturated"`
	Explanation          string        `json:"explanation"`
}

type EdgeSimulationResult struct {
	EdgeID           string              `json:"edge_id"`
	SourceNodeID     string              `json:"source_node_id"`
	TargetNodeID     string              `json:"target_node_id"`
	InteractionType  EdgeInteractionType `json:"interaction_type"`
	FanoutMultiplier float64             `json:"fanout_multiplier"`
	TimeoutMS        float64             `json:"timeout_ms,omitempty"`
	RetryAttempts    int                 `json:"retry_attempts,omitempty"`
	RuleType         RoutingRuleType     `json:"rule_type"`
	RoutingWeight    float64             `json:"routing_weight,omitempty"`
	AttemptedRPS     float64             `json:"attempted_rps,omitempty"`
	RetriedRPS       float64             `json:"retried_rps,omitempty"`
	TimedOutRPS      float64             `json:"timed_out_rps,omitempty"`
	RoutedRPS        float64             `json:"routed_rps"`
}

type PathExplanation struct {
	Kind               string   `json:"kind"`
	Summary            string   `json:"summary"`
	NodeIDs            []string `json:"node_ids"`
	EdgeIDs            []string `json:"edge_ids"`
	EstimatedLatencyMS float64  `json:"estimated_latency_ms,omitempty"`
	QueueLagMS         float64  `json:"queue_lag_ms,omitempty"`
	RetriedRPS         float64  `json:"retried_rps,omitempty"`
	TimedOutRPS        float64  `json:"timed_out_rps,omitempty"`
}
