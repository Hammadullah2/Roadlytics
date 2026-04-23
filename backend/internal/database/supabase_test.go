// Package database tests Supabase client initialization and query behavior.
package database

import "testing"

func TestNewSupabaseClient_InitializesSuccessfully(t *testing.T) {
	cfg := newLiveDatabaseConfig(t)

	client, err := NewSupabaseClient(cfg)
	if err != nil {
		t.Fatalf("NewSupabaseClient() error = %v", err)
	}

	if _, _, err := client.From("profiles").Select("id", "exact", false).Limit(1, "").Execute(); err != nil {
		t.Fatalf("profiles probe query error = %v", err)
	}
}

func TestNewSupabaseClient_FailsGracefullyWithWrongCredentials(t *testing.T) {
	cfg := newLiveDatabaseConfig(t)
	cfg.SupabaseServiceRoleKey = "invalid-service-role-key"

	client, err := NewSupabaseClient(cfg)
	if err != nil {
		t.Fatalf("NewSupabaseClient() initialization error = %v", err)
	}

	if _, _, err := client.From("profiles").Select("id", "exact", false).Limit(1, "").Execute(); err == nil {
		t.Fatal("profiles probe query error = nil, want non-nil")
	}
}
