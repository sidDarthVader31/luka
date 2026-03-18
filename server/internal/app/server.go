package app

import (
	"context"
	"fmt"
	"log"
	"os"

	httpapi "github.com/sidDarthVader31/luka/server/internal/api/http"
	designsvc "github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/platform"
	"github.com/sidDarthVader31/luka/server/internal/runs"
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

	designRepo, runStore, err := bootstrapRepositories(context.Background())
	if err != nil {
		return nil, err
	}

	designService := designsvc.NewService(designRepo)
	runService := runs.NewService(designRepo, runStore, simulator.NewService())

	return &Server{
		address: address,
		router:  httpapi.NewRouter(designService, runService),
	}, nil
}

func (s *Server) Address() string {
	return s.address
}

func (s *Server) Run() error {
	return s.router.Engine().Run(s.address)
}

func bootstrapRepositories(ctx context.Context) (store.DesignRepository, store.RunRepository, error) {
	databaseURL := os.Getenv("LUKA_DATABASE_URL")
	if databaseURL == "" {
		databaseURL = os.Getenv("DATABASE_URL")
	}

	if databaseURL == "" {
		log.Print("LUKA_DATABASE_URL not set; using in-memory persistence")
		return store.NewMemoryDesignRepository(), store.NewMemoryRunRepository(), nil
	}

	pool, err := platform.OpenPostgresPool(ctx, databaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("open postgres pool: %w", err)
	}

	if err := platform.RunPostgresMigrations(ctx, pool); err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("run postgres migrations: %w", err)
	}

	log.Print("using PostgreSQL persistence")
	return store.NewPostgresDesignRepository(pool), store.NewPostgresRunRepository(pool), nil
}
