package problems

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/graphs"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
)

func TestListAndGet(t *testing.T) {
	ps := List()
	if len(ps) != 6 {
		t.Fatalf("problems = %d, want 6", len(ps))
	}
	metrics := map[domain.TargetMetric]bool{
		domain.TargetMetricReadThroughput: true, domain.TargetMetricWriteThroughput: true,
		domain.TargetMetricReadP99MS: true, domain.TargetMetricWriteP99MS: true, domain.TargetMetricAvailability: true,
	}
	for _, p := range ps {
		if p.Title == "" || p.Summary == "" || len(p.Brief) < 100 || p.Workload.RequestsPerSecond <= 0 {
			t.Errorf("%s: incomplete problem", p.ID)
		}
		switch p.Difficulty {
		case "easy", "medium", "hard":
		default:
			t.Errorf("%s: difficulty %q", p.ID, p.Difficulty)
		}
		if len(p.Targets) < 3 || len(p.Targets) > 4 {
			t.Errorf("%s: %d targets, want 3–4", p.ID, len(p.Targets))
		}
		for _, target := range p.Targets {
			if !metrics[target.Metric] || target.ID == "" || target.Label == "" {
				t.Errorf("%s: bad target %+v", p.ID, target)
			}
		}
		got, err := Get(p.ID)
		if err != nil || got.ID != p.ID {
			t.Errorf("Get(%s) = %v, %v", p.ID, got.ID, err)
		}
	}
	if _, err := Get("nope"); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("Get(nope) error = %v", err)
	}
}

func f(v float64) *float64 { return &v }

func TestEvaluate(t *testing.T) {
	p := domain.Problem{Targets: []domain.Target{
		{ID: "r", Metric: domain.TargetMetricReadThroughput, Comparison: domain.TargetComparisonAtLeast, Value: 900},
		{ID: "w", Metric: domain.TargetMetricWriteThroughput, Comparison: domain.TargetComparisonAtLeast, Value: 100},
		{ID: "rp", Metric: domain.TargetMetricReadP99MS, Comparison: domain.TargetComparisonAtMost, Value: 100},
		{ID: "wp", Metric: domain.TargetMetricWriteP99MS, Comparison: domain.TargetComparisonAtMost, Value: 100},
		{ID: "a", Metric: domain.TargetMetricAvailability, Comparison: domain.TargetComparisonAtLeast, Value: 0.999},
	}}
	result := domain.SimulationResult{EndToEnd: domain.EndToEnd{
		Reads:  domain.ClassResult{DemandRPS: 900, ServedRPS: 900, LatencyP99MS: f(100), Availability: 0.9999},
		Writes: domain.ClassResult{DemandRPS: 100, ServedRPS: 50, LatencyP99MS: nil, Availability: 0.99},
	}}
	got := Evaluate(p, result)
	want := map[string]bool{"r": true, "w": false, "rp": true, "wp": false, "a": false}
	for _, tr := range got {
		if tr.Passed != want[tr.TargetID] {
			t.Errorf("%s passed = %v, want %v (actual %v)", tr.TargetID, tr.Passed, want[tr.TargetID], tr.Actual)
		}
	}
	if got[3].Actual != nil {
		t.Error("undefined p99 must have no actual")
	}
	if *got[4].Actual != 0.99 {
		t.Errorf("availability is the lower class: %v", *got[4].Actual)
	}

	// A class with no demand is ignored for availability.
	result.EndToEnd.Writes.DemandRPS = 0
	if a := Evaluate(p, result)[4]; !a.Passed || *a.Actual != 0.9999 {
		t.Errorf("availability ignoring empty class = %+v", a)
	}
}

// Each problem has a passing and a failing design under testdata, run through
// validation, the simulator and Evaluate.
func TestProblemFixtures(t *testing.T) {
	for _, p := range List() {
		for _, variant := range []string{"pass", "fail"} {
			t.Run(p.ID+"/"+variant, func(t *testing.T) {
				raw, err := os.ReadFile(filepath.Join("testdata", p.ID+"."+variant+".json"))
				if err != nil {
					t.Fatal(err)
				}
				var d domain.Design
				if err := json.Unmarshal(raw, &d); err != nil {
					t.Fatal(err)
				}
				if d.ProblemID != p.ID {
					t.Fatalf("fixture problem_id = %q", d.ProblemID)
				}
				if err := graphs.ValidateGraph(d.Graph, graphs.ModeRun); err != nil {
					t.Fatal(err)
				}
				result, err := simulator.Run(d.Graph, p.Workload, catalog.Default())
				if err != nil {
					t.Fatal(err)
				}
				passed := 0
				for _, tr := range Evaluate(p, result) {
					if tr.Passed {
						passed++
					} else if variant == "pass" {
						t.Errorf("target %s failed: actual %v, expected %v", tr.TargetID, deref(tr.Actual), tr.Expected)
					}
				}
				if variant == "fail" && passed == len(p.Targets) {
					t.Errorf("failing design passes every target")
				}
				if variant == "fail" && passed > len(p.Targets)/2 {
					t.Errorf("failing design passes %d of %d targets; it should fail most", passed, len(p.Targets))
				}
			})
		}
	}
}

func deref(p *float64) any {
	if p == nil {
		return "undefined"
	}
	return *p
}
