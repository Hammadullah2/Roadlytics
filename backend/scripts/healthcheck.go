// Package main provides a standalone healthcheck utility for backend dependencies.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	storage "github.com/supabase-community/storage-go"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/config"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/database"
)

type namedCheck struct {
	name string
	run  func(context.Context, *config.Config) error
}

type healthEndpointResponse struct {
	Status string            `json:"status"`
	Checks map[string]string `json:"checks"`
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("FAIL load configuration: %v\n", err)
		os.Exit(1)
	}

	checks := []namedCheck{
		{name: "PostgreSQL connection", run: checkPostgres},
		{name: "Supabase client", run: checkSupabase},
		{name: "Supabase Storage", run: checkStorage},
		{name: "JWT validation", run: checkJWT},
		{name: "WebSocket server", run: checkWebSocketServer},
	}

	passed := 0
	for _, check := range checks {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		err := check.run(ctx, cfg)
		cancel()

		if err != nil {
			fmt.Printf("FAIL %s: %v\n", check.name, err)
			continue
		}

		passed++
		fmt.Printf("PASS %s\n", check.name)
	}

	fmt.Printf("Summary: %d/%d checks passed\n", passed, len(checks))
	if passed != len(checks) {
		os.Exit(1)
	}
}

func checkPostgres(ctx context.Context, cfg *config.Config) error {
	pool, err := database.NewPostgresPool(cfg)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		return err
	}

	return nil
}

func checkSupabase(_ context.Context, cfg *config.Config) error {
	client, err := database.NewSupabaseClient(cfg)
	if err != nil {
		return err
	}

	if _, _, err := client.From("profiles").Select("id", "exact", false).Limit(1, "").Execute(); err != nil {
		return fmt.Errorf("query profiles table: %w", err)
	}

	return nil
}

func checkStorage(_ context.Context, cfg *config.Config) error {
	client, err := database.NewSupabaseClient(cfg)
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

func checkJWT(_ context.Context, cfg *config.Config) error {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   "healthcheck-user",
		"email": "healthcheck@example.com",
		"role":  "user",
		"exp":   time.Now().Add(5 * time.Minute).Unix(),
	})

	signedToken, err := token.SignedString([]byte(cfg.SupabaseJWTSecret))
	if err != nil {
		return fmt.Errorf("sign test token: %w", err)
	}

	parsedToken, err := jwt.Parse(signedToken, func(token *jwt.Token) (any, error) {
		return []byte(cfg.SupabaseJWTSecret), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return fmt.Errorf("parse signed token: %w", err)
	}

	if !parsedToken.Valid {
		return fmt.Errorf("parsed token is invalid")
	}

	return nil
}

func checkWebSocketServer(ctx context.Context, cfg *config.Config) error {
	baseURL := "http://localhost:" + strings.TrimSpace(cfg.Port)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/health", nil)
	if err != nil {
		return fmt.Errorf("create health request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("call health endpoint: %w", err)
	}
	defer resp.Body.Close()

	var payload healthEndpointResponse
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return fmt.Errorf("decode health response: %w", err)
	}

	if payload.Checks["websocket_hub"] != "running" {
		return fmt.Errorf("websocket_hub check = %q", payload.Checks["websocket_hub"])
	}

	return nil
}
