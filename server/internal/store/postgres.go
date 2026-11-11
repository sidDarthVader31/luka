package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

type PostgresDesignRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresDesignRepository(pool *pgxpool.Pool) *PostgresDesignRepository {
	return &PostgresDesignRepository{pool: pool}
}

func (r *PostgresDesignRepository) Create(ctx context.Context, design domain.Design) error {
	graphJSON, err := json.Marshal(design.Graph)
	if err != nil {
		return fmt.Errorf("marshal design graph: %w", err)
	}

	_, err = r.pool.Exec(
		ctx,
		`insert into designs (id, name, description, graph, created_at, updated_at)
		 values ($1, $2, $3, $4, $5, $6)`,
		design.ID,
		design.Name,
		design.Description,
		graphJSON,
		design.CreatedAt,
		design.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert design: %w", err)
	}

	return nil
}

func (r *PostgresDesignRepository) GetByID(ctx context.Context, id string) (domain.Design, error) {
	row := r.pool.QueryRow(
		ctx,
		`select id, name, description, graph, created_at, updated_at
		 from designs
		 where id = $1`,
		id,
	)

	var design domain.Design
	var graphJSON []byte
	if err := row.Scan(
		&design.ID,
		&design.Name,
		&design.Description,
		&graphJSON,
		&design.CreatedAt,
		&design.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Design{}, ErrDesignNotFound
		}
		return domain.Design{}, fmt.Errorf("query design: %w", err)
	}

	if err := json.Unmarshal(graphJSON, &design.Graph); err != nil {
		return domain.Design{}, fmt.Errorf("unmarshal design graph: %w", err)
	}

	return design, nil
}

func (r *PostgresDesignRepository) List(ctx context.Context) ([]domain.Design, error) {
	rows, err := r.pool.Query(
		ctx,
		`select id, name, description, graph, created_at, updated_at
		 from designs
		 order by updated_at desc, name asc`,
	)
	if err != nil {
		return nil, fmt.Errorf("query designs: %w", err)
	}
	defer rows.Close()

	designs := make([]domain.Design, 0)
	for rows.Next() {
		var design domain.Design
		var graphJSON []byte
		if err := rows.Scan(
			&design.ID,
			&design.Name,
			&design.Description,
			&graphJSON,
			&design.CreatedAt,
			&design.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan design: %w", err)
		}
		if err := json.Unmarshal(graphJSON, &design.Graph); err != nil {
			return nil, fmt.Errorf("unmarshal design graph: %w", err)
		}
		designs = append(designs, design)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate designs: %w", err)
	}

	return designs, nil
}

func (r *PostgresDesignRepository) Update(ctx context.Context, design domain.Design) error {
	graphJSON, err := json.Marshal(design.Graph)
	if err != nil {
		return fmt.Errorf("marshal design graph: %w", err)
	}

	commandTag, err := r.pool.Exec(
		ctx,
		`update designs
		 set name = $2, description = $3, graph = $4, updated_at = $5
		 where id = $1`,
		design.ID,
		design.Name,
		design.Description,
		graphJSON,
		design.UpdatedAt,
	)
	if err != nil {
		return fmt.Errorf("update design: %w", err)
	}

	if commandTag.RowsAffected() == 0 {
		return ErrDesignNotFound
	}

	return nil
}
