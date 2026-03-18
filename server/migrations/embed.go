package migrations

import "embed"

// Files contains all SQL migrations for the Luka server.
//
//go:embed *.sql
var Files embed.FS
