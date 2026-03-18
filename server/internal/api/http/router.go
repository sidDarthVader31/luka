package http

import "github.com/gin-gonic/gin"

type Router struct {
	engine *gin.Engine
}

func NewRouter() *Router {
	engine := gin.New()
	engine.Use(gin.Logger(), gin.Recovery())

	router := &Router{engine: engine}
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
	}
}
