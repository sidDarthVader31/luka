package http

import (
	"encoding/json"
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

func (h *RunHandler) Stream(c *gin.Context) {
	var request domain.CreateRunRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid run request",
			"details": err.Error(),
		})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "streaming unsupported",
			"details": "response writer does not support streaming",
		})
		return
	}

	writeEvent := func(eventType string, payload any) {
		c.Writer.WriteString("event: " + eventType + "\n")
		data, err := json.Marshal(payload)
		if err != nil {
			data = []byte(`{"type":"error","error":"failed to encode stream event"}`)
		}
		c.Writer.WriteString("data: " + string(data) + "\n\n")
		flusher.Flush()
	}

	writeEvent("start", domain.SimulationStreamEvent{Type: "start"})

	run, err := h.service.Stream(request, func(tick domain.SimulationTick) {
		writeEvent("tick", domain.SimulationStreamEvent{
			Type: "tick",
			Tick: &tick,
		})
	})
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrDesignNotFound) {
			status = http.StatusNotFound
		}

		c.Status(status)
		writeEvent("error", domain.SimulationStreamEvent{
			Type:  "error",
			Error: err.Error(),
		})
		return
	}

	writeEvent("complete", domain.SimulationStreamEvent{
		Type:   "complete",
		RunID:  run.ID,
		Result: run.Result,
	})
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
