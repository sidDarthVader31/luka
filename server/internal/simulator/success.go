package simulator

import (
	"fmt"
	"strings"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

// factor is a value with the expression that produced it. An empty expr means
// the value is trivially 1 and can be left out of a product.
type factor struct {
	v    float64
	expr string
}

func one() factor { return factor{v: 1} }

func (f factor) show() string {
	if f.expr == "" {
		return pct(f.v)
	}
	return f.expr
}

func product(fs ...factor) factor {
	out := factor{v: 1}
	var parts []string
	for _, f := range fs {
		out.v *= f.v
		if f.expr != "" {
			parts = append(parts, f.expr)
		}
	}
	out.expr = strings.Join(parts, " × ")
	return out
}

// success is the fraction of class-c requests arriving at node i that succeed,
// including failures in its sync dependencies (docs/simulation-model.md,
// "Success rate and backpressure").
func (m *model) success(i int, c class) factor {
	n := m.nodes[i]
	self := one()
	if f := n.servedFraction(); f < 1 {
		self = factor{v: f, expr: fmt.Sprintf("%s %s", n.label(), pct(f))}
	}
	es := m.edgesFor(i, c)
	var syncEs []int
	for _, e := range es {
		if m.sync(e) {
			syncEs = append(syncEs, e)
		}
	}
	deps := func() factor {
		fs := []factor{}
		for _, e := range syncEs {
			fs = append(fs, m.success(m.dst[e], c))
		}
		return product(fs...)
	}

	switch n.kind() {
	case domain.NodeArchetypeClient:
		if len(es) == 0 {
			return factor{v: 0, expr: "no route for " + c.String()}
		}
		return deps()
	case domain.NodeArchetypeStatelessService, domain.NodeArchetypeWorker:
		return product(self, deps())
	case domain.NodeArchetypeGateway:
		if len(es) == 0 {
			return factor{v: 0, expr: n.label() + " has no target for " + c.String()}
		}
		shares := m.shares(es)
		avg, trivial := 0.0, true
		var parts []string
		for k, e := range es {
			f := one()
			if m.sync(e) {
				f = m.success(m.dst[e], c)
			}
			avg += shares[k] * f.v
			trivial = trivial && f.expr == ""
			parts = append(parts, fmt.Sprintf("%s × %s", num(shares[k]), f.show()))
		}
		g := one()
		if !trivial {
			g = factor{v: avg, expr: "(" + strings.Join(parts, " + ") + ")"}
		}
		return product(self, g)
	case domain.NodeArchetypeCache, domain.NodeArchetypeCDN:
		down := deps()
		if c == classWrite || down.expr == "" {
			return product(self, down)
		}
		h := n.props.CacheHitRate
		return product(self, factor{
			v:    h + (1-h)*down.v,
			expr: fmt.Sprintf("(%s + %s × %s)", num(h), num(1-h), down.expr),
		})
	default: // queue and terminal kinds: only their own capacity
		return self
	}
}

// availability is the probability that node i and its sync dependencies for
// class c are up (docs/simulation-model.md, "Availability").
func (m *model) availability(i int, c class) factor {
	n := m.nodes[i]
	self := factor{v: n.avail, expr: fmt.Sprintf("%s %s", n.label(), availPct(n.avail))}
	es := m.edgesFor(i, c)
	var fs []factor
	if n.kind() == domain.NodeArchetypeClient {
		if len(es) == 0 {
			return factor{v: 0, expr: "no route for " + c.String()}
		}
	} else {
		fs = append(fs, self)
	}

	switch n.kind() {
	case domain.NodeArchetypeGateway:
		if len(es) == 0 {
			return factor{v: 0, expr: n.label() + " has no target for " + c.String()}
		}
		shares := m.shares(es)
		avg := 0.0
		var parts []string
		for k, e := range es {
			f := factor{v: 1, expr: "100%"}
			if m.sync(e) {
				f = m.availability(m.dst[e], c)
			}
			avg += shares[k] * f.v
			parts = append(parts, fmt.Sprintf("%s × %s", num(shares[k]), f.expr))
		}
		expr := strings.Join(parts, " + ")
		if len(parts) > 1 {
			expr = "(" + expr + ")"
		} else {
			expr = strings.TrimPrefix(expr, "1 × ")
		}
		fs = append(fs, factor{v: avg, expr: expr})
	case domain.NodeArchetypeQueue, domain.NodeArchetypeDatabase, domain.NodeArchetypeObjectStore, domain.NodeArchetypeSearch:
		// no sync dependencies
	default: // client, service, worker, cache, cdn: in series with sync deps
		for _, e := range es {
			if m.sync(e) {
				fs = append(fs, m.availability(m.dst[e], c))
			}
		}
	}
	if len(fs) == 0 {
		return factor{v: 1, expr: "100%"}
	}
	return product(fs...)
}
