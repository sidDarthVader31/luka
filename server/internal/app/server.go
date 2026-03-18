package app

import (
	"os"

	httpapi "github.com/sidDarthVader31/luka/server/internal/api/http"
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

	return &Server{
		address: address,
		router:  httpapi.NewRouter(),
	}
}

func (s *Server) Address() string {
	return s.address
}

func (s *Server) Run() error {
	return s.router.Engine().Run(s.address)
}
