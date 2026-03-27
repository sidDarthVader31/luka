package store

import (
	"slices"
	"sync"
	"time"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

const SampleDesignID = "sample-cache-aside"
const SampleQueueDesignID = "sample-queue-workflow"

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
							Color:     "cobalt",
							Position: domain.NodePosition{
								X: 80,
								Y: 180,
							},
						},
						{
							ID:        "service-1",
							Label:     "Chat Service",
							Archetype: domain.NodeArchetypeStatelessService,
							Color:     "emerald",
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
							Color:     "amber",
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
							Color:     "coral",
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
			SampleQueueDesignID: {
				ID:          SampleQueueDesignID,
				Name:        "Sample Queue-Based Write Path",
				Description: "Seeded async workflow with a queue and workers consuming background jobs.",
				Graph: domain.Graph{
					RequestClasses: []domain.RequestClass{
						{
							ID:           "flow-write",
							Name:         "Write Path",
							TrafficShare: 100,
						},
					},
					Nodes: []domain.Node{
						{
							ID:        "client-1",
							Label:     "Client",
							Archetype: domain.NodeArchetypeClient,
							Color:     "cobalt",
							Position: domain.NodePosition{
								X: 60,
								Y: 220,
							},
						},
						{
							ID:        "gateway-1",
							Label:     "API Gateway",
							Archetype: domain.NodeArchetypeGateway,
							Color:     "indigo",
							Position: domain.NodePosition{
								X: 250,
								Y: 210,
							},
							Properties: domain.NodeProperties{
								Replicas:      2,
								CapacityRPS:   25000,
								BaseLatencyMS: 8,
							},
						},
						{
							ID:        "service-1",
							Label:     "Message Service",
							Archetype: domain.NodeArchetypeStatelessService,
							Color:     "emerald",
							Position: domain.NodePosition{
								X: 470,
								Y: 210,
							},
							Properties: domain.NodeProperties{
								Replicas:      3,
								CapacityRPS:   14000,
								BaseLatencyMS: 18,
							},
						},
						{
							ID:        "queue-1",
							Label:     "Delivery Queue",
							Archetype: domain.NodeArchetypeQueue,
							Color:     "orange",
							Position: domain.NodePosition{
								X: 700,
								Y: 120,
							},
							Properties: domain.NodeProperties{
								Replicas:      1,
								CapacityRPS:   9000,
								BaseLatencyMS: 4,
							},
						},
						{
							ID:        "worker-1",
							Label:     "Delivery Worker",
							Archetype: domain.NodeArchetypeWorker,
							Color:     "teal",
							Position: domain.NodePosition{
								X: 700,
								Y: 320,
							},
							Properties: domain.NodeProperties{
								Replicas:      4,
								CapacityRPS:   3500,
								BaseLatencyMS: 28,
							},
						},
						{
							ID:        "db-1",
							Label:     "Message Store",
							Archetype: domain.NodeArchetypeDatabase,
							Color:     "coral",
							Position: domain.NodePosition{
								X: 940,
								Y: 320,
							},
							Properties: domain.NodeProperties{
								Replicas:      1,
								CapacityRPS:   7000,
								BaseLatencyMS: 24,
							},
						},
					},
					Edges: []domain.Edge{
						{
							ID:              "edge-client-gateway",
							SourceNodeID:    "client-1",
							TargetNodeID:    "gateway-1",
							InteractionType: domain.EdgeInteractionSyncRequest,
							RequestClassIDs: []string{"flow-write"},
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:              "edge-gateway-service",
							SourceNodeID:    "gateway-1",
							TargetNodeID:    "service-1",
							InteractionType: domain.EdgeInteractionSyncRequest,
							RequestClassIDs: []string{"flow-write"},
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:               "edge-service-queue",
							SourceNodeID:     "service-1",
							TargetNodeID:     "queue-1",
							InteractionType:  domain.EdgeInteractionAsyncEnqueue,
							FanoutMultiplier: 2,
							RequestClassIDs:  []string{"flow-write"},
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:              "edge-queue-worker",
							SourceNodeID:    "queue-1",
							TargetNodeID:    "worker-1",
							InteractionType: domain.EdgeInteractionConsume,
							RequestClassIDs: []string{"flow-write"},
							TimeoutMS:       120,
							RetryAttempts:   1,
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
							},
						},
						{
							ID:              "edge-worker-db",
							SourceNodeID:    "worker-1",
							TargetNodeID:    "db-1",
							InteractionType: domain.EdgeInteractionSyncRequest,
							RequestClassIDs: []string{"flow-write"},
							RoutingRule: domain.RoutingRule{
								RuleType: domain.RoutingRuleAlways,
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
