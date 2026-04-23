// Package router wires HTTP handlers and middleware into the backend API router.
package router

import (
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/config"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/handler"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
)

// Handlers groups all handler instances for route registration.
type Handlers struct {
	Auth      *handler.AuthHandler
	Admin     *handler.AdminHandler
	Project   *handler.ProjectHandler
	Region    *handler.RegionHandler
	Job       *handler.JobHandler
	Result    *handler.ResultHandler
	Report    *handler.ReportHandler
	Upload    *handler.UploadHandler
	Health    *handler.HealthHandler
	WebSocket *handler.WebSocketHandler
	Callback  *handler.CallbackHandler
}

// New creates the backend API router with middleware and route groups configured.
func New(cfg *config.Config, auth *middleware.AuthMiddleware, h Handlers) *chi.Mux {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(middleware.CORS(cfg.FrontendURL))

	mountAPIRoutes(r, cfg, auth, h)
	r.Route("/api/v1", func(r chi.Router) {
		mountAPIRoutes(r, cfg, auth, h)
	})

	return r
}

func mountAPIRoutes(r chi.Router, cfg *config.Config, auth *middleware.AuthMiddleware, h Handlers) {
	r.Get("/health", h.Health.Get)
	r.Get("/satellite/tiles/{scene_id}/{z}/{x}/{y}", h.Result.GetSatelliteTile)

	r.Group(func(r chi.Router) {
		r.Use(middleware.InternalSecret(cfg.InternalSecret))

		r.Route("/internal", func(r chi.Router) {
			r.Post("/jobs/{id}/progress", h.Callback.UpdateJobProgress)
		})
	})

	r.Group(func(r chi.Router) {
		r.Use(auth.RequireAuth())

		r.Get("/ws/jobs/{id}", h.WebSocket.Connect)

		r.Route("/auth", func(r chi.Router) {
			r.Post("/register", h.Auth.Register)
			r.Get("/profile", h.Auth.GetProfile)
			r.Post("/profile", h.Auth.GetProfile)
			r.With(middleware.RequireApproved(auth)).Patch("/profile", h.Auth.UpdateProfile)
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireAdmin(auth))

			r.Route("/admin", func(r chi.Router) {
				r.Get("/overview", h.Admin.GetOverview)
				r.Get("/users/pending", h.Admin.ListPendingUsers)
				r.Get("/users", h.Admin.ListUsers)
				r.Post("/users/{id}/approve", h.Admin.ApproveUser)
				r.Post("/users/{id}/reject", h.Admin.RejectUser)
				r.Get("/projects", h.Admin.ListProjects)
				r.Delete("/projects/{id}", h.Admin.DeleteProject)
				r.Get("/jobs", h.Admin.ListJobs)
				r.Get("/logs", h.Admin.ListLogs)
				r.Get("/system", h.Admin.GetSystem)
				r.Get("/settings", h.Admin.GetSettings)
				r.Put("/settings", h.Admin.UpdateSettings)
			})
		})

		r.Group(func(r chi.Router) {
			r.Use(middleware.RequireApproved(auth))

			r.Post("/projects", h.Project.Create)
			r.Get("/projects", h.Project.List)
			r.Get("/projects/{id}", h.Project.Get)
			r.Patch("/projects/{id}", h.Project.Update)
			r.Put("/projects/{id}", h.Project.Update)
			r.Delete("/projects/{id}", h.Project.Delete)

			r.Post("/projects/{id}/regions", h.Region.Create)
			r.Get("/projects/{id}/regions", h.Region.List)
			r.Get("/projects/{id}/regions/{rid}", h.Region.Get)
			r.Delete("/projects/{id}/regions/{rid}", h.Region.Delete)
			r.Get("/regions/{id}", h.Region.GetByID)
			r.Delete("/regions/{id}", h.Region.DeleteByID)

			r.Post("/jobs", h.Job.Create)
			r.Post("/regions/{id}/jobs", h.Job.CreateForRegion)
			r.Get("/jobs/{id}", h.Job.Get)
			r.Get("/jobs/{id}/status", h.Job.GetStatus)
			r.Get("/jobs/{id}/progress", h.Job.GetProgress)
			r.Get("/regions/{id}/jobs", h.Job.ListByRegion)

			r.Get("/jobs/{id}/results", h.Result.GetAll)
			r.Get("/jobs/{id}/results/segmentation", h.Result.GetSegmentation)
			r.Get("/jobs/{id}/results/classification", h.Result.GetClassification)
			r.Get("/jobs/{id}/results/connectivity", h.Result.GetConnectivity)
			r.Get("/jobs/{id}/layers/roads-geojson", h.Result.GetRoadsGeoJSON)

			r.Get("/reports", h.Report.ListAll)
			r.Post("/jobs/{id}/reports", h.Report.Generate)
			r.Get("/jobs/{id}/reports", h.Report.List)
			r.Get("/reports/{id}", h.Report.Get)
			r.Get("/reports/{id}/download", h.Report.Download)
			r.Delete("/reports/{id}", h.Report.Delete)

			r.Post("/upload/geojson", h.Upload.UploadGeoJSON)
		})
	})
}
