// Package main bootstraps the backend HTTP server and infrastructure dependencies.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/config"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/database"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/handler"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/modelclient"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/orchestrator"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository/postgres"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/router"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/adminsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/evaluationsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/ingestionsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/progresssvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/reportsvc"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/usersvc"
	jobws "github.com/murtazatunio/road-quality-assessment/backend/internal/websocket"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/logger"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	log := logger.New(cfg.ServerEnv)

	pool, err := database.NewPostgresPool(cfg)
	if err != nil {
		log.Error("failed to initialize postgres pool", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	storageClient, err := database.NewStorageClient(cfg)
	if err != nil {
		log.Error("failed to initialize storage client", "error", err)
		os.Exit(1)
	}

	userRepo := postgres.NewUserRepository(pool)
	projectRepo := postgres.NewProjectRepository(pool)
	regionRepo := postgres.NewRegionRepository(pool)
	jobRepo := postgres.NewJobRepository(pool)
	resultRepo := postgres.NewResultRepository(pool)
	reportRepo := postgres.NewReportRepository(pool)
	adminRepo := postgres.NewAdminRepository(pool)

	authMiddleware, err := middleware.NewAuthMiddleware(cfg, userRepo)
	if err != nil {
		log.Error("failed to initialize auth middleware", "error", err)
		os.Exit(1)
	}

	userService := usersvc.New(userRepo)
	adminService := adminsvc.New(adminRepo)
	ingestionService := ingestionsvc.New(projectRepo, regionRepo, jobRepo, storageClient)
	progressService := progresssvc.New(jobRepo)
	evaluationService := evaluationsvc.New(resultRepo)
	reportService := reportsvc.New(reportRepo, jobRepo, storageClient)
	hub := jobws.NewHub(log)
	go hub.Run()

	var mlClient *modelclient.Client
	if cfg.InferenceServerURL != "" {
		mlClient = modelclient.New(cfg.InferenceServerURL)
		log.Info("inference server configured", "url", cfg.InferenceServerURL)

		// Non-blocking startup probe — surface misconfiguration early without
		// coupling backend readiness to the inference server being up.
		go func(c *modelclient.Client) {
			probeCtx, cancelProbe := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancelProbe()

			health, err := c.HealthCheck(probeCtx)
			if err != nil {
				log.Warn("inference server health probe failed at startup — backend will still serve and retry per-job",
					"url", c.BaseURL(), "error", err)
				return
			}

			log.Info("inference server reachable", "url", c.BaseURL(), "status", health.Status, "device", health.Device)
		}(mlClient)
	} else {
		log.Warn("INFERENCE_SERVER_URL not set — jobs will be marked running without actual dispatch")
	}

	orch := orchestrator.New(jobRepo, regionRepo, hub, log, mlClient, cfg.PlanetAPIKey)

	handlers := router.Handlers{
		Auth:      handler.NewAuthHandler(userService),
		Admin:     handler.NewAdminHandler(userService, adminService),
		Project:   handler.NewProjectHandler(ingestionService),
		Region:    handler.NewRegionHandler(ingestionService),
		Job:       handler.NewJobHandler(ingestionService, progressService),
		Result:    handler.NewResultHandler(evaluationService, progressService, mlClient, cfg.PlanetAPIKey),
		Report:    handler.NewReportHandler(reportService),
		Upload:    handler.NewUploadHandler(ingestionService),
		Health:    handler.NewHealthHandler(pool, handler.WithInferenceClient(mlClient)),
		WebSocket: handler.NewWebSocketHandler(cfg, hub, progressService),
		Callback:  handler.NewCallbackHandler(orch),
	}

	httpRouter := router.New(cfg, authMiddleware, handlers)
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      httpRouter,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		log.Error("failed to bind server port", "addr", server.Addr, "error", err)
		os.Exit(1)
	}

	appCtx, cancelApp := context.WithCancel(context.Background())
	defer cancelApp()

	serverErrCh := make(chan error, 1)
	go func() {
		log.Info("server listening", "addr", listener.Addr().String())
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrCh <- err
		}
	}()

	orch.Start(appCtx)
	log.Info("orchestrator started")

	signalCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	select {
	case <-signalCtx.Done():
		log.Info("shutdown signal received")
	case err := <-serverErrCh:
		if err != nil {
			log.Error("server stopped unexpectedly", "error", err)
		}
	}

	cancelApp()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("failed to shutdown server", "error", err)
	}

	orch.Shutdown()
	log.Info("server stopped")
}
