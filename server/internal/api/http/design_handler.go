package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/domain"
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
		respondBadRequest(c, "invalid design request: "+err.Error())
		return
	}

	design, err := h.service.Create(c.Request.Context(), request)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, design)
}

func (h *DesignHandler) Get(c *gin.Context) {
	design, err := h.service.Get(c.Request.Context(), c.Param("designId"))
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, design)
}

func (h *DesignHandler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context())
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (h *DesignHandler) Templates(c *gin.Context) {
	items, err := h.service.Templates(c.Request.Context())
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (h *DesignHandler) Update(c *gin.Context) {
	var request domain.UpdateDesignRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		respondBadRequest(c, "invalid design update request: "+err.Error())
		return
	}

	design, err := h.service.Update(c.Request.Context(), c.Param("designId"), request)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusOK, design)
}

func (h *DesignHandler) Duplicate(c *gin.Context) {
	var request domain.DuplicateDesignRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		respondBadRequest(c, "invalid design duplicate request: "+err.Error())
		return
	}

	design, err := h.service.Duplicate(c.Request.Context(), c.Param("designId"), request)
	if err != nil {
		respondError(c, err)
		return
	}

	c.JSON(http.StatusCreated, design)
}
