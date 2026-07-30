package store

import (
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
	designs := make(map[string]domain.Design)
	for _, sample := range SampleDesigns() {
		designs[sample.ID] = sample
	}

	return &MemoryDesignRepository{
		designs: designs,
	}
}

func (r *MemoryDesignRepository) GetByID(id string) (domain.Design, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	design, ok := r.designs[id]
	if !ok {
		return domain.Design{}, ErrDesignNotFound
	}

	return design, nil
}

func (r *MemoryDesignRepository) List() ([]domain.Design, error) {
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

func (r *MemoryDesignRepository) Create(design domain.Design) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.designs[design.ID] = design
	return nil
}

func (r *MemoryDesignRepository) Update(design domain.Design) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, ok := r.designs[design.ID]; !ok {
		return ErrDesignNotFound
	}

	r.designs[design.ID] = design
	return nil
}

type MemoryRunRepository struct {
	mu   sync.RWMutex
	runs map[string]domain.Run
}

type MemoryDesignVersionRepository struct {
	mu       sync.RWMutex
	versions map[string][]domain.DesignVersion
}

func NewMemoryRunRepository() *MemoryRunRepository {
	return &MemoryRunRepository{
		runs: make(map[string]domain.Run),
	}
}

func NewMemoryDesignVersionRepository() *MemoryDesignVersionRepository {
	return &MemoryDesignVersionRepository{
		versions: make(map[string][]domain.DesignVersion),
	}
}

func (r *MemoryRunRepository) Save(run domain.Run) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.runs[run.ID] = run
	return nil
}

func (r *MemoryRunRepository) GetByID(id string) (domain.Run, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	run, ok := r.runs[id]
	if !ok {
		return domain.Run{}, ErrRunNotFound
	}

	return run, nil
}

func (r *MemoryRunRepository) ListByDesignID(designID string) ([]domain.Run, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	runs := make([]domain.Run, 0)
	for _, run := range r.runs {
		if run.DesignID == designID {
			runs = append(runs, run)
		}
	}

	slices.SortFunc(runs, func(a, b domain.Run) int {
		if a.CreatedAt.Equal(b.CreatedAt) {
			switch {
			case a.ID < b.ID:
				return 1
			case a.ID > b.ID:
				return -1
			default:
				return 0
			}
		}

		if a.CreatedAt.After(b.CreatedAt) {
			return -1
		}

		return 1
	})

	return runs, nil
}

func (r *MemoryDesignVersionRepository) Save(version domain.DesignVersion) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.versions[version.DesignID] = append(r.versions[version.DesignID], version)
	return nil
}

func (r *MemoryDesignVersionRepository) ListByDesignID(designID string) ([]domain.DesignVersion, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	versions := append([]domain.DesignVersion(nil), r.versions[designID]...)
	slices.SortFunc(versions, func(a, b domain.DesignVersion) int {
		switch {
		case a.Version > b.Version:
			return -1
		case a.Version < b.Version:
			return 1
		default:
			return 0
		}
	})

	return versions, nil
}

func (r *MemoryDesignVersionRepository) NextVersionNumber(designID string) (int, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.versions[designID]) + 1, nil
}
