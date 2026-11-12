// Package problems holds the practice problems: a fixed workload, a Markdown
// brief and pass/fail targets on end-to-end metrics.
package problems

import (
	"embed"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

//go:embed data/*.json data/*.md
var files embed.FS

// order is the display order, roughly by difficulty.
var order = []string{"url-shortener", "rate-limiter", "news-feed", "chat-service", "video-upload", "ride-matching"}

// ErrProblemNotFound matches domain.ErrNotFound via errors.Is.
var ErrProblemNotFound = fmt.Errorf("problem %w", domain.ErrNotFound)

var loaded = sync.OnceValues(func() ([]domain.Problem, error) {
	out := make([]domain.Problem, 0, len(order))
	for _, id := range order {
		raw, err := files.ReadFile("data/" + id + ".json")
		if err != nil {
			return nil, err
		}
		var p domain.Problem
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, fmt.Errorf("problem %s: %w", id, err)
		}
		brief, err := files.ReadFile("data/" + id + ".md")
		if err != nil {
			return nil, err
		}
		p.Brief = strings.TrimSpace(string(brief))
		if p.ID != id {
			return nil, fmt.Errorf("problem file %s has id %q", id, p.ID)
		}
		out = append(out, p)
	}
	return out, nil
})

func all() []domain.Problem {
	ps, err := loaded()
	if err != nil {
		panic("embedded problems are invalid: " + err.Error()) // covered by tests
	}
	return ps
}

// List returns every problem in display order.
func List() []domain.Problem {
	return append([]domain.Problem{}, all()...)
}

// Get returns the problem with the given id.
func Get(id string) (domain.Problem, error) {
	for _, p := range all() {
		if p.ID == id {
			return p, nil
		}
	}
	return domain.Problem{}, ErrProblemNotFound
}

// Exists reports whether a problem id is known.
func Exists(id string) bool {
	_, err := Get(id)
	return err == nil
}

// Evaluate checks each target against the result's end-to-end metrics
// (docs/simulation-model.md, "Problems").
func Evaluate(problem domain.Problem, result domain.SimulationResult) []domain.TargetResult {
	out := make([]domain.TargetResult, 0, len(problem.Targets))
	for _, t := range problem.Targets {
		actual := metric(t.Metric, result.EndToEnd)
		tr := domain.TargetResult{TargetID: t.ID, Label: t.Label, Expected: t.Value, Metric: t.Metric, Actual: actual}
		if actual != nil {
			const eps = 1e-9
			switch t.Comparison {
			case domain.TargetComparisonAtMost:
				tr.Passed = *actual <= t.Value+eps*max(1, t.Value)
			default:
				tr.Passed = *actual >= t.Value-eps*max(1, t.Value)
			}
		}
		out = append(out, tr)
	}
	return out
}

func metric(m domain.TargetMetric, e domain.EndToEnd) *float64 {
	ptr := func(v float64) *float64 { return &v }
	switch m {
	case domain.TargetMetricReadThroughput:
		return ptr(e.Reads.ServedRPS)
	case domain.TargetMetricWriteThroughput:
		return ptr(e.Writes.ServedRPS)
	case domain.TargetMetricReadP99MS:
		return e.Reads.LatencyP99MS
	case domain.TargetMetricWriteP99MS:
		return e.Writes.LatencyP99MS
	case domain.TargetMetricAvailability:
		// The lower of reads and writes, ignoring a class nobody sends.
		switch {
		case e.Reads.DemandRPS == 0 && e.Writes.DemandRPS == 0:
			return ptr(min(e.Reads.Availability, e.Writes.Availability))
		case e.Reads.DemandRPS == 0:
			return ptr(e.Writes.Availability)
		case e.Writes.DemandRPS == 0:
			return ptr(e.Reads.Availability)
		default:
			return ptr(min(e.Reads.Availability, e.Writes.Availability))
		}
	}
	return nil
}
