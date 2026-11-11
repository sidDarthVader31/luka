// Package simulation runs a design through the simulator without persisting anything.
package simulation

import (
	"context"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/graphs"
	"github.com/sidDarthVader31/luka/server/internal/problems"
	"github.com/sidDarthVader31/luka/server/internal/review"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type Service struct {
	designs store.DesignRepository
}

func NewService(designs store.DesignRepository) *Service {
	return &Service{designs: designs}
}

// Simulate validates the request and design, runs the simulator and returns the
// result. Nothing is stored.
func (s *Service) Simulate(ctx context.Context, req domain.SimulateRequest) (*domain.SimulationResult, error) {
	design, err := s.resolveDesign(ctx, req)
	if err != nil {
		return nil, err
	}

	var problem *domain.Problem
	if design.ProblemID != "" {
		p, err := problems.Get(design.ProblemID)
		if err != nil {
			return nil, domain.Invalid("design references unknown problem %q", design.ProblemID)
		}
		problem = &p
	}

	workload, err := resolveWorkload(problem, req.Workload)
	if err != nil {
		return nil, err
	}

	if err := graphs.ValidateGraph(design.Graph, graphs.ModeRun); err != nil {
		return nil, err
	}

	result, err := simulator.Run(design.Graph, workload, catalog.Default())
	if err != nil {
		// The simulator only fails on designs it cannot model, which is a
		// problem with the submitted input rather than the server.
		return nil, domain.Invalid("%s", err.Error())
	}
	result.Warnings = graphs.Warnings(design.Graph)
	result.Findings = review.Analyze(design.Graph, result)
	if problem != nil {
		result.Targets = problems.Evaluate(*problem, result)
	}

	return &result, nil
}

func (s *Service) resolveDesign(ctx context.Context, req domain.SimulateRequest) (domain.Design, error) {
	switch {
	case req.DesignID == "" && req.Design == nil:
		return domain.Design{}, domain.Invalid("exactly one of design_id or design must be provided")
	case req.DesignID != "" && req.Design != nil:
		return domain.Design{}, domain.Invalid("design_id and design cannot be provided together")
	case req.Design != nil:
		return *req.Design, nil
	default:
		return s.designs.GetByID(ctx, req.DesignID)
	}
}

// resolveWorkload picks the workload: a linked problem's wins; otherwise the
// request's, which is then required.
func resolveWorkload(problem *domain.Problem, w *domain.Workload) (domain.Workload, error) {
	if problem != nil {
		return problem.Workload, nil
	}
	if w == nil {
		return domain.Workload{}, domain.Invalid("workload is required")
	}
	return validateWorkload(*w)
}

func validateWorkload(w domain.Workload) (domain.Workload, error) {
	switch {
	case w.RequestsPerSecond <= 0:
		return w, domain.Invalid("workload.requests_per_second must be greater than zero")
	case w.ReadShare < 0 || w.ReadShare > 1:
		return w, domain.Invalid("workload.read_share must be between 0 and 1")
	case w.PayloadKB < 0:
		return w, domain.Invalid("workload.payload_kb cannot be negative")
	}
	return w, nil
}
