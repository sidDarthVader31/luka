package store

import (
	"context"
	"slices"
	"sync"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

type MemoryDesignRepository struct {
	mu      sync.RWMutex
	designs map[string]domain.Design
}

func NewMemoryDesignRepository() *MemoryDesignRepository {
	return &MemoryDesignRepository{
		designs: make(map[string]domain.Design),
	}
}

func (r *MemoryDesignRepository) GetByID(_ context.Context, id string) (domain.Design, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	design, ok := r.designs[id]
	if !ok {
		return domain.Design{}, ErrDesignNotFound
	}

	return design, nil
}

func (r *MemoryDesignRepository) List(_ context.Context) ([]domain.Design, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	designs := make([]domain.Design, 0, len(r.designs))
	for _, design := range r.designs {
		designs = append(designs, design)
	}

	slices.SortFunc(designs, func(a, b domain.Design) int {
		aTime := time.Time{}
		bTime := time.Time{}
		if a.UpdatedAt != nil {
			aTime = *a.UpdatedAt
		}
		if b.UpdatedAt != nil {
			bTime = *b.UpdatedAt
		}
		if aTime.Equal(bTime) {
			switch {
			case a.Name < b.Name:
				return -1
			case a.Name > b.Name:
				return 1
			default:
				return 0
			}
		}
		if aTime.After(bTime) {
			return -1
		}
		return 1
	})

	return designs, nil
}

func (r *MemoryDesignRepository) Create(_ context.Context, design domain.Design) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.designs[design.ID] = design
	return nil
}

func (r *MemoryDesignRepository) Update(_ context.Context, design domain.Design) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.designs[design.ID]; !ok {
		return ErrDesignNotFound
	}

	r.designs[design.ID] = design
	return nil
}
