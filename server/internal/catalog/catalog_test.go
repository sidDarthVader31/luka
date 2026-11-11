package catalog

import (
	"slices"
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

func propValue(p domain.NodeProperties, key domain.PropertyKey) float64 {
	switch key {
	case domain.PropertyKeyReplicas:
		return float64(p.Replicas)
	case domain.PropertyKeyCapacityRPS:
		return p.CapacityRPS
	case domain.PropertyKeyBaseLatencyMS:
		return p.BaseLatencyMS
	case domain.PropertyKeyCacheHitRate:
		return p.CacheHitRate
	case domain.PropertyKeyShards:
		return float64(p.Shards)
	case domain.PropertyKeyReadReplicas:
		return float64(p.ReadReplicas)
	case domain.PropertyKeyAvailability:
		return p.Availability
	}
	return -1
}

// wantFields is what docs/simulation-model.md uses per kind.
var wantFields = map[domain.NodeArchetype][]domain.PropertyKey{
	domain.NodeArchetypeClient:           {},
	domain.NodeArchetypeCDN:              {"replicas", "capacity_rps", "base_latency_ms", "cache_hit_rate", "availability"},
	domain.NodeArchetypeCache:            {"replicas", "capacity_rps", "base_latency_ms", "cache_hit_rate", "availability"},
	domain.NodeArchetypeDatabase:         {"capacity_rps", "base_latency_ms", "read_replicas", "shards", "availability"},
	domain.NodeArchetypeGateway:          {"replicas", "capacity_rps", "base_latency_ms", "availability"},
	domain.NodeArchetypeStatelessService: {"replicas", "capacity_rps", "base_latency_ms", "availability"},
	domain.NodeArchetypeWorker:           {"replicas", "capacity_rps", "base_latency_ms", "availability"},
	domain.NodeArchetypeQueue:            {"replicas", "capacity_rps", "base_latency_ms", "availability"},
	domain.NodeArchetypeObjectStore:      {"replicas", "capacity_rps", "base_latency_ms", "availability"},
	domain.NodeArchetypeSearch:           {"replicas", "capacity_rps", "base_latency_ms", "availability"},
}

func TestCatalogInvariants(t *testing.T) {
	c := Default()
	if len(c.Items) != 17 {
		t.Fatalf("items = %d, want 17", len(c.Items))
	}
	wantOrder := []string{"clients", "edge", "compute", "data", "messaging"}
	for i, id := range wantOrder {
		if c.Categories[i].ID != id {
			t.Fatalf("category[%d] = %q, want %q", i, c.Categories[i].ID, id)
		}
	}
	categories := map[string]bool{}
	for _, cat := range c.Categories {
		categories[cat.ID] = false
	}

	seen := map[string]bool{}
	for _, it := range c.Items {
		if seen[it.ID] {
			t.Errorf("duplicate id %q", it.ID)
		}
		seen[it.ID] = true
		if _, ok := categories[it.CategoryID]; !ok {
			t.Errorf("%s: unknown category %q", it.ID, it.CategoryID)
		}
		categories[it.CategoryID] = true
		if it.Description == "" || it.Icon == "" || it.Name == "" {
			t.Errorf("%s: name, icon and description are required", it.ID)
		}
		if !slices.Equal(it.AllowedTargets, AllowedTargets(it.Kind)) || it.AllowedTargets == nil {
			t.Errorf("%s: allowed targets %v do not match the connection table", it.ID, it.AllowedTargets)
		}

		var keys []domain.PropertyKey
		for _, f := range it.Fields {
			keys = append(keys, f.Key)
			v := propValue(it.DefaultProperties, f.Key)
			if v < f.Min || (f.Max != 0 && v > f.Max) {
				t.Errorf("%s: default %s=%v outside [%v, %v]", it.ID, f.Key, v, f.Min, f.Max)
			}
		}
		want, ok := wantFields[it.Kind]
		if !ok {
			t.Errorf("%s: kind %q has no expected fields", it.ID, it.Kind)
		} else if !slices.Equal(keys, want) && !(len(keys) == 0 && len(want) == 0) {
			t.Errorf("%s: fields %v, want %v", it.ID, keys, want)
		}

		if it.Kind == domain.NodeArchetypeClient {
			continue
		}
		if it.DefaultProperties.CapacityRPS <= 0 {
			t.Errorf("%s: needs a positive default capacity", it.ID)
		}
		a := it.DefaultProperties.Availability
		if a != availabilityTypical && a != availabilityManaged {
			t.Errorf("%s: availability default %v", it.ID, a)
		}
		if it.Kind == domain.NodeArchetypeDatabase {
			if it.DefaultProperties.Shards != 1 || it.DefaultProperties.ReadReplicas != 0 || it.DefaultProperties.Replicas != 0 {
				t.Errorf("%s: database defaults must be 1 shard, 0 read replicas, no replicas", it.ID)
			}
		} else if it.DefaultProperties.Replicas < 1 {
			t.Errorf("%s: needs at least one instance", it.ID)
		}
	}
	for _, id := range []string{"dynamodb", "s3", "sqs", "cdn"} {
		if it, _ := ItemByID(id); it.DefaultProperties.Availability != availabilityManaged {
			t.Errorf("%s: managed availability expected", id)
		}
	}
	for id, used := range categories {
		if !used {
			t.Errorf("category %q has no items", id)
		}
	}
}

func TestLookups(t *testing.T) {
	if it, ok := ItemByID("redis"); !ok || it.Kind != domain.NodeArchetypeCache {
		t.Fatalf("ItemByID(redis) = %+v, %v", it, ok)
	}
	if _, ok := ItemByID("nope"); ok {
		t.Fatal("unexpected item")
	}
	for kind, id := range map[domain.NodeArchetype]string{
		domain.NodeArchetypeDatabase: "postgres", domain.NodeArchetypeGateway: "load-balancer",
		domain.NodeArchetypeCDN: "cdn", domain.NodeArchetypeObjectStore: "s3", domain.NodeArchetypeSearch: "elasticsearch",
	} {
		if it, ok := KindDefaults(kind); !ok || it.ID != id {
			t.Errorf("KindDefaults(%s) = %s, want %s", kind, it.ID, id)
		}
	}
	if _, ok := KindDefaults("bogus"); ok {
		t.Fatal("unexpected kind")
	}
}

func TestResolveProperties(t *testing.T) {
	node := domain.Node{Archetype: domain.NodeArchetypeDatabase, ComponentID: "dynamodb", Properties: domain.NodeProperties{ReadReplicas: 2}}
	p := ResolveProperties(Default(), node)
	if p.CapacityRPS != 20000 || p.ReadReplicas != 2 || p.Shards != 1 || p.Availability != availabilityManaged {
		t.Fatalf("resolved = %+v", p)
	}
	// No component: the kind's generic item.
	p = ResolveProperties(Default(), domain.Node{Archetype: domain.NodeArchetypeCache})
	if p.CacheHitRate != 0.8 || p.Replicas != 1 {
		t.Fatalf("resolved = %+v", p)
	}
}
