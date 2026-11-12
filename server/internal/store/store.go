package store

import (
	"context"
	"fmt"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// ErrDesignNotFound matches domain.ErrNotFound via errors.Is.
var ErrDesignNotFound = fmt.Errorf("design %w", domain.ErrNotFound)

type DesignRepository interface {
	Create(ctx context.Context, design domain.Design) error
	GetByID(ctx context.Context, id string) (domain.Design, error)
	List(ctx context.Context) ([]domain.Design, error)
	Update(ctx context.Context, design domain.Design) error
}
