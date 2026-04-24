// Package handler is the Vercel serverless entry point for the backend API.
// Vercel's @vercel/go runtime discovers this file via the api/ directory
// convention and wraps Handler as a serverless function.
//
// Initialization (DB pool, service wiring) runs once per cold start using
// sync.Once; subsequent warm invocations reuse the same in-process state.
// There are intentionally no background goroutines — all operations are
// synchronous and scoped to the incoming request.
package handler

import (
	"context"
	"log/slog"
	"net/http"
	"sync"
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

var (
	initOnce  sync.Once
	appRouter http.Handler
	initErr   error
)

// Handler is the single Vercel serverless function entry point.
// All API routes are handled here via the chi router.
func Handler(w http.ResponseWriter, r *http.Request) {
	initOnce.Do(func() {
		appRouter, initErr = buildRouter()
	})

	if initErr != nil {
		http.Error(w, "server initialization failed: "+initErr.Error(), http.StatusInternalServerError)
		return
	}

	appRouter.ServeHTTP(w, r)
}

func buildRouter() (http.Handler, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}

	log := logger.New(cfg.ServerEnv)

	pool, err := database.NewPostgresPool(cfg)
	if err != nil {
		return nil, err
	}

	storageClient, err := database.NewStorageClient(cfg)
	if err != nil {
		return nil, err
	}

	userRepo := postgres.NewUserRepository(pool)
	projectRepo := postgres.NewProjectRepository(pool)
	regionRepo := postgres.NewRegionRepository(pool)
	jobRepo := postgres.NewJobRepository(pool)
	reportRepo := postgres.NewReportRepository(pool)
	adminRepo := postgres.NewAdminRepository(pool)

	authMiddleware, err := middleware.NewAuthMiddleware(cfg, userRepo)
	if err != nil {
		return nil, err
	}

	userService := usersvc.New(userRepo)
	adminService := adminsvc.New(adminRepo)
	ingestionService := ingestionsvc.New(projectRepo, regionRepo, jobRepo, storageClient)
	progressService := progresssvc.New(jobRepo)
	evaluationService := evaluationsvc.New(jobRepo)
	var mlClient *modelclient.Client
	if cfg.InferenceServerURL != "" {
		mlClient = modelclient.New(cfg.InferenceServerURL)
		// Non-blocking startup probe — surface misconfiguration in logs without
		// delaying the first request.
		go func(c *modelclient.Client) {
			probeCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			if health, err := c.HealthCheck(probeCtx); err != nil {
				slog.Warn("inference server health probe failed", "url", c.BaseURL(), "error", err)
			} else {
				slog.Info("inference server reachable",
					"url", c.BaseURL(), "status", health.Status, "device", health.Device)
			}
		}(mlClient)
	} else {
		log.Warn("INFERENCE_SERVER_URL not set — jobs will be created but not dispatched")
	}

	reportService := reportsvc.New(reportRepo, jobRepo, storageClient, mlClient)

	dispatcher := dispatch.New(jobRepo, regionRepo, mlClient, log)

	inferenceUploadURL := ""
	if cfg.InferenceServerURL != "" {
		inferenceUploadURL = cfg.InferenceServerURL + "/api/jobs/upload-and-run"
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

	return router.New(cfg, authMiddleware, handlers), nil
}
