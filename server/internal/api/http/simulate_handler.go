package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/simulation"
)

type SimulateHandler struct {
	service *simulation.Service
}

func NewSimulateHandler(service *simulation.Service) *SimulateHandler {
	return &SimulateHandler{service: service}
}

func (h *SimulateHandler) Simulate(c *gin.Context) {
	var request domain.SimulateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		respondBadRequest(c, "invalid simulate request: "+err.Error())
		return
	}

	result, err := h.service.Simulate(c.Request.Context(), request)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, domain.SimulateResponse{Result: result})
}
