package graphs

import (
	"strings"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

func n(id string, kind domain.NodeArchetype) domain.Node {
	return domain.Node{ID: id, Label: id, Archetype: kind}
}

func e(id, from, to string) domain.Edge {
	return domain.Edge{ID: id, SourceNodeID: from, TargetNodeID: to}
}

const (
	client  = domain.NodeArchetypeClient
	gateway = domain.NodeArchetypeGateway
	service = domain.NodeArchetypeStatelessService
	cache   = domain.NodeArchetypeCache
	db      = domain.NodeArchetypeDatabase
	queue   = domain.NodeArchetypeQueue
	worker  = domain.NodeArchetypeWorker
	cdn     = domain.NodeArchetypeCDN
	objects = domain.NodeArchetypeObjectStore
)

func TestValidateGraph(t *testing.T) {
	valid := domain.Graph{
		Nodes: []domain.Node{n("c", client), n("s", service), n("d", db)},
		Edges: []domain.Edge{e("e1", "c", "s"), e("e2", "s", "d")},
	}

	cases := []struct {
		name    string
		mode    Mode
		mutate  func(g *domain.Graph)
		wantErr string // empty: valid
	}{
		{"valid", ModeRun, func(*domain.Graph) {}, ""},
		{"empty traffic and mode mean all and sync", ModeRun, func(g *domain.Graph) { g.Edges[0].Traffic, g.Edges[0].Mode = "", "" }, ""},
		{"explicit traffic and mode", ModeRun, func(g *domain.Graph) {
			g.Edges[1].Traffic, g.Edges[1].Mode = domain.EdgeTrafficWrites, domain.EdgeModeAsync
		}, ""},
		{"bad traffic", ModeSave, func(g *domain.Graph) { g.Edges[0].Traffic = "everything" }, `traffic "everything" must be one of`},
		{"bad mode", ModeSave, func(g *domain.Graph) { g.Edges[0].Mode = "later" }, `mode "later" must be sync or async`},
		{"negative weight", ModeSave, func(g *domain.Graph) { g.Edges[0].Weight = -1 }, "weight must be"},
		{"unknown target", ModeSave, func(g *domain.Graph) { g.Edges[1].TargetNodeID = "x" }, `unknown target node "x"`},
		{"self loop", ModeSave, func(g *domain.Graph) { g.Edges[1].TargetNodeID = "s" }, "to itself"},
		{"disallowed client to database", ModeSave, func(g *domain.Graph) { g.Edges[0].TargetNodeID = "d" }, "cannot connect a client to a database"},
		{"terminal has no outgoing edges", ModeSave, func(g *domain.Graph) {
			g.Nodes = append(g.Nodes, n("d2", db))
			g.Edges = append(g.Edges, e("e3", "d", "d2"))
		}, "a database cannot have outgoing connections"},
		{"duplicate node", ModeSave, func(g *domain.Graph) { g.Nodes = append(g.Nodes, n("s", service)) }, `duplicate node id "s"`},
		{"unknown kind", ModeSave, func(g *domain.Graph) { g.Nodes[1].Archetype = "mainframe" }, `archetype "mainframe" is not supported`},
		{"negative capacity", ModeSave, func(g *domain.Graph) { g.Nodes[1].Properties.CapacityRPS = -5 }, "capacity_rps cannot be negative"},
		{"hit rate above 1", ModeSave, func(g *domain.Graph) { g.Nodes[1].Properties.CacheHitRate = 1.5 }, "cache_hit_rate must be between 0 and 1"},
		{"availability above 1", ModeSave, func(g *domain.Graph) { g.Nodes[1].Properties.Availability = 2 }, "availability must be between 0 and 1"},
		{"no client", ModeRun, func(g *domain.Graph) {
			g.Nodes = g.Nodes[1:]
			g.Edges = g.Edges[1:]
		}, "at least one client node is required"},
		{"no client is fine for a draft", ModeSave, func(g *domain.Graph) {
			g.Nodes = g.Nodes[1:]
			g.Edges = g.Edges[1:]
		}, ""},
		{"client not connected", ModeRun, func(g *domain.Graph) { g.Edges = g.Edges[1:] }, "connect a client"},
		{"two clients are fine", ModeRun, func(g *domain.Graph) {
			g.Nodes = append(g.Nodes, n("c2", client))
			g.Edges = append(g.Edges, e("e3", "c2", "s"))
		}, ""},
		{"cycle", ModeRun, func(g *domain.Graph) {
			g.Nodes = append(g.Nodes, n("s2", service))
			g.Edges = append(g.Edges, e("e3", "s", "s2"), e("e4", "s2", "s"))
		}, "cycle"},
		{"cycle may be saved as a draft", ModeSave, func(g *domain.Graph) {
			g.Nodes = append(g.Nodes, n("s2", service))
			g.Edges = append(g.Edges, e("e3", "s", "s2"), e("e4", "s2", "s"))
		}, ""},
		{"unconnected node is not an error", ModeRun, func(g *domain.Graph) { g.Nodes = append(g.Nodes, n("lonely", cache)) }, ""},
		{"component must exist", ModeSave, func(g *domain.Graph) { g.Nodes[2].ComponentID = "oracle" }, `component_id "oracle" is not in the catalog`},
		{"component kind must match", ModeSave, func(g *domain.Graph) { g.Nodes[2].ComponentID = "redis" }, `is a "cache", not a "database"`},
		{"component may be empty", ModeSave, func(g *domain.Graph) { g.Nodes[2].ComponentID = "" }, ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := domain.Graph{Nodes: append([]domain.Node{}, valid.Nodes...), Edges: append([]domain.Edge{}, valid.Edges...)}
			tc.mutate(&g)
			err := ValidateGraph(g, tc.mode)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("error = %v, want it to contain %q", err, tc.wantErr)
			}
		})
	}
}

func TestAllowedConnections(t *testing.T) {
	allowed := [][2]domain.NodeArchetype{
		{client, cdn}, {client, gateway}, {client, service},
		{cdn, gateway}, {cdn, service}, {cdn, objects},
		{gateway, service}, {gateway, gateway},
		{service, cache}, {service, db}, {service, queue}, {service, objects}, {service, gateway},
		{worker, db}, {worker, queue},
		{cache, db}, {cache, objects},
		{queue, worker}, {queue, service},
	}
	for _, pair := range allowed {
		g := domain.Graph{Nodes: []domain.Node{n("a", pair[0]), n("b", pair[1])}, Edges: []domain.Edge{e("e", "a", "b")}}
		if err := ValidateGraph(g, ModeSave); err != nil {
			t.Errorf("%s -> %s: %v", pair[0], pair[1], err)
		}
	}
	denied := [][2]domain.NodeArchetype{{client, db}, {gateway, db}, {queue, db}, {cache, service}, {objects, service}}
	for _, pair := range denied {
		g := domain.Graph{Nodes: []domain.Node{n("a", pair[0]), n("b", pair[1])}, Edges: []domain.Edge{e("e", "a", "b")}}
		if err := ValidateGraph(g, ModeSave); err == nil {
			t.Errorf("%s -> %s: expected an error", pair[0], pair[1])
		}
	}
}

func TestWarnings(t *testing.T) {
	g := domain.Graph{
		Nodes: []domain.Node{n("c", client), n("s", service), {ID: "x", Label: "Spare cache", Archetype: cache}},
		Edges: []domain.Edge{e("e1", "c", "s")},
	}
	got := Warnings(g)
	if len(got) != 1 || !strings.Contains(got[0], "Spare cache (x) is not connected") {
		t.Fatalf("warnings = %v", got)
	}
}
