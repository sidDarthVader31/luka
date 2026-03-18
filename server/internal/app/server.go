package app

import (
	"os"

	httpapi "github.com/sidDarthVader31/luka/server/internal/api/http"
	designsvc "github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/runs"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type Server struct {
	address string
	router  *httpapi.Router
}

func NewServer() *Server {
	address := os.Getenv("LUKA_SERVER_ADDR")
	if address == "" {
		address = ":8080"
	}

	designRepo := store.NewMemoryDesignRepository()
	runStore := store.NewMemoryRunRepository()
	designService := designsvc.NewService(designRepo)
	runService := runs.NewService(designRepo, runStore, simulator.NewService())

	return &Server{
		address: address,
		router:  httpapi.NewRouter(designService, runService),
	}
}

func (s *Server) Address() string {
	return s.address
}

func (s *Server) Run() error {
	return s.router.Engine().Run(s.address)
}
