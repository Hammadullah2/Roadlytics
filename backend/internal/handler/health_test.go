// Package handler tests the backend health endpoint response behavior.
package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestHealthHandler_GetReturnsOKWhenAllChecksPass(t *testing.T) {
	fixedTime := time.Date(2026, time.April, 15, 8, 30, 0, 0, time.UTC)
	handler := NewHealthHandler(
		fakeDBPinger{},
		WithSupabaseHealthProbe(func(context.Context, *http.Request) error { return nil }),
		WithStorageHealthProbe(func(context.Context, *http.Request) error { return nil }),
		WithWebSocketHealthProbe(func(context.Context, *http.Request) error { return nil }),
		WithOrchestratorHealthProbe(func(context.Context, *http.Request) error { return nil }),
		WithHealthNow(func() time.Time { return fixedTime }),
	)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()

	handler.Get(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	var payload healthResponse
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	if payload.Status != "ok" {
		t.Fatalf("payload.Status = %q, want %q", payload.Status, "ok")
	}

	if payload.Checks["database"] != "connected" {
		t.Fatalf("database check = %q, want %q", payload.Checks["database"], "connected")
	}

	if payload.Checks["supabase"] != "connected" {
		t.Fatalf("supabase check = %q, want %q", payload.Checks["supabase"], "connected")
	}

	if payload.Checks["storage"] != "connected" {
		t.Fatalf("storage check = %q, want %q", payload.Checks["storage"], "connected")
	}

	if payload.Checks["websocket_hub"] != "running" {
		t.Fatalf("websocket_hub check = %q, want %q", payload.Checks["websocket_hub"], "running")
	}

	if payload.Checks["orchestrator"] != "running" {
		t.Fatalf("orchestrator check = %q, want %q", payload.Checks["orchestrator"], "running")
	}

	if payload.Version != healthHandlerVersion {
		t.Fatalf("payload.Version = %q, want %q", payload.Version, healthHandlerVersion)
	}

	if payload.Timestamp != fixedTime.Format(time.RFC3339) {
		t.Fatalf("payload.Timestamp = %q, want %q", payload.Timestamp, fixedTime.Format(time.RFC3339))
	}
}

func TestHealthHandler_GetReturnsErrorWhenDatabaseIsDown(t *testing.T) {
	handler := NewHealthHandler(
		fakeDBPinger{err: errors.New("db down")},
		WithSupabaseHealthProbe(func(context.Context, *http.Request) error { return nil }),
		WithStorageHealthProbe(func(context.Context, *http.Request) error { return nil }),
		WithWebSocketHealthProbe(func(context.Context, *http.Request) error { return nil }),
		WithOrchestratorHealthProbe(func(context.Context, *http.Request) error { return nil }),
	)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	recorder := httptest.NewRecorder()

	handler.Get(recorder, req)

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}

	var payload healthResponse
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	if payload.Status != "error" {
		t.Fatalf("payload.Status = %q, want %q", payload.Status, "error")
	}

	if payload.Checks["database"] != "disconnected" {
		t.Fatalf("database check = %q, want %q", payload.Checks["database"], "disconnected")
	}
}

type fakeDBPinger struct {
	err error
}

func (f fakeDBPinger) Ping(context.Context) error {
	return f.err
}
