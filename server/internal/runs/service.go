package runs

import (
	"errors"
	"fmt"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/graphs"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type Simulator interface {
	RunDesign(design domain.Design, workload domain.Workload) (*domain.SimulationResult, error)
}

type Service struct {
	designs   store.DesignRepository
	runs      store.RunRepository
	simulator Simulator
}

func NewService(designs store.DesignRepository, runs store.RunRepository, simulator Simulator) *Service {
	return &Service{
		designs:   designs,
		runs:      runs,
		simulator: simulator,
	}
}

func (s *Service) Create(req domain.CreateRunRequest) (*domain.Run, error) {
	if err := validateCreateRunRequest(req); err != nil {
		return nil, err
	}

	design, err := s.resolveDesign(req)
	if err != nil {
		return nil, err
	}

	if err := graphs.ValidateGraph(design.Graph, graphs.ModeRun); err != nil {
		return nil, err
	}

	config := req.SimulationConfig
	if config.Mode == "" {
		config.Mode = domain.SimulationModeAnalytical
	}

	result, err := s.simulator.RunDesign(design, req.Workload)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	run := domain.Run{
		ID:               fmt.Sprintf("run_%d", now.UnixNano()),
		DesignID:         req.DesignID,
		DesignSnapshot:   design,
		Workload:         req.Workload,
		SimulationConfig: config,
		Status:           domain.RunStatusCompleted,
		Result:           result,
		CreatedAt:        now,
		CompletedAt:      &now,
	}

	if run.DesignID == "" {
		run.DesignID = design.ID
	}

	if err := s.runs.Save(run); err != nil {
		return nil, err
	}

	return &run, nil
}

func (s *Service) Get(runID string) (*domain.Run, error) {
	run, err := s.runs.GetByID(runID)
	if err != nil {
		return nil, err
	}

	return &run, nil
}

func (s *Service) ListByDesign(designID string) ([]domain.Run, error) {
	if designID == "" {
		return nil, errors.New("design_id is required")
	}

	if _, err := s.designs.GetByID(designID); err != nil {
		return nil, err
	}

	return s.runs.ListByDesignID(designID)
}

func (s *Service) resolveDesign(req domain.CreateRunRequest) (domain.Design, error) {
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

	return s.designs.GetByID(req.DesignID)
}

func validateCreateRunRequest(req domain.CreateRunRequest) error {
	hasDesignID := req.DesignID != ""
	hasInlineDesign := req.Design != nil

	switch {
	case !hasDesignID && !hasInlineDesign:
		return errors.New("exactly one of design_id or design must be provided")
	case hasDesignID && hasInlineDesign:
		return errors.New("design_id and design cannot be provided together")
	case req.Workload.RequestsPerSecond <= 0:
		return errors.New("workload.requests_per_second must be greater than zero")
	case req.Workload.ConcurrentUsers < 0:
		return errors.New("workload.concurrent_users cannot be negative")
	case req.Workload.ReadWriteRatio < 0:
		return errors.New("workload.read_write_ratio cannot be negative")
	case req.Workload.PayloadKB < 0:
		return errors.New("workload.payload_kb cannot be negative")
	case req.Workload.FanoutCount < 0:
		return errors.New("workload.fanout_count cannot be negative")
	default:
		return nil
	}
}
