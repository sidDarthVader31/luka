create table if not exists designs (
    id text primary key,
    name text not null,
    description text not null default '',
    graph jsonb not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table if not exists runs (
    id text primary key,
    design_id text not null references designs(id) on delete restrict,
    design_snapshot jsonb not null,
    workload jsonb not null,
    simulation_config jsonb not null,
    status text not null,
    result jsonb,
    error text,
    created_at timestamptz not null,
    completed_at timestamptz
);

create index if not exists idx_runs_design_id_created_at
    on runs (design_id, created_at desc);
