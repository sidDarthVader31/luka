package domain

import "time"

type DesignVersion struct {
	DesignID       string    `json:"design_id"`
	Version        int       `json:"version"`
	DesignSnapshot Design    `json:"design_snapshot"`
	CreatedAt      time.Time `json:"created_at"`
}
