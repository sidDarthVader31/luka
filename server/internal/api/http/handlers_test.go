package http

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/sidDarthVader31/luka/server/internal/designs"
	"github.com/sidDarthVader31/luka/server/internal/domain"
	"github.com/sidDarthVader31/luka/server/internal/simulation"
	"github.com/sidDarthVader31/luka/server/internal/simulator"
	"github.com/sidDarthVader31/luka/server/internal/store"
)

func init() { gin.SetMode(gin.TestMode) }

func newTestRouter(t *testing.T, repo store.DesignRepository) *gin.Engine {
	t.Helper()
	if err := store.SeedSampleDesigns(context.Background(), repo); err != nil {
		t.Fatalf("seed: %v", err)
	}
	return NewRouter(designs.NewService(repo), simulation.NewService(repo, simulator.NewService())).Engine()
}

func do(t *testing.T, engine *gin.Engine, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

func errorMessage(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var payload struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error body %q: %v", rec.Body.String(), err)
	}
	return payload.Error
}

var testWorkload = domain.Workload{RequestsPerSecond: 1000, PayloadKB: 2}

func TestSimulateByID(t *testing.T) {
	engine := newTestRouter(t, store.NewMemoryDesignRepository())

	rec := do(t, engine, http.MethodPost, "/api/v1/simulate", domain.SimulateRequest{
		DesignID: store.SampleCacheAsideID,
		Workload: testWorkload,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}

	var response domain.SimulateResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if response.Result == nil || len(response.Result.Nodes) == 0 {
		t.Fatalf("expected result with nodes, got %s", rec.Body)
	}
}

func TestSimulateInlineDesign(t *testing.T) {
	repo := store.NewMemoryDesignRepository()
	engine := newTestRouter(t, repo)
	sample, err := repo.GetByID(context.Background(), store.SampleQueueWorkflowID)
	if err != nil {
		t.Fatal(err)
	}

	rec := do(t, engine, http.MethodPost, "/api/v1/simulate", domain.SimulateRequest{
		Design:   &sample,
		Workload: testWorkload,
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
}

func TestSimulateStoresNothing(t *testing.T) {
	repo := store.NewMemoryDesignRepository()
	engine := newTestRouter(t, repo)
	before, _ := repo.List(context.Background())

	do(t, engine, http.MethodPost, "/api/v1/simulate", domain.SimulateRequest{
		DesignID: store.SampleCacheAsideID,
		Workload: testWorkload,
	})

	after, _ := repo.List(context.Background())
	if len(after) != len(before) {
		t.Fatalf("designs %d -> %d, simulate must not store", len(before), len(after))
	}
}

func TestErrorMapping(t *testing.T) {
	engine := newTestRouter(t, store.NewMemoryDesignRepository())

	cases := []struct {
		name   string
		method string
		path   string
		body   any
		want   int
	}{
		{"simulate unknown design", http.MethodPost, "/api/v1/simulate", domain.SimulateRequest{DesignID: "missing", Workload: testWorkload}, http.StatusNotFound},
		{"simulate no design", http.MethodPost, "/api/v1/simulate", domain.SimulateRequest{Workload: testWorkload}, http.StatusBadRequest},
		{"simulate bad workload", http.MethodPost, "/api/v1/simulate", domain.SimulateRequest{DesignID: store.SampleCacheAsideID}, http.StatusBadRequest},
		{"get unknown design", http.MethodGet, "/api/v1/designs/missing", nil, http.StatusNotFound},
		{"create without name", http.MethodPost, "/api/v1/designs", domain.CreateDesignRequest{}, http.StatusBadRequest},
		{"duplicate unknown", http.MethodPost, "/api/v1/designs/missing/duplicate", domain.DuplicateDesignRequest{}, http.StatusNotFound},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(t, engine, tc.method, tc.path, tc.body)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d, body = %s", rec.Code, tc.want, rec.Body)
			}
		})
	}
}

func TestMalformedBodyIs400(t *testing.T) {
	engine := newTestRouter(t, store.NewMemoryDesignRepository())
	req := httptest.NewRequest(http.MethodPost, "/api/v1/simulate", strings.NewReader("{not json"))
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestRespondErrorHidesInternalDetails(t *testing.T) {
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodGet, "/x", nil)

	respondError(c, errors.New("pgx: connection refused at 10.0.0.5:5432"))

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "pgx") || strings.Contains(rec.Body.String(), "10.0.0.5") {
		t.Fatalf("driver text leaked: %s", rec.Body)
	}
}

type failingRepo struct{ store.DesignRepository }

func (failingRepo) GetByID(context.Context, string) (domain.Design, error) {
	return domain.Design{}, errors.New("boom: driver detail")
}

func TestRepositoryFailureIs500(t *testing.T) {
	engine := NewRouter(designs.NewService(failingRepo{}), simulation.NewService(failingRepo{}, simulator.NewService())).Engine()

	rec := do(t, engine, http.MethodGet, "/api/v1/designs/any", nil)
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if strings.Contains(rec.Body.String(), "driver detail") {
		t.Fatalf("driver text leaked: %s", rec.Body)
	}
}

func TestSamplePatchRejected(t *testing.T) {
	engine := newTestRouter(t, store.NewMemoryDesignRepository())

	rec := do(t, engine, http.MethodPatch, "/api/v1/designs/"+store.SampleCacheAsideID, map[string]string{"name": "hacked"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400, body = %s", rec.Code, rec.Body)
	}
	if !strings.Contains(errorMessage(t, rec), "read-only") {
		t.Fatalf("message = %q, want read-only explanation", errorMessage(t, rec))
	}
}

func TestTemplatesAndDuplicateSample(t *testing.T) {
	engine := newTestRouter(t, store.NewMemoryDesignRepository())

	rec := do(t, engine, http.MethodGet, "/api/v1/templates", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("templates status = %d", rec.Code)
	}
	var list struct {
		Items []domain.Design `json:"items"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 2 {
		t.Fatalf("templates len = %d, want 2", len(list.Items))
	}

	rec = do(t, engine, http.MethodPost, "/api/v1/designs/"+store.SampleQueueWorkflowID+"/duplicate", domain.DuplicateDesignRequest{})
	if rec.Code != http.StatusCreated {
		t.Fatalf("duplicate status = %d, body = %s", rec.Code, rec.Body)
	}
	var copyDesign domain.Design
	if err := json.Unmarshal(rec.Body.Bytes(), &copyDesign); err != nil {
		t.Fatal(err)
	}
	if store.IsSampleID(copyDesign.ID) {
		t.Fatalf("copy id %q must not be a sample id", copyDesign.ID)
	}

	rec = do(t, engine, http.MethodPatch, "/api/v1/designs/"+copyDesign.ID, map[string]string{"name": "mine"})
	if rec.Code != http.StatusOK {
		t.Fatalf("patch copy status = %d, body = %s", rec.Code, rec.Body)
	}
}
