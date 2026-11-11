package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/catalog"
)

type CatalogHandler struct{}

func NewCatalogHandler() *CatalogHandler { return &CatalogHandler{} }

func (h *CatalogHandler) Get(c *gin.Context) {
	c.JSON(http.StatusOK, catalog.Default())
}
