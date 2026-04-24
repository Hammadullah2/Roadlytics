// Package config loads backend settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

// Config holds the environment-backed settings required for Supabase integration.
type Config struct {
	DatabaseURL            string
	SupabaseURL            string
	SupabaseAnonKey        string
	SupabaseServiceRoleKey string
	SupabaseJWTSecret      string
	InternalSecret         string
	FrontendURL            string
	Port                   string

	InferenceServerURL string
	PlanetAPIKey       string

	// Compatibility fields used by the current bootstrap path.
	ServerPort string
	ServerEnv  string
}

// Load reads backend configuration from environment variables populated by .env.
func Load() (*Config, error) {
	if err := loadEnvFile(); err != nil {
		return nil, err
	}

	databaseURL, err := requiredEnv("DATABASE_URL")
	if err != nil {
		return nil, err
	}

	supabaseURL, err := requiredEnv("SUPABASE_URL")
	if err != nil {
		return nil, err
	}

	supabaseAnonKey, err := requiredEnv("SUPABASE_ANON_KEY")
	if err != nil {
		return nil, err
	}

	supabaseServiceRoleKey, err := requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
	if err != nil {
		return nil, err
	}

	supabaseJWTSecret, err := requiredEnv("SUPABASE_JWT_SECRET")
	if err != nil {
		return nil, err
	}

	internalSecret, err := requiredEnv("INTERNAL_SECRET")
	if err != nil {
		return nil, err
	}

	port, err := requiredEitherEnv("PORT", "SERVER_PORT")
	if err != nil {
		return nil, err
	}

	return &Config{
		DatabaseURL:            databaseURL,
		SupabaseURL:            supabaseURL,
		SupabaseAnonKey:        supabaseAnonKey,
		SupabaseServiceRoleKey: supabaseServiceRoleKey,
		SupabaseJWTSecret:      supabaseJWTSecret,
		InternalSecret:         internalSecret,
		FrontendURL:            optionalEnv("FRONTEND_URL", ""),
		InferenceServerURL:     optionalEnv("INFERENCE_SERVER_URL", ""),
		PlanetAPIKey:           optionalEnv("PLANET_API_KEY", ""),
		Port:                   port,
		ServerPort:             port,
		ServerEnv:              optionalEnv("SERVER_ENV", "development"),
	}, nil
}

func loadEnvFile() error {
	for _, path := range []string{"backend/.env", ".env"} {
		if err := godotenv.Load(path); err == nil {
			return nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("load %s: %w", path, err)
		}
	}

	return nil
}

func requiredEnv(key string) (string, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return "", fmt.Errorf("required environment variable %s is not set", key)
	}

	return value, nil
}

func requiredEitherEnv(keys ...string) (string, error) {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value, nil
		}
	}

	return "", fmt.Errorf("required environment variable %s is not set", strings.Join(keys, " or "))
}

func optionalEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}

	return fallback
}
