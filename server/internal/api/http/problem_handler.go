package http

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/problems"
)

type ProblemHandler struct{}

func NewProblemHandler() *ProblemHandler { return &ProblemHandler{} }

func (h *ProblemHandler) List(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"items": problems.List()})
}

func (h *ProblemHandler) Get(c *gin.Context) {
	problem, err := problems.Get(c.Param("problemId"))
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, problem)
}
