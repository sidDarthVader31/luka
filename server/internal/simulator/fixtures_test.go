package simulator

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

type regressionFixture struct {
	Name             string                  `json:"name"`
	Design           domain.Design           `json:"design"`
	Workload         domain.Workload         `json:"workload"`
	SimulationConfig domain.SimulationConfig `json:"simulation_config"`
	Expect           struct {
		BottleneckNodeID    string `json:"bottleneck_node_id"`
		MinTicks            int    `json:"min_ticks"`
		RequireDeadLetter   bool   `json:"require_dead_letter"`
		RequireQueueBacklog bool   `json:"require_queue_backlog"`
	} `json:"expect"`
}

func TestRegressionFixtures(t *testing.T) {
	service := NewService()

	fixtureFiles, err := filepath.Glob("testdata/*.json")
	if err != nil {
		t.Fatalf("glob fixtures: %v", err)
	}
	if len(fixtureFiles) == 0 {
		t.Fatal("expected regression fixtures")
	}

	for _, fixtureFile := range fixtureFiles {
		fixtureFile := fixtureFile
		t.Run(filepath.Base(fixtureFile), func(t *testing.T) {
			payload, err := os.ReadFile(fixtureFile)
			if err != nil {
				t.Fatalf("read fixture: %v", err)
			}

			var fixture regressionFixture
			if err := json.Unmarshal(payload, &fixture); err != nil {
				t.Fatalf("unmarshal fixture: %v", err)
			}

			result, err := service.RunDesignWithConfig(fixture.Design, fixture.Workload, fixture.SimulationConfig)
			if err != nil {
				t.Fatalf("RunDesignWithConfig() error = %v", err)
			}

			if fixture.Expect.BottleneckNodeID != "" {
				if result.Bottleneck == nil || result.Bottleneck.NodeID != fixture.Expect.BottleneckNodeID {
					t.Fatalf("bottleneck = %#v, want %s", result.Bottleneck, fixture.Expect.BottleneckNodeID)
				}
			}

			if fixture.Expect.MinTicks > 0 && len(result.Ticks) < fixture.Expect.MinTicks {
				t.Fatalf("ticks len = %d, want at least %d", len(result.Ticks), fixture.Expect.MinTicks)
			}

			if fixture.Expect.RequireDeadLetter {
				found := false
				for _, path := range result.Paths {
					if path.Kind == "dead_letter_path" && path.DeadLetteredRPS > 0 {
						found = true
						break
					}
				}
				if !found {
					t.Fatal("expected dead_letter_path explanation")
				}
			}

			if fixture.Expect.RequireQueueBacklog {
				found := false
				for _, path := range result.Paths {
					if path.Kind == "queue_backlog" && path.QueueLagMS > 0 {
						found = true
						break
					}
				}
				if !found {
					t.Fatal("expected queue_backlog explanation")
				}
			}
		})
	}
}
