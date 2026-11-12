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
		`insert into designs (id, name, description, problem_id, graph, scene, created_at, updated_at)
		 values ($1, $2, $3, $4, $5, $6, $7, $8)`,
		design.ID,
		design.Name,
		design.Description,
		design.ProblemID,
		graphJSON,
		sceneArg(design.Scene),
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
		`select id, name, description, problem_id, graph, scene, created_at, updated_at
		 from designs
		 where id = $1`,
		id,
	)

	var design domain.Design
	var graphJSON, sceneJSON []byte
	if err := row.Scan(
		&design.ID,
		&design.Name,
		&design.Description,
		&design.ProblemID,
		&graphJSON,
		&sceneJSON,
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

	design.Scene = sceneJSON

	return design, nil
}

func (r *PostgresDesignRepository) List(ctx context.Context) ([]domain.Design, error) {
	rows, err := r.pool.Query(
		ctx,
		`select id, name, description, problem_id, graph, scene, created_at, updated_at
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
		var graphJSON, sceneJSON []byte
		if err := rows.Scan(
			&design.ID,
			&design.Name,
			&design.Description,
			&design.ProblemID,
			&graphJSON,
			&sceneJSON,
			&design.CreatedAt,
			&design.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan design: %w", err)
		}
		if err := json.Unmarshal(graphJSON, &design.Graph); err != nil {
			return nil, fmt.Errorf("unmarshal design graph: %w", err)
		}
		design.Scene = sceneJSON
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
		 set name = $2, description = $3, problem_id = $4, graph = $5, scene = $6, updated_at = $7
		 where id = $1`,
		design.ID,
		design.Name,
		design.Description,
		design.ProblemID,
		graphJSON,
		sceneArg(design.Scene),
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

// sceneArg maps an empty scene to SQL NULL.
func sceneArg(scene json.RawMessage) any {
	if len(scene) == 0 {
		return nil
	}
	return []byte(scene)
}
