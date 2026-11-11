package catalog

import (
	"testing"

	"github.com/sidDarthVader31/luka/server/internal/domain"
)

func TestCatalogInvariants(t *testing.T) {
	c := Default()
	if len(c.Items) != 14 {
		t.Fatalf("items = %d, want 14", len(c.Items))
	}

	categories := map[string]bool{}
	for _, cat := range c.Categories {
		categories[cat.ID] = false
	}
	wantOrder := []string{"clients", "edge", "compute", "data", "messaging"}
	for i, id := range wantOrder {
		if c.Categories[i].ID != id {
			t.Fatalf("category[%d] = %q, want %q", i, c.Categories[i].ID, id)
		}
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

		if _, ok := KindDefaults(it.Kind); !ok {
			t.Errorf("%s: kind %q has no generic item", it.ID, it.Kind)
		}
		if it.Description == "" || it.Icon == "" || it.Name == "" {
			t.Errorf("%s: name, icon and description are required", it.ID)
		}
		if len(it.SupportedInteractions) == 0 || len(it.SupportedRoutingRules) == 0 {
			t.Errorf("%s: missing interactions or routing rules", it.ID)
		}

		props := map[domain.PropertyKey]float64{
			domain.PropertyKeyReplicas:      float64(it.DefaultProperties.Replicas),
			domain.PropertyKeyCapacityRPS:   it.DefaultProperties.CapacityRPS,
			domain.PropertyKeyBaseLatencyMS: it.DefaultProperties.BaseLatencyMS,
			domain.PropertyKeyCacheHitRate:  it.DefaultProperties.CacheHitRate,
		}
		primary := map[domain.PropertyKey]bool{}
		for _, f := range it.Fields {
			v := props[f.Key]
			if v < f.Min || (f.Max != 0 && v > f.Max) {
				t.Errorf("%s: default %s=%v outside [%v, %v]", it.ID, f.Key, v, f.Min, f.Max)
			}
			if f.Primary {
				primary[f.Key] = true
			}
		}
		if it.Kind == domain.NodeArchetypeClient {
			if len(it.Fields) != 0 {
				t.Errorf("client must have no fields")
			}
			continue
		}
		for _, key := range []domain.PropertyKey{domain.PropertyKeyReplicas, domain.PropertyKeyCapacityRPS, domain.PropertyKeyBaseLatencyMS} {
			if !primary[key] {
				t.Errorf("%s: missing primary field %s", it.ID, key)
			}
		}
		hasHit := false
		for _, f := range it.Fields {
			if f.Key == domain.PropertyKeyCacheHitRate {
				hasHit = true
			}
		}
		if hasHit != (it.Kind == domain.NodeArchetypeCache) {
			t.Errorf("%s: cache_hit_rate field only belongs on caches", it.ID)
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
	if it, ok := KindDefaults(domain.NodeArchetypeDatabase); !ok || it.ID != "postgres" {
		t.Fatalf("KindDefaults(database) = %+v, %v", it, ok)
	}
	if _, ok := KindDefaults("bogus"); ok {
		t.Fatal("unexpected kind")
	}
}
