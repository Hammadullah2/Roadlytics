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

	"github.com/Hammadullah2/Roadlytics/backend/lib/config"
	"github.com/Hammadullah2/Roadlytics/backend/lib/database"
	"github.com/Hammadullah2/Roadlytics/backend/lib/dispatch"
	"github.com/Hammadullah2/Roadlytics/backend/lib/handler"
	"github.com/Hammadullah2/Roadlytics/backend/lib/middleware"
	"github.com/Hammadullah2/Roadlytics/backend/lib/modelclient"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository/postgres"
	"github.com/Hammadullah2/Roadlytics/backend/lib/router"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/adminsvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/evaluationsvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/ingestionsvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/progresssvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/reportsvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/usersvc"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/logger"
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

	userRepo    := postgres.NewUserRepository(pool)
	projectRepo := postgres.NewProjectRepository(pool)
	regionRepo  := postgres.NewRegionRepository(pool)
	jobRepo     := postgres.NewJobRepository(pool)
	reportRepo  := postgres.NewReportRepository(pool)
	adminRepo   := postgres.NewAdminRepository(pool)

	authMiddleware, err := middleware.NewAuthMiddleware(cfg, userRepo)
	if err != nil {
		log.Error("failed to initialize auth middleware", "error", err)
		os.Exit(1)
	}

	userService      := usersvc.New(userRepo)
	adminService     := adminsvc.New(adminRepo)
	ingestionService := ingestionsvc.New(projectRepo, regionRepo, jobRepo, storageClient)
	progressService  := progresssvc.New(jobRepo)
	evaluationService := evaluationsvc.New(jobRepo)
	var mlClient *modelclient.Client
	if cfg.InferenceServerURL != "" {
		mlClient = modelclient.New(cfg.InferenceServerURL)
		log.Info("inference server configured", "url", cfg.InferenceServerURL)

		go func(c *modelclient.Client) {
			probeCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			health, err := c.HealthCheck(probeCtx)
			if err != nil {
				log.Warn("inference server health probe failed at startup",
					"url", c.BaseURL(), "error", err)
				return
			}
			log.Info("inference server reachable",
				"url", c.BaseURL(), "status", health.Status, "device", health.Device)
		}(mlClient)
	} else {
		log.Warn("INFERENCE_SERVER_URL not set — jobs will be created but not dispatched")
	}

	reportService    := reportsvc.New(reportRepo, jobRepo, storageClient, mlClient)

	dispatcher := dispatch.New(jobRepo, regionRepo, mlClient, log)

	// Build the direct upload URL the frontend POSTs GeoTIFFs to.
	// Files go to the VPS inference server directly, bypassing Vercel's 4.5 MB limit.
	inferenceUploadURL := ""
	if mlClient != nil {
		inferenceUploadURL = mlClient.BaseURL() + "/api/jobs/upload-and-run"
	}

	handlers := router.Handlers{
		Auth:     handler.NewAuthHandler(userService),
		Admin:    handler.NewAdminHandler(userService, adminService),
		Project:  handler.NewProjectHandler(ingestionService),
		Region:   handler.NewRegionHandler(ingestionService),
		Job:      handler.NewJobHandler(ingestionService, progressService, dispatcher, inferenceUploadURL),
		Result:   handler.NewResultHandler(evaluationService, progressService, mlClient, cfg.PlanetAPIKey),
		Report:   handler.NewReportHandler(reportService),
		Upload:   handler.NewUploadHandler(ingestionService),
		Health:   handler.NewHealthHandler(pool, handler.WithInferenceClient(mlClient)),
		Callback: handler.NewCallbackHandler(jobRepo),
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

	serverErrCh := make(chan error, 1)
	go func() {
		log.Info("server listening", "addr", listener.Addr().String())
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErrCh <- err
		}
	}()

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

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("failed to shutdown server", "error", err)
	}

	log.Info("server stopped")
}
