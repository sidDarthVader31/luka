// Package simulation runs a design through the simulator without persisting anything.
package simulation

import (
	"context"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/graphs"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type Simulator interface {
	RunDesign(design domain.Design, workload domain.Workload) (*domain.SimulationResult, error)
}

type Service struct {
	designs   store.DesignRepository
	simulator Simulator
}

func NewService(designs store.DesignRepository, simulator Simulator) *Service {
	return &Service{designs: designs, simulator: simulator}
}

// Simulate validates the request and design, runs the simulator and returns the
// result. Nothing is stored.
func (s *Service) Simulate(ctx context.Context, req domain.SimulateRequest) (*domain.SimulationResult, error) {
	if err := validateRequest(req); err != nil {
		return nil, err
	}

	design, err := s.resolveDesign(ctx, req)
	if err != nil {
		return nil, err
	}

	if err := graphs.ValidateGraph(design.Graph, graphs.ModeRun); err != nil {
		return nil, err
	}

	result, err := s.simulator.RunDesign(design, req.Workload)
	if err != nil {
		// The simulator only fails on designs it cannot model, which is a
		// problem with the submitted input rather than the server.
		return nil, domain.Invalid("%s", err.Error())
	}

	return result, nil
}

func (s *Service) resolveDesign(ctx context.Context, req domain.SimulateRequest) (domain.Design, error) {
	if req.Design != nil {
		design := *req.Design
		if design.ID == "" {
			design.ID = "adhoc-design"
		}
		if design.Name == "" {
			design.Name = "Ad Hoc Design"
		}
		return design, nil
	}

	return s.designs.GetByID(ctx, req.DesignID)
}

func validateRequest(req domain.SimulateRequest) error {
	hasDesignID := req.DesignID != ""
	hasInlineDesign := req.Design != nil

	switch {
	case !hasDesignID && !hasInlineDesign:
		return domain.Invalid("exactly one of design_id or design must be provided")
	case hasDesignID && hasInlineDesign:
		return domain.Invalid("design_id and design cannot be provided together")
	case req.Workload.RequestsPerSecond <= 0:
		return domain.Invalid("workload.requests_per_second must be greater than zero")
	case req.Workload.ConcurrentUsers < 0:
		return domain.Invalid("workload.concurrent_users cannot be negative")
	case req.Workload.ReadWriteRatio < 0:
		return domain.Invalid("workload.read_write_ratio cannot be negative")
	case req.Workload.PayloadKB < 0:
		return domain.Invalid("workload.payload_kb cannot be negative")
	case req.Workload.FanoutCount < 0:
		return domain.Invalid("workload.fanout_count cannot be negative")
	default:
		return nil
	}
}
