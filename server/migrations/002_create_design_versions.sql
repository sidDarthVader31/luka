create table if not exists design_versions (
    design_id text not null references designs(id) on delete cascade,
    version integer not null,
    design_snapshot jsonb not null,
    created_at timestamptz not null,
    primary key (design_id, version)
);

create index if not exists idx_design_versions_design_id_version
    on design_versions (design_id, version desc);
