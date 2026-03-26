package store

import (
	"slices"
	"sync"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

const SampleDesignID = "sample-cache-aside"

type MemoryDesignRepository struct {
	mu      sync.RWMutex
	designs map[string]domain.Design
}

func NewMemoryDesignRepository() *MemoryDesignRepository {
	now := time.Now().UTC()

	return &MemoryDesignRepository{
		designs: map[string]domain.Design{
			SampleDesignID: {
				ID:          SampleDesignID,
				Name:        "Sample Cache-Aside Read Path",
				Description: "Seeded sample design used until database persistence is added.",
				Graph: domain.Graph{
					RequestClasses: []domain.RequestClass{
						{
							ID:           "flow-read",
							Name:         "Read Path",
							TrafficShare: 100,
						},
					},
					Nodes: []domain.Node{
						{
							ID:        "client-1",
							Label:     "Client",
							Archetype: domain.NodeArchetypeClient,
							Color:     "blue",
							Position: domain.NodePosition{
								X: 80,
								Y: 180,
							},
						},
						{
							ID:        "service-1",
							Label:     "Chat Service",
							Archetype: domain.NodeArchetypeStatelessService,
							Color:     "green",
							Position: domain.NodePosition{
								X: 320,
								Y: 160,
							},
							Properties: domain.NodeProperties{
								Replicas:      4,
								CapacityRPS:   30000,
								BaseLatencyMS: 20,
							},
						},
						{
							ID:        "cache-1",
							Label:     "Redis Cache",
							Archetype: domain.NodeArchetypeCache,
							Color:     "yellow",
							Position: domain.NodePosition{
								X: 600,
								Y: 90,
							},
							Properties: domain.NodeProperties{
								Replicas:      2,
								CapacityRPS:   70000,
								BaseLatencyMS: 3,
								CacheHitRate:  0.9,
							},
						},
						{
							ID:        "db-1",
							Label:     "Postgres",
							Archetype: domain.NodeArchetypeDatabase,
							Color:     "red",
							Position: domain.NodePosition{
								X: 600,
								Y: 280,
							},
							Properties: domain.NodeProperties{
								Replicas:      1,
								CapacityRPS:   7000,
								BaseLatencyMS: 25,
							},
						},
					},
					Edges: []domain.Edge{
						{
							ID:              "edge-client-service",
							SourceNodeID:    "client-1",
							TargetNodeID:    "service-1",
							InteractionType: domain.EdgeInteractionSyncRequest,
							RequestClassIDs: []string{"flow-read"},
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:              "edge-service-cache",
							SourceNodeID:    "service-1",
							TargetNodeID:    "cache-1",
							InteractionType: domain.EdgeInteractionSyncRequest,
							RequestClassIDs: []string{"flow-read"},
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:              "edge-cache-db",
							SourceNodeID:    "cache-1",
							TargetNodeID:    "db-1",
							InteractionType: domain.EdgeInteractionConditionalPath,
							RequestClassIDs: []string{"flow-read"},
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleCacheMiss,
							},
						},
					},
				},
				CreatedAt: &now,
				UpdatedAt: &now,
			},
		},
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

func NewMemoryRunRepository() *MemoryRunRepository {
	return &MemoryRunRepository{
		runs: make(map[string]domain.Run),
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
