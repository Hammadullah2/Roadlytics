package config

import (
	"os"
	"testing"
)

func TestLoadUsesProcessEnvironmentWhenNoEnvFileExists(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://postgres:test@localhost:5432/postgres")
	t.Setenv("SUPABASE_URL", "https://example.supabase.co")
	t.Setenv("SUPABASE_ANON_KEY", "anon-key")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key")
	t.Setenv("SUPABASE_JWT_SECRET", "jwt-secret")
	t.Setenv("INTERNAL_SECRET", "internal-secret")
	t.Setenv("PORT", "8080")

	workingDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempDir := t.TempDir()
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("Chdir(%s) error = %v", tempDir, err)
	}
	t.Cleanup(func() {
		if chdirErr := os.Chdir(workingDir); chdirErr != nil {
			t.Fatalf("restore working directory error = %v", chdirErr)
		}
	})

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.DatabaseURL != "postgresql://postgres:test@localhost:5432/postgres" {
		t.Fatalf("cfg.DatabaseURL = %q", cfg.DatabaseURL)
	}

	if cfg.SupabaseURL != "https://example.supabase.co" {
		t.Fatalf("cfg.SupabaseURL = %q", cfg.SupabaseURL)
	}

	if cfg.Port != "8080" {
		t.Fatalf("cfg.Port = %q", cfg.Port)
	}
}
