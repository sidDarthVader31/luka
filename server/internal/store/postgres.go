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

func (r *PostgresDesignRepository) Create(design domain.Design) error {
	graphJSON, err := json.Marshal(design.Graph)
	if err != nil {
		return fmt.Errorf("marshal design graph: %w", err)
	}

	_, err = r.pool.Exec(
		context.Background(),
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

func (r *PostgresDesignRepository) GetByID(id string) (domain.Design, error) {
	row := r.pool.QueryRow(
		context.Background(),
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

func (r *PostgresDesignRepository) List() ([]domain.Design, error) {
	rows, err := r.pool.Query(
		context.Background(),
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

func (r *PostgresDesignRepository) Update(design domain.Design) error {
	graphJSON, err := json.Marshal(design.Graph)
	if err != nil {
		return fmt.Errorf("marshal design graph: %w", err)
	}

	commandTag, err := r.pool.Exec(
		context.Background(),
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

type PostgresRunRepository struct {
	pool *pgxpool.Pool
}

type PostgresDesignVersionRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRunRepository(pool *pgxpool.Pool) *PostgresRunRepository {
	return &PostgresRunRepository{pool: pool}
}

func NewPostgresDesignVersionRepository(pool *pgxpool.Pool) *PostgresDesignVersionRepository {
	return &PostgresDesignVersionRepository{pool: pool}
}

func (r *PostgresRunRepository) Save(run domain.Run) error {
	designSnapshotJSON, err := json.Marshal(run.DesignSnapshot)
	if err != nil {
		return fmt.Errorf("marshal design snapshot: %w", err)
	}

	workloadJSON, err := json.Marshal(run.Workload)
	if err != nil {
		return fmt.Errorf("marshal workload: %w", err)
	}

	simulationConfigJSON, err := json.Marshal(run.SimulationConfig)
	if err != nil {
		return fmt.Errorf("marshal simulation config: %w", err)
	}

	var resultJSON []byte
	if run.Result != nil {
		resultJSON, err = json.Marshal(run.Result)
		if err != nil {
			return fmt.Errorf("marshal run result: %w", err)
		}
	}

	_, err = r.pool.Exec(
		context.Background(),
		`insert into runs (
			id,
			design_id,
			design_snapshot,
			workload,
			simulation_config,
			status,
			result,
			error,
			created_at,
			completed_at
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		run.ID,
		run.DesignID,
		designSnapshotJSON,
		workloadJSON,
		simulationConfigJSON,
		run.Status,
		resultJSON,
		run.Error,
		run.CreatedAt,
		run.CompletedAt,
	)
	if err != nil {
		return fmt.Errorf("insert run: %w", err)
	}

	return nil
}

func (r *PostgresRunRepository) GetByID(id string) (domain.Run, error) {
	row := r.pool.QueryRow(
		context.Background(),
		`select
			id,
			design_id,
			design_snapshot,
			workload,
			simulation_config,
			status,
			result,
			error,
			created_at,
			completed_at
		 from runs
		 where id = $1`,
		id,
	)

	return scanRun(row)
}

func (r *PostgresRunRepository) ListByDesignID(designID string) ([]domain.Run, error) {
	rows, err := r.pool.Query(
		context.Background(),
		`select
			id,
			design_id,
			design_snapshot,
			workload,
			simulation_config,
			status,
			result,
			error,
			created_at,
			completed_at
		 from runs
		 where design_id = $1
		 order by created_at desc, id desc`,
		designID,
	)
	if err != nil {
		return nil, fmt.Errorf("query runs by design: %w", err)
	}
	defer rows.Close()

	runs := make([]domain.Run, 0)
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}

		runs = append(runs, run)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate runs by design: %w", err)
	}

	return runs, nil
}

func scanRun(row interface {
	Scan(dest ...any) error
}) (domain.Run, error) {
	var run domain.Run
	var designSnapshotJSON []byte
	var workloadJSON []byte
	var simulationConfigJSON []byte
	var resultJSON []byte
	if err := row.Scan(
		&run.ID,
		&run.DesignID,
		&designSnapshotJSON,
		&workloadJSON,
		&simulationConfigJSON,
		&run.Status,
		&resultJSON,
		&run.Error,
		&run.CreatedAt,
		&run.CompletedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return domain.Run{}, ErrRunNotFound
		}
		return domain.Run{}, fmt.Errorf("query run: %w", err)
	}

	if err := json.Unmarshal(designSnapshotJSON, &run.DesignSnapshot); err != nil {
		return domain.Run{}, fmt.Errorf("unmarshal design snapshot: %w", err)
	}

	if err := json.Unmarshal(workloadJSON, &run.Workload); err != nil {
		return domain.Run{}, fmt.Errorf("unmarshal workload: %w", err)
	}

	if err := json.Unmarshal(simulationConfigJSON, &run.SimulationConfig); err != nil {
		return domain.Run{}, fmt.Errorf("unmarshal simulation config: %w", err)
	}

	if len(resultJSON) > 0 {
		var result domain.SimulationResult
		if err := json.Unmarshal(resultJSON, &result); err != nil {
			return domain.Run{}, fmt.Errorf("unmarshal run result: %w", err)
		}
		run.Result = &result
	}

	return run, nil
}

func (r *PostgresDesignVersionRepository) Save(version domain.DesignVersion) error {
	snapshotJSON, err := json.Marshal(version.DesignSnapshot)
	if err != nil {
		return fmt.Errorf("marshal design version snapshot: %w", err)
	}

	_, err = r.pool.Exec(
		context.Background(),
		`insert into design_versions (design_id, version, design_snapshot, created_at)
		 values ($1, $2, $3, $4)`,
		version.DesignID,
		version.Version,
		snapshotJSON,
		version.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("insert design version: %w", err)
	}

	return nil
}

func (r *PostgresDesignVersionRepository) ListByDesignID(designID string) ([]domain.DesignVersion, error) {
	rows, err := r.pool.Query(
		context.Background(),
		`select design_id, version, design_snapshot, created_at
		 from design_versions
		 where design_id = $1
		 order by version desc`,
		designID,
	)
	if err != nil {
		return nil, fmt.Errorf("query design versions: %w", err)
	}
	defer rows.Close()

	versions := make([]domain.DesignVersion, 0)
	for rows.Next() {
		var version domain.DesignVersion
		var snapshotJSON []byte
		if err := rows.Scan(&version.DesignID, &version.Version, &snapshotJSON, &version.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan design version: %w", err)
		}
		if err := json.Unmarshal(snapshotJSON, &version.DesignSnapshot); err != nil {
			return nil, fmt.Errorf("unmarshal design version snapshot: %w", err)
		}
		versions = append(versions, version)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate design versions: %w", err)
	}

	return versions, nil
}

func (r *PostgresDesignVersionRepository) NextVersionNumber(designID string) (int, error) {
	row := r.pool.QueryRow(
		context.Background(),
		`select coalesce(max(version), 0) + 1
		 from design_versions
		 where design_id = $1`,
		designID,
	)

	var next int
	if err := row.Scan(&next); err != nil {
		return 0, fmt.Errorf("query next design version: %w", err)
	}

	return next, nil
}
