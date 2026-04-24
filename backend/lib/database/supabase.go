// Package database initializes backend database clients from application config.
package database

import (
	"fmt"

	"github.com/Hammadullah2/Roadlytics/backend/lib/config"
	supabase "github.com/supabase-community/supabase-go"
)

// NewSupabaseClient creates the backend Supabase client from application config.
func NewSupabaseClient(cfg *config.Config) (*supabase.Client, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is required")
	}

	if cfg.SupabaseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL is required")
	}

	if cfg.SupabaseServiceRoleKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_ROLE_KEY is required")
	}

	client, err := supabase.NewClient(cfg.SupabaseURL, cfg.SupabaseServiceRoleKey, nil)
	if err != nil {
		return nil, fmt.Errorf("initialize Supabase client: %w", err)
	}

	return client, nil
}
