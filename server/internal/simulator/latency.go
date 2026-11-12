package simulator

import (
	"fmt"
	"math"
	"strings"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

const (
	q50 = 0.5
	q99 = 0.99
)

// Quantile is the q-quantile response time of an M/M/1 instance with service
// time s at utilisation rho: s + max(0, s/(1−ρ)·ln(ρ/(1−q))). It is nil when
// ρ ≥ 1, where the queue grows without bound.
func Quantile(s, rho, q float64) *float64 {
	if rho >= 1 {
		return nil
	}
	v := s
	if rho > 0 {
		v += math.Max(0, s/(1-rho)*math.Log(rho/(1-q)))
	}
	return &v
}

func (m *model) nodeLatency(n *nodeState) {
	if n.kind() == domain.NodeArchetypeClient {
		return
	}
	s, rho := n.props.BaseLatencyMS, n.util
	n.p50, n.p99 = Quantile(s, rho, q50), Quantile(s, rho, q99)
	if n.p99 == nil {
		n.addWorking("latency undefined: utilisation %s ≥ 100%%, so the queue grows without bound", pct(rho))
		return
	}
	for _, q := range []struct {
		name string
		q    float64
		v    *float64
	}{{"p50", q50, n.p50}, {"p99", q99, n.p99}} {
		if rho <= 0 {
			n.addWorking("%s = %s (idle)", q.name, ms(s))
			continue
		}
		n.addWorking("%s = %s + max(0, %s / (1 − %s) × ln(%s / %s)) = %s",
			q.name, num(s), num(s), dec(rho, 4), dec(rho, 4), num(1-q.q), ms(*q.v))
	}
}

// latencyPath is an end-to-end latency with the terms that make it up.
type latencyPath struct {
	value *float64 // nil when undefined
	terms []string
}

func (p latencyPath) plus(o latencyPath) latencyPath {
	out := latencyPath{terms: append(append([]string{}, p.terms...), o.terms...)}
	if p.value != nil && o.value != nil {
		v := *p.value + *o.value
		out.value = &v
	}
	return out
}

func defined(v float64) latencyPath { return latencyPath{value: &v} }

func (m *model) own(n *nodeState, q float64) latencyPath {
	v := n.p50
	if q == q99 {
		v = n.p99
	}
	if v == nil {
		return latencyPath{terms: []string{n.label() + " undefined (overloaded)"}}
	}
	return latencyPath{value: v, terms: []string{n.label() + " " + num(*v)}}
}

// pathLatency is the q-quantile latency of a class-c request arriving at node i,
// including its sync dependencies (docs/simulation-model.md, "End-to-end latency").
func (m *model) pathLatency(i int, c class, q float64) latencyPath {
	n := m.nodes[i]
	var p latencyPath
	if n.kind() == domain.NodeArchetypeClient {
		p = defined(0)
	} else {
		p = m.own(n, q)
	}

	switch n.kind() {
	case domain.NodeArchetypeClient, domain.NodeArchetypeStatelessService, domain.NodeArchetypeWorker:
		es := m.edgesFor(i, c)
		if n.kind() == domain.NodeArchetypeClient && len(es) == 0 {
			return latencyPath{terms: []string{"no route for " + c.String()}}
		}
		for _, e := range es {
			if m.sync(e) {
				p = p.plus(m.pathLatency(m.dst[e], c, q))
			}
		}
	case domain.NodeArchetypeGateway:
		es := m.edgesFor(i, c)
		shares := m.shares(es)
		var eligible []int
		for pass := 0; pass < 2 && len(eligible) == 0; pass++ {
			for k, e := range es {
				if m.sync(e) && (pass == 1 || shares[k] > 1-q) {
					eligible = append(eligible, e)
				}
			}
		}
		var best *latencyPath
		for _, e := range eligible {
			b := m.pathLatency(m.dst[e], c, q)
			switch {
			case best == nil:
				best = &b
			case best.value == nil:
			case b.value == nil || *b.value > *best.value:
				best = &b
			}
		}
		if best != nil {
			if len(eligible) > 1 && len(best.terms) > 0 {
				best.terms[0] += " (slowest branch)"
			}
			p = p.plus(*best)
		}
	case domain.NodeArchetypeCache, domain.NodeArchetypeCDN:
		miss := 1.0
		if c == classRead {
			miss = 1 - n.props.CacheHitRate
		}
		if miss > 1-q {
			down := defined(0)
			for _, e := range m.edgesFor(i, c) {
				if m.sync(e) {
					down = down.plus(m.pathLatency(m.dst[e], c, q))
				}
			}
			if c == classRead && len(down.terms) > 0 {
				down.terms[0] = fmt.Sprintf("on a miss (%s > %s) %s", pct(miss), pct(1-q), down.terms[0])
			}
			p = p.plus(down)
		}
	}
	return p
}

func (p latencyPath) String() string {
	s := strings.Join(p.terms, " + ")
	if s == "" {
		s = "0"
	}
	if p.value == nil {
		return s + " = undefined"
	}
	return s + " = " + ms(*p.value)
}
