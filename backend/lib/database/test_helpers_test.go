// Package database provides shared helpers for live database integration tests.
package database

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Hammadullah2/Roadlytics/backend/lib/config"
)

func loadDatabaseTestEnv(t *testing.T) {
	t.Helper()

	loadEnvFileForTests(t, filepath.Join("..", "..", ".env"))
}

func newLiveDatabaseConfig(t *testing.T) *config.Config {
	t.Helper()

	loadDatabaseTestEnv(t)

	return &config.Config{
		DatabaseURL:            requireLiveEnv(t, "DATABASE_URL"),
		SupabaseURL:            requireLiveEnv(t, "SUPABASE_URL"),
		SupabaseServiceRoleKey: requireLiveEnv(t, "SUPABASE_SERVICE_ROLE_KEY"),
		SupabaseJWTSecret:      requireLiveEnv(t, "SUPABASE_JWT_SECRET"),
		InternalSecret:         requireLiveEnv(t, "INTERNAL_SECRET"),
		Port:                   "8080",
	}
}

func requireLiveEnv(t *testing.T, key string) string {
	t.Helper()

	value := strings.TrimSpace(os.Getenv(key))
	if value == "" || looksLikePlaceholder(value) {
		t.Skipf("%s is not configured for live integration tests", key)
	}

	return value
}

func looksLikePlaceholder(value string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	return strings.Contains(trimmed, "your_") || strings.HasSuffix(trimmed, "_here")
}

func loadEnvFileForTests(t *testing.T, path string) {
	t.Helper()

	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" {
			continue
		}

		if existing := os.Getenv(key); existing != "" {
			continue
		}

		if err := os.Setenv(key, value); err != nil {
			t.Fatalf("set %s from %s: %v", key, path, err)
		}
	}

	if err := scanner.Err(); err != nil {
		t.Fatalf("scan %s: %v", path, err)
	}
}
