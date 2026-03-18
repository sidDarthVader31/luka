package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/platform"
)

type ComponentHandler struct{}

func NewComponentHandler() *ComponentHandler {
	return &ComponentHandler{}
}

func (h *ComponentHandler) List(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"items": platform.DefaultComponentArchetypes(),
	})
}
