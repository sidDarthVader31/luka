package http

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

type DesignHandler struct {
	service *designs.Service
}

func NewDesignHandler(service *designs.Service) *DesignHandler {
	return &DesignHandler{service: service}
}

func (h *DesignHandler) Create(c *gin.Context) {
	var request domain.CreateDesignRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid design request",
			"details": err.Error(),
		})
		return
	}

	design, err := h.service.Create(request)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "design creation failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, design)
}

func (h *DesignHandler) Get(c *gin.Context) {
	design, err := h.service.Get(c.Param("designId"))
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrDesignNotFound) {
			status = http.StatusNotFound
		}

		c.JSON(status, gin.H{
			"error":   "design lookup failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, design)
}

func (h *DesignHandler) Update(c *gin.Context) {
	var request domain.UpdateDesignRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid design update request",
			"details": err.Error(),
		})
		return
	}

	design, err := h.service.Update(c.Param("designId"), request)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrDesignNotFound) {
			status = http.StatusNotFound
		}

		c.JSON(status, gin.H{
			"error":   "design update failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, design)
}
