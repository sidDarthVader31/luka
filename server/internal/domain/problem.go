package domain

// TargetMetric is the end-to-end number a problem target checks.
type TargetMetric string

const (
	TargetMetricReadThroughput  TargetMetric = "read_throughput"
	TargetMetricWriteThroughput TargetMetric = "write_throughput"
	TargetMetricReadP99MS       TargetMetric = "read_p99_ms"
	TargetMetricWriteP99MS      TargetMetric = "write_p99_ms"
	TargetMetricAvailability    TargetMetric = "availability"
)

type TargetComparison string

const (
	TargetComparisonAtLeast TargetComparison = "at_least"
	TargetComparisonAtMost  TargetComparison = "at_most"
)

type Target struct {
	ID         string           `json:"id"`
	Label      string           `json:"label"`
	Metric     TargetMetric     `json:"metric"`
	Comparison TargetComparison `json:"comparison"`
	Value      float64          `json:"value"`
}

// Problem is a practice prompt with a fixed workload and pass/fail targets.
type Problem struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Summary    string `json:"summary"`
	Difficulty string `json:"difficulty"`
	// Brief is the full prompt in Markdown.
	Brief    string   `json:"brief"`
	Workload Workload `json:"workload"`
	Targets  []Target `json:"targets"`
}

type TargetResult struct {
	TargetID string `json:"target_id"`
	Label    string `json:"label"`
	Passed   bool   `json:"passed"`
	// Actual is nil when the metric is undefined, such as p99 latency through an overloaded node.
	Actual   *float64     `json:"actual,omitempty"`
	Expected float64      `json:"expected"`
	Metric   TargetMetric `json:"metric"`
}
