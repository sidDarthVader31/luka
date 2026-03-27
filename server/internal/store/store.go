package store

import (
	"errors"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

var (
	ErrDesignNotFound = errors.New("design not found")
	ErrRunNotFound    = errors.New("run not found")
)

type DesignRepository interface {
	Create(design domain.Design) error
	GetByID(id string) (domain.Design, error)
	Update(design domain.Design) error
}

type RunRepository interface {
	Save(run domain.Run) error
	GetByID(id string) (domain.Run, error)
	ListByDesignID(designID string) ([]domain.Run, error)
}
