package app

import (
	"context"
	"fmt"
	"log"
	"os"

	httpapi "github.com/sidDarthVader31/luka/server/internal/api/http"
	designsvc "github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/platform"
	"github.com/sidDarthVader31/luka/server/internal/simulation"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type Server struct {
	address string
	router  *httpapi.Router
}

func NewServer() (*Server, error) {
	address := os.Getenv("LUKA_SERVER_ADDR")
	if address == "" {
		address = ":8080"
	}

	designRepo, err := bootstrapRepository(context.Background())
	if err != nil {
		return nil, err
	}

	designService := designsvc.NewService(designRepo)
	simulationService := simulation.NewService(designRepo, simulator.NewService())

	return &Server{
		address: address,
		router:  httpapi.NewRouter(designService, simulationService),
	}, nil
}

func (s *Server) Address() string {
	return s.address
}

func (s *Server) Run() error {
	return s.router.Engine().Run(s.address)
}

func bootstrapRepository(ctx context.Context) (store.DesignRepository, error) {
	databaseURL := os.Getenv("LUKA_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}

	if databaseURL == "" {
		log.Print("LUKA_DATABASE_URL not set; using in-memory persistence")
		repo := store.NewMemoryDesignRepository()
		if err := store.SeedSampleDesigns(ctx, repo); err != nil {
			return nil, fmt.Errorf("seed sample designs: %w", err)
		}
		return repo, nil
	}

	pool, err := platform.OpenPostgresPool(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open postgres pool: %w", err)
	}

	if err := platform.RunPostgresMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, fmt.Errorf("run postgres migrations: %w", err)
	}

	repo := store.NewPostgresDesignRepository(pool)
	if err := store.SeedSampleDesigns(ctx, repo); err != nil {
		pool.Close()
		return nil, fmt.Errorf("seed sample designs: %w", err)
	}

	log.Print("using PostgreSQL persistence")
	return repo, nil
}
