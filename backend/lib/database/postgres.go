// Package database initializes backend database clients from application config.
package database

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/Hammadullah2/Roadlytics/backend/lib/config"
)

// NewPostgresPool creates the backend PostgreSQL pool from application config.
func NewPostgresPool(cfg *config.Config) (*pgxpool.Pool, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is required")
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("initialize PostgreSQL pool: %w", err)
	}

	return pool, nil
}
