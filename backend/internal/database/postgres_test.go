// Package database tests PostgreSQL pool connectivity and failure handling.
package database

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/config"
)

func TestNewPostgresPool_ConnectsToSupabasePostgres(t *testing.T) {
	cfg := newLiveDatabaseConfig(t)

	pool, err := NewPostgresPool(cfg)
	if err != nil {
		t.Fatalf("NewPostgresPool() error = %v", err)
	}
	t.Cleanup(pool.Close)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var value int
	if err := pool.QueryRow(ctx, "SELECT 1").Scan(&value); err != nil {
		t.Fatalf("QueryRow(SELECT 1) error = %v", err)
	}

	if value != 1 {
		t.Fatalf("QueryRow(SELECT 1) = %d, want 1", value)
	}
}

func TestNewPostgresPool_FailsGracefullyWithWrongDatabaseURL(t *testing.T) {
	cfg := &config.Config{
		DatabaseURL: "postgresql://invalid::url",
	}

	if _, err := NewPostgresPool(cfg); err == nil {
		t.Fatal("NewPostgresPool() error = nil, want non-nil")
	}
}

func TestConnect_ContextCancellationClosesConnectionCleanly(t *testing.T) {
	cfg := newLiveDatabaseConfig(t)

	ctx, cancel := context.WithCancel(context.Background())
	pool, err := Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Fatalf("Connect() error = %v", err)
	}

	cancel()

	if err := pool.Ping(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("Ping(cancelled context) error = %v, want context.Canceled", err)
	}

	closed := make(chan struct{})
	go func() {
		defer close(closed)
		pool.Close()
	}()

	select {
	case <-closed:
	case <-time.After(2 * time.Second):
		t.Fatal("pool.Close() did not return before timeout")
	}
}
