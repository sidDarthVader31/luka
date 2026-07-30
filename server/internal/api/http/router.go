package http

import (
	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/runs"
)

type Router struct {
	engine           *gin.Engine
	componentHandler *ComponentHandler
	designHandler    *DesignHandler
	runHandler       *RunHandler
}

func NewRouter(designService *designs.Service, runService *runs.Service) *Router {
	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery())

	router := &Router{
		engine:           engine,
		componentHandler: NewComponentHandler(),
		designHandler:    NewDesignHandler(designService),
		runHandler:       NewRunHandler(runService),
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

		v1.GET("/component-archetypes", r.componentHandler.List)
		v1.POST("/designs", r.designHandler.Create)
		v1.GET("/designs", r.designHandler.List)
		v1.GET("/designs/:designId", r.designHandler.Get)
		v1.GET("/designs/:designId/versions", r.designHandler.ListVersions)
		v1.PATCH("/designs/:designId", r.designHandler.Update)
		v1.POST("/designs/:designId/duplicate", r.designHandler.Duplicate)
		v1.GET("/designs/:designId/runs", r.runHandler.ListByDesign)
		v1.POST("/runs", r.runHandler.Create)
		v1.GET("/runs/:runId", r.runHandler.Get)
	}
}
