package http

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/runs"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type RunHandler struct {
	service *runs.Service
}

func NewRunHandler(service *runs.Service) *RunHandler {
	return &RunHandler{service: service}
}

func (h *RunHandler) Create(c *gin.Context) {
	var request domain.CreateRunRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid run request",
			"details": err.Error(),
		})
		return
	}

	run, err := h.service.Create(request)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrDesignNotFound) {
			status = http.StatusNotFound
		}

		c.JSON(status, gin.H{
			"error":   "run creation failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, run)
}

func (h *RunHandler) Get(c *gin.Context) {
	run, err := h.service.Get(c.Param("runId"))
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrRunNotFound) {
			status = http.StatusNotFound
		}

		c.JSON(status, gin.H{
			"error":   "run lookup failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, run)
}

func (h *RunHandler) ListByDesign(c *gin.Context) {
	runs, err := h.service.ListByDesign(c.Param("designId"))
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrDesignNotFound) {
			status = http.StatusNotFound
		}

		c.JSON(status, gin.H{
			"error":   "run history lookup failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": runs})
}
