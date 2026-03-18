package store

import (
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
					Nodes: []domain.Node{
						{
							ID:        "client-1",
							Label:     "Client",
							Archetype: domain.NodeArchetypeClient,
						},
						{
							ID:        "service-1",
							Label:     "Chat Service",
							Archetype: domain.NodeArchetypeStatelessService,
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
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:              "edge-service-cache",
							SourceNodeID:    "service-1",
							TargetNodeID:    "cache-1",
							InteractionType: domain.EdgeInteractionSyncRequest,
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:              "edge-cache-db",
							SourceNodeID:    "cache-1",
							TargetNodeID:    "db-1",
							InteractionType: domain.EdgeInteractionConditionalPath,
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
