package http

import (
	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/simulation"
)

type Router struct {
	engine          *gin.Engine
	catalogHandler  *CatalogHandler
	designHandler   *DesignHandler
	problemHandler  *ProblemHandler
	simulateHandler *SimulateHandler
}

func NewRouter(designService *designs.Service, simulationService *simulation.Service) *Router {
	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery())

	router := &Router{
		engine:          engine,
		catalogHandler:  NewCatalogHandler(),
		designHandler:   NewDesignHandler(designService),
		problemHandler:  NewProblemHandler(),
		simulateHandler: NewSimulateHandler(simulationService),
	}
	router.registerRoutes()

	return router
}

func (r *Router) Engine() *gin.Engine {
	return r.engine
}

func (r *Router) registerRoutes() {
	r.engine.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "luka-server",
		})
	})

	v1 := r.engine.Group("/api/v1")
	{
		v1.GET("/status", func(c *gin.Context) {
			c.JSON(200, gin.H{
				"name":    "luka",
				"version": "0.1.0",
				"api":     "ready",
			})
		})

		v1.GET("/catalog", r.catalogHandler.Get)
		v1.POST("/designs", r.designHandler.Create)
		v1.GET("/designs", r.designHandler.List)
		v1.GET("/designs/:designId", r.designHandler.Get)
		v1.PATCH("/designs/:designId", r.designHandler.Update)
		v1.POST("/designs/:designId/duplicate", r.designHandler.Duplicate)
		v1.GET("/templates", r.designHandler.Templates)
		v1.GET("/problems", r.problemHandler.List)
		v1.GET("/problems/:problemId", r.problemHandler.Get)
		v1.POST("/simulate", r.simulateHandler.Simulate)
	}
}
