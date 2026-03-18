package main

import (
	"log"

	"github.com/sidDarthVader31/luka/server/internal/app"
)

func main() {
	server := app.NewServer()

	log.Printf("luka server listening on %s", server.Address())
	if err := server.Run(); err != nil {
		log.Fatal(err)
	}
}
