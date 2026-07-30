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

func (h *DesignHandler) List(c *gin.Context) {
	items, err := h.service.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "design list failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
	})
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

func (h *DesignHandler) Duplicate(c *gin.Context) {
	var request domain.DuplicateDesignRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid design duplicate request",
			"details": err.Error(),
		})
		return
	}

	design, err := h.service.Duplicate(c.Param("designId"), request)
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrDesignNotFound) {
			status = http.StatusNotFound
		}

		c.JSON(status, gin.H{
			"error":   "design duplicate failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusCreated, design)
}

func (h *DesignHandler) ListVersions(c *gin.Context) {
	versions, err := h.service.ListVersions(c.Param("designId"))
	if err != nil {
		status := http.StatusBadRequest
		if errors.Is(err, store.ErrDesignNotFound) {
			status = http.StatusNotFound
		}

		c.JSON(status, gin.H{
			"error":   "design version lookup failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": versions,
	})
}
