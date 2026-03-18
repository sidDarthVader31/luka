package main

import (
	"log"

	"github.com/sidDarthVader31/luka/server/internal/app"
)

func main() {
	server, err := app.NewServer()
	if err != nil {
		log.Fatal(err)
	}

	log.Printf("luka server listening on %s", server.Address())
	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}
