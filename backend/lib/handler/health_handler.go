// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	storage "github.com/supabase-community/storage-go"
	supabase "github.com/supabase-community/supabase-go"

	"github.com/Hammadullah2/Roadlytics/backend/lib/modelclient"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

const healthHandlerVersion = "1.0.0"

type healthProbe func(context.Context, *http.Request) error

// DBPinger describes the database dependency required by the health handler.
type DBPinger interface {
	Ping(context.Context) error
}

// HealthHandlerOption customizes the health handler for tests and alternate runtime probes.
type HealthHandlerOption func(*HealthHandler)

// HealthHandler serves the backend health endpoint with live dependency checks.
type HealthHandler struct {
	db             DBPinger
	supabaseProbe  healthProbe
	storageProbe   healthProbe
	inferenceProbe healthProbe
	now            func() time.Time
	version        string
}

type healthResponse struct {
	Status    string            `json:"status"`
	Checks    map[string]string `json:"checks"`
	Version   string            `json:"version"`
	Timestamp string            `json:"timestamp"`
}

// WithSupabaseHealthProbe overrides the default Supabase probe.
func WithSupabaseHealthProbe(probe func(context.Context, *http.Request) error) HealthHandlerOption {
	return func(h *HealthHandler) {
		if probe != nil {
			h.supabaseProbe = probe
		}
	}
}

// WithStorageHealthProbe overrides the default storage probe.
func WithStorageHealthProbe(probe func(context.Context, *http.Request) error) HealthHandlerOption {
	return func(h *HealthHandler) {
		if probe != nil {
			h.storageProbe = probe
		}
	}
}

// WithInferenceClient wires an inference-server health probe into the handler.
// Passing nil disables the probe — the backend stays healthy regardless of the
// inference server's status, preserving their independence.
func WithInferenceClient(client *modelclient.Client) HealthHandlerOption {
	return func(h *HealthHandler) {
		if client == nil {
			return
		}

		h.inferenceProbe = func(ctx context.Context, _ *http.Request) error {
			if _, err := client.HealthCheck(ctx); err != nil {
				return fmt.Errorf("inference server health: %w", err)
			}
			return nil
		}
	}
}

// WithHealthNow overrides the clock used in health responses.
func WithHealthNow(now func() time.Time) HealthHandlerOption {
	return func(h *HealthHandler) {
		if now != nil {
			h.now = now
		}
	}
}

// NewHealthHandler creates a health handler with live dependency probes.
func NewHealthHandler(db DBPinger, opts ...HealthHandlerOption) *HealthHandler {
	h := &HealthHandler{
		db:            db,
		supabaseProbe: defaultSupabaseHealthProbe,
		storageProbe:  defaultStorageHealthProbe,
		now: func() time.Time {
			return time.Now().UTC()
		},
		version: healthHandlerVersion,
	}

	for _, opt := range opts {
		if opt != nil {
			opt(h)
		}
	}

	return h
}

// Get returns the backend health status and live dependency checks.
func (h *HealthHandler) Get(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	checks := map[string]string{
		"database": "disconnected",
		"supabase": "disconnected",
		"storage":  "disconnected",
	}

	httpStatus := http.StatusOK
	overallStatus := "ok"

	if err := h.pingDatabase(ctx); err != nil {
		httpStatus = http.StatusInternalServerError
		overallStatus = "error"
	} else {
		checks["database"] = "connected"
	}

	if err := h.runProbe(h.supabaseProbe, ctx, r); err == nil {
		checks["supabase"] = "connected"
	} else if overallStatus == "ok" {
		overallStatus = "degraded"
	}

	if err := h.runProbe(h.storageProbe, ctx, r); err == nil {
		checks["storage"] = "connected"
	} else if overallStatus == "ok" {
		overallStatus = "degraded"
	}

	// Inference server is an optional independent service on the VPS.
	if h.inferenceProbe != nil {
		if err := h.runProbe(h.inferenceProbe, ctx, r); err == nil {
			checks["inference_server"] = "connected"
		} else {
			checks["inference_server"] = "disconnected"
			if overallStatus == "ok" {
				overallStatus = "degraded"
			}
		}
	}

	response.JSON(w, httpStatus, healthResponse{
		Status:    overallStatus,
		Checks:    checks,
		Version:   h.version,
		Timestamp: h.now().Format(time.RFC3339),
	})
}

func (h *HealthHandler) pingDatabase(ctx context.Context) error {
	if h == nil || h.db == nil {
		return fmt.Errorf("database is not configured")
	}

	if err := h.db.Ping(ctx); err != nil {
		return fmt.Errorf("ping database: %w", err)
	}

	return nil
}

func (h *HealthHandler) runProbe(probe healthProbe, ctx context.Context, r *http.Request) error {
	if probe == nil {
		return fmt.Errorf("probe is not configured")
	}

	if err := probe(ctx, r); err != nil {
		return fmt.Errorf("run probe: %w", err)
	}

	return nil
}

func defaultSupabaseHealthProbe(_ context.Context, _ *http.Request) error {
	client, err := newSupabaseHealthClient()
	if err != nil {
		return err
	}

	if _, _, err := client.From("profiles").Select("id", "exact", false).Limit(1, "").Execute(); err != nil {
		return fmt.Errorf("query profiles table: %w", err)
	}

	return nil
}

func defaultStorageHealthProbe(_ context.Context, _ *http.Request) error {
	client, err := newSupabaseHealthClient()
	if err != nil {
		return err
	}

	if client.Storage == nil {
		return fmt.Errorf("storage client is not initialized")
	}

	if _, err := client.Storage.ListFiles("satellite-images", "", storage.FileSearchOptions{Limit: 1}); err != nil {
		return fmt.Errorf("list files in satellite-images: %w", err)
	}

	return nil
}

func newSupabaseHealthClient() (*supabase.Client, error) {
	supabaseURL := strings.TrimSpace(os.Getenv("SUPABASE_URL"))
	if supabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL is not set")
	}

	serviceRoleKey := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	if serviceRoleKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_ROLE_KEY is not set")
	}

	client, err := supabase.NewClient(supabaseURL, serviceRoleKey, nil)
	if err != nil {
		return nil, fmt.Errorf("initialize Supabase client: %w", err)
	}

	return client, nil
}
