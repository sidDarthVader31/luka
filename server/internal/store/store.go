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
	List() ([]domain.Design, error)
	Update(design domain.Design) error
}

type DesignVersionRepository interface {
	Save(version domain.DesignVersion) error
	ListByDesignID(designID string) ([]domain.DesignVersion, error)
	NextVersionNumber(designID string) (int, error)
}

type RunRepository interface {
	Save(run domain.Run) error
	GetByID(id string) (domain.Run, error)
	ListByDesignID(designID string) ([]domain.Run, error)
}
