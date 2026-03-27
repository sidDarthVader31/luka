package designs

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/graphs"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type Service struct {
	repo store.DesignRepository
}

func NewService(repo store.DesignRepository) *Service {
	return &Service{repo: repo}
}

func (s *Service) Create(req domain.CreateDesignRequest) (*domain.Design, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, errors.New("name is required")
	}

	now := time.Now().UTC()
	design := domain.Design{
		ID:          fmt.Sprintf("des_%d", now.UnixNano()),
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		Graph:       req.Graph,
		CreatedAt:   &now,
		UpdatedAt:   &now,
	}

	if err := graphs.ValidateGraph(design.Graph, graphs.ModeSave); err != nil {
		return nil, err
	}

	if err := s.repo.Create(design); err != nil {
		return nil, err
	}

	return &design, nil
}

func (s *Service) Get(id string) (*domain.Design, error) {
	design, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	return &design, nil
}

func (s *Service) Update(id string, req domain.UpdateDesignRequest) (*domain.Design, error) {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, errors.New("name cannot be empty")
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

	now := time.Now().UTC()
	existing.UpdatedAt = &now

	if err := s.repo.Update(existing); err != nil {
		return nil, err
	}

	return &existing, nil
}

func (s *Service) Duplicate(id string, req domain.DuplicateDesignRequest) (*domain.Design, error) {
	source, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = fmt.Sprintf("%s Variant", source.Name)
	}

	description := strings.TrimSpace(req.Description)
	if description == "" {
		description = source.Description
	}

	return s.Create(domain.CreateDesignRequest{
		Name:        name,
		Description: description,
		Graph:       source.Graph,
	})
}
