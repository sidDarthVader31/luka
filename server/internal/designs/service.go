package designs

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/graphs"
	"github.com/sidDarthVader31/luka/server/internal/problems"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

// MaxSceneBytes caps the size of a stored scene.
const MaxSceneBytes = 5 << 20

func validateScene(scene json.RawMessage) error {
	if len(scene) > MaxSceneBytes {
		return domain.Invalid("scene is too large: %d bytes (max %d)", len(scene), MaxSceneBytes)
	}
	if len(scene) > 0 && !json.Valid(scene) {
		return domain.Invalid("scene must be valid JSON")
	}
	return nil
}

type Service struct {
	repo store.DesignRepository
}

func NewService(repo store.DesignRepository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Create(ctx context.Context, req domain.CreateDesignRequest) (*domain.Design, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, domain.Invalid("name is required")
	}

	if err := validateScene(req.Scene); err != nil {
		return nil, err
	}

	problemID := strings.TrimSpace(req.ProblemID)
	if problemID != "" && !problems.Exists(problemID) {
		return nil, domain.Invalid("unknown problem_id %q", problemID)
	}

	now := time.Now().UTC()
	design := domain.Design{
		ID:          domain.NewID("des"),
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		ProblemID:   problemID,
		Graph:       req.Graph,
		Scene:       req.Scene,
		CreatedAt:   &now,
		UpdatedAt:   &now,
	}

	if err := graphs.ValidateGraph(design.Graph, graphs.ModeSave); err != nil {
		return nil, err
	}

	if err := s.repo.Create(ctx, design); err != nil {
		return nil, err
	}

	return &design, nil
}

func (s *Service) Get(ctx context.Context, id string) (*domain.Design, error) {
	design, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	return &design, nil
}

// List returns user designs; built-in samples are served by Templates.
func (s *Service) List(ctx context.Context) ([]domain.Design, error) {
	all, err := s.repo.List(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]domain.Design, 0, len(all))
	for _, design := range all {
		if !store.IsSampleID(design.ID) {
			items = append(items, design)
		}
	}

	return items, nil
}

// Templates returns the built-in read-only sample designs.
func (s *Service) Templates(ctx context.Context) ([]domain.Design, error) {
	items := make([]domain.Design, 0)
	for _, sample := range store.SampleDesigns() {
		design, err := s.repo.GetByID(ctx, sample.ID)
		if err != nil {
			return nil, err
		}
		items = append(items, design)
	}

	return items, nil
}

func (s *Service) Update(ctx context.Context, id string, req domain.UpdateDesignRequest) (*domain.Design, error) {
	if store.IsSampleID(id) {
		return nil, domain.Invalid("sample designs are read-only; duplicate it to make an editable copy")
	}

	existing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, domain.Invalid("name cannot be empty")
		}
		existing.Name = name
	}

	if req.Description != nil {
		existing.Description = strings.TrimSpace(*req.Description)
	}

	if req.Graph != nil {
		if err := graphs.ValidateGraph(*req.Graph, graphs.ModeSave); err != nil {
			return nil, err
		}
		existing.Graph = *req.Graph
	}

	if len(req.Scene) > 0 {
		if err := validateScene(req.Scene); err != nil {
			return nil, err
		}
		existing.Scene = req.Scene
	}

	now := time.Now().UTC()
	existing.UpdatedAt = &now

	if err := s.repo.Update(ctx, existing); err != nil {
		return nil, err
	}

	return &existing, nil
}

// Duplicate copies any design, including samples, into a new editable design.
func (s *Service) Duplicate(ctx context.Context, id string, req domain.DuplicateDesignRequest) (*domain.Design, error) {
	source, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = fmt.Sprintf("%s Copy", source.Name)
	}

	description := strings.TrimSpace(req.Description)
	if description == "" {
		description = source.Description
	}

	return s.Create(ctx, domain.CreateDesignRequest{
		Name:        name,
		Description: description,
		ProblemID:   source.ProblemID,
		Graph:       source.Graph,
		Scene:       source.Scene,
	})
}
