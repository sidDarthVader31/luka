package domain

// Workload is the traffic the clients send. Model rules: docs/simulation-model.md.
type Workload struct {
	RequestsPerSecond float64 `json:"requests_per_second"`
	// ReadShare is the fraction of requests that are reads, 0 to 1. Omitted means 0.9;
	// 0 means every request is a write.
	ReadShare *float64 `json:"read_share,omitempty"`
	// PayloadKB is the average request or record size. Default 1.
	PayloadKB float64 `json:"payload_kb,omitempty"`
}

type SimulateRequest struct {
	DesignID string  `json:"design_id,omitempty"`
	Design   *Design `json:"design,omitempty"`
	// Workload is required unless the design has a problem, whose workload then wins.
	Workload *Workload `json:"workload,omitempty"`
}

type SimulateResponse struct {
	Result *SimulationResult `json:"result"`
}

// Traffic is a rate split into reads and writes, in requests per second.
type Traffic struct {
	Reads  float64 `json:"reads"`
	Writes float64 `json:"writes"`
}

type SimulationResult struct {
	// Workload is the workload actually used (after defaults or the problem's workload).
	Workload Workload     `json:"workload"`
	Nodes    []NodeResult `json:"nodes"`
	Edges    []EdgeResult `json:"edges"`
	EndToEnd EndToEnd     `json:"end_to_end"`
	// BottleneckNodeID is the node with the highest utilisation; empty if no node has load.
	BottleneckNodeID string    `json:"bottleneck_node_id,omitempty"`
	Estimates        Estimates `json:"estimates"`
	Findings         []Finding `json:"findings"`
	// Targets is set only when the design is linked to a problem.
	Targets []TargetResult `json:"targets,omitempty"`
	// Warnings are graph problems that did not stop the run, such as an unconnected node.
	Warnings []string `json:"warnings,omitempty"`
}

type NodeResult struct {
	NodeID      string        `json:"node_id"`
	Label       string        `json:"label"`
	Archetype   NodeArchetype `json:"archetype"`
	ComponentID string        `json:"component_id,omitempty"`
	// Demand is what arrives; Served is what the node handles within capacity.
	Demand Traffic `json:"demand"`
	Served Traffic `json:"served"`
	// CapacityRPS is the limit that Utilization is measured against
	// (for a database: its primaries, which take every write).
	CapacityRPS float64 `json:"capacity_rps"`
	Utilization float64 `json:"utilization"`
	Overloaded  bool    `json:"overloaded"`
	// Latency is omitted when the node is overloaded: queues grow without bound.
	LatencyP50MS *float64 `json:"latency_p50_ms,omitempty"`
	LatencyP99MS *float64 `json:"latency_p99_ms,omitempty"`
	Availability float64  `json:"availability"`
	// Working lists the calculation steps, one line each, for display.
	Working []string `json:"working"`
}

type EdgeResult struct {
	EdgeID       string   `json:"edge_id"`
	SourceNodeID string   `json:"source_node_id"`
	TargetNodeID string   `json:"target_node_id"`
	Mode         EdgeMode `json:"mode"`
	Traffic      Traffic  `json:"traffic"`
}

// ClassResult is the end-to-end outcome for reads or for writes, as the client sees it.
type ClassResult struct {
	DemandRPS float64 `json:"demand_rps"`
	ServedRPS float64 `json:"served_rps"`
	// SuccessRate is ServedRPS / DemandRPS, including failures caused by overloaded dependencies.
	SuccessRate  float64  `json:"success_rate"`
	LatencyP50MS *float64 `json:"latency_p50_ms,omitempty"`
	LatencyP99MS *float64 `json:"latency_p99_ms,omitempty"`
	Availability float64  `json:"availability"`
	Working      []string `json:"working"`
}

type EndToEnd struct {
	Reads  ClassResult `json:"reads"`
	Writes ClassResult `json:"writes"`
}

type Estimates struct {
	BandwidthMBPerSec float64  `json:"bandwidth_mb_per_sec"`
	StorageGBPerDay   float64  `json:"storage_gb_per_day"`
	StorageTBPerYear  float64  `json:"storage_tb_per_year"`
	Working           []string `json:"working"`
}

type FindingSeverity string

const (
	FindingSeverityError   FindingSeverity = "error"
	FindingSeverityWarning FindingSeverity = "warning"
	FindingSeverityInfo    FindingSeverity = "info"
)

// Finding is one rule-based review comment on the design.
type Finding struct {
	// RuleID identifies the rule, for example "single_point_of_failure".
	RuleID   string          `json:"rule_id"`
	Severity FindingSeverity `json:"severity"`
	Title    string          `json:"title"`
	// Detail explains the problem and suggests a fix in one or two sentences.
	Detail  string   `json:"detail"`
	NodeIDs []string `json:"node_ids,omitempty"`
}
