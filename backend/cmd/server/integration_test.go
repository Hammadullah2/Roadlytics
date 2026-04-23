// Package main contains live integration tests for the HTTP server bootstrap.
package main

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	gorillaws "github.com/gorilla/websocket"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/config"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/database"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/handler"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/orchestrator"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository/postgres"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/router"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/evaluationsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/ingestionsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/progresssvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/reportsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/usersvc"
	jobws "github.com/murtazatunio/road-quality-assessment/backend/internal/websocket"
)

func TestServerIntegration(t *testing.T) {
	loadServerTestEnv(t)

	requiredKeys := []string{
		"DATABASE_URL",
		"SUPABASE_URL",
		"SUPABASE_SERVICE_ROLE_KEY",
		"SUPABASE_JWT_SECRET",
		"INTERNAL_SECRET",
		"INTEGRATION_TEST_AUTH_USER_ID",
		"INTEGRATION_TEST_AUTH_USER_EMAIL",
		"INTEGRATION_TEST_JOB_ID",
	}

	for _, key := range requiredKeys {
		if value := strings.TrimSpace(os.Getenv(key)); value == "" || looksLikeIntegrationPlaceholder(value) {
			t.Skipf("%s is not configured for live integration tests", key)
		}
	}

	cfg := &config.Config{
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		SupabaseURL:            os.Getenv("SUPABASE_URL"),
		SupabaseServiceRoleKey: os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		SupabaseJWTSecret:      os.Getenv("SUPABASE_JWT_SECRET"),
		InternalSecret:         os.Getenv("INTERNAL_SECRET"),
		FrontendURL:            "http://127.0.0.1",
		Port:                   "8080",
		ServerEnv:              "test",
	}

	pool, err := database.NewPostgresPool(cfg)
	if err != nil {
		t.Fatalf("NewPostgresPool() error = %v", err)
	}
	t.Cleanup(pool.Close)

	storageClient, err := database.NewStorageClient(cfg)
	if err != nil {
		t.Fatalf("NewStorageClient() error = %v", err)
	}

	userRepo := postgres.NewUserRepository(pool)
	projectRepo := postgres.NewProjectRepository(pool)
	regionRepo := postgres.NewRegionRepository(pool)
	jobRepo := postgres.NewJobRepository(pool)
	resultRepo := postgres.NewResultRepository(pool)
	reportRepo := postgres.NewReportRepository(pool)

	authMiddleware, err := middleware.NewAuthMiddleware(cfg, userRepo)
	if err != nil {
		t.Fatalf("NewAuthMiddleware() error = %v", err)
	}

	userService := usersvc.New(userRepo)
	ingestionService := ingestionsvc.New(projectRepo, regionRepo, jobRepo, storageClient)
	progressService := progresssvc.New(jobRepo)
	evaluationService := evaluationsvc.New(resultRepo)
	reportService := reportsvc.New(reportRepo, jobRepo, storageClient)

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	hub := jobws.NewHub(logger)
	go hub.Run()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	orch := orchestrator.New(jobRepo, regionRepo, hub, logger, nil, "")
	orch.Start(ctx)
	t.Cleanup(orch.Shutdown)

	httpRouter := router.New(cfg, authMiddleware, router.Handlers{
		Auth:      handler.NewAuthHandler(userService),
		Admin:     handler.NewAdminHandler(userService),
		Project:   handler.NewProjectHandler(ingestionService),
		Region:    handler.NewRegionHandler(ingestionService),
		Job:       handler.NewJobHandler(ingestionService, progressService),
		Result:    handler.NewResultHandler(evaluationService, progressService, nil, ""),
		Report:    handler.NewReportHandler(reportService),
		Upload:    handler.NewUploadHandler(ingestionService),
		Health:    handler.NewHealthHandler(pool),
		WebSocket: handler.NewWebSocketHandler(cfg, hub, progressService),
		Callback:  handler.NewCallbackHandler(orch),
	})

	server := httptest.NewServer(httpRouter)
	defer server.Close()

	testUserID := os.Getenv("INTEGRATION_TEST_AUTH_USER_ID")
	testUserEmail := os.Getenv("INTEGRATION_TEST_AUTH_USER_EMAIL")
	jobID := os.Getenv("INTEGRATION_TEST_JOB_ID")
	testToken := signedIntegrationToken(t, cfg.SupabaseJWTSecret, testUserID, testUserEmail, models.RoleUser)

	if _, err := pool.Exec(context.Background(), `DELETE FROM public.profiles WHERE id = $1`, testUserID); err != nil {
		t.Fatalf("DELETE profile setup error = %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM public.profiles WHERE id = $1`, testUserID)
	})

	t.Run("register profile", func(t *testing.T) {
		body := bytes.NewBufferString(`{"name":"Integration Test User","email":"` + testUserEmail + `"}`)
		req, err := http.NewRequest(http.MethodPost, server.URL+"/auth/register", body)
		if err != nil {
			t.Fatalf("NewRequest() error = %v", err)
		}
		req.Header.Set("Authorization", "Bearer "+testToken)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Do() error = %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusCreated)
		}
	})

	t.Run("get profile", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodGet, server.URL+"/auth/profile", nil)
		if err != nil {
			t.Fatalf("NewRequest() error = %v", err)
		}
		req.Header.Set("Authorization", "Bearer "+testToken)

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Do() error = %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
		}
	})

	t.Run("health", func(t *testing.T) {
		resp, err := http.Get(server.URL + "/health")
		if err != nil {
			t.Fatalf("Get() error = %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
		}
	})

	t.Run("websocket connect", func(t *testing.T) {
		websocketURL := "ws" + strings.TrimPrefix(server.URL, "http") + "/ws/jobs/" + jobID + "?token=" + testToken
		conn, _, err := gorillaws.DefaultDialer.Dial(websocketURL, nil)
		if err != nil {
			t.Fatalf("Dial() error = %v", err)
		}
		defer conn.Close()

		if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
			t.Fatalf("SetReadDeadline() error = %v", err)
		}

		if _, _, err := conn.ReadMessage(); err != nil {
			t.Fatalf("ReadMessage() error = %v", err)
		}
	})

	t.Run("internal progress callback", func(t *testing.T) {
		req, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/internal/jobs/"+jobID+"/progress",
			bytes.NewBufferString(`{"progress":1,"stage":"segmentation","status":"pending"}`),
		)
		if err != nil {
			t.Fatalf("NewRequest() error = %v", err)
		}

		req.Header.Set("X-Internal-Secret", cfg.InternalSecret)
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("Do() error = %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusAccepted {
			t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusAccepted)
		}
	})
}

func loadServerTestEnv(t *testing.T) {
	t.Helper()

	loadFileIntoEnv(t, filepath.Join("..", "..", ".env"))
}

func loadFileIntoEnv(t *testing.T, path string) {
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
		if !found || strings.TrimSpace(key) == "" {
			continue
		}

		if os.Getenv(strings.TrimSpace(key)) != "" {
			continue
		}

		if err := os.Setenv(strings.TrimSpace(key), strings.TrimSpace(value)); err != nil {
			t.Fatalf("Setenv(%s) error = %v", key, err)
		}
	}

	if err := scanner.Err(); err != nil {
		t.Fatalf("Scan(%s) error = %v", path, err)
	}
}

func looksLikeIntegrationPlaceholder(value string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	return strings.Contains(trimmed, "your_") || strings.HasSuffix(trimmed, "_here")
}

func signedIntegrationToken(t *testing.T, secret, userID, email, role string) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   userID,
		"email": email,
		"role":  role,
		"exp":   time.Now().Add(time.Hour).Unix(),
		"iat":   time.Now().Unix(),
	})

	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}

	return signed
}
