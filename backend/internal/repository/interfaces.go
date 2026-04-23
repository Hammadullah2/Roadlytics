// Package repository defines storage-agnostic repository contracts for the backend.
package repository

import (
	"context"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
)

// UserRepository defines persistence operations for user profiles.
type UserRepository interface {
	GetByID(ctx context.Context, id string) (*models.Profile, error)
	GetByEmail(ctx context.Context, email string) (*models.Profile, error)
	Create(ctx context.Context, profile *models.Profile) (*models.Profile, error)
	UpdateProfile(ctx context.Context, id, fullName string) (*models.Profile, error)
	UpdateApprovalStatus(ctx context.Context, id, status string) error
	ListPending(ctx context.Context) ([]*models.Profile, error)
	ListAll(ctx context.Context) ([]*models.Profile, error)
}

// ProjectRepository defines persistence operations for projects.
type ProjectRepository interface {
	Create(ctx context.Context, project *models.Project) (*models.Project, error)
	GetByID(ctx context.Context, id string) (*models.Project, error)
	ListByOwner(ctx context.Context, ownerID string) ([]*models.Project, error)
	Update(ctx context.Context, project *models.Project) (*models.Project, error)
	Delete(ctx context.Context, id string) error
}

// RegionRepository defines persistence operations for regions.
type RegionRepository interface {
	Create(ctx context.Context, region *models.Region) (*models.Region, error)
	GetByID(ctx context.Context, id string) (*models.Region, error)
	ListByProject(ctx context.Context, projectID string) ([]*models.Region, error)
	Delete(ctx context.Context, id string) error
}

// JobRepository defines persistence operations for jobs.
type JobRepository interface {
	Create(ctx context.Context, job *models.Job) (*models.Job, error)
	GetByID(ctx context.Context, id string) (*models.Job, error)
	ListByRegion(ctx context.Context, regionID string) ([]*models.Job, error)
	UpdateStatus(ctx context.Context, id, status string) error
	UpdateProgress(ctx context.Context, id string, progress int) error
	UpdateResultRefs(ctx context.Context, id string, refs *models.JobResultRefs) error
	ListPending(ctx context.Context) ([]*models.Job, error)
	ListRunning(ctx context.Context) ([]*models.Job, error)
}

// ResultRepository defines persistence operations for model results.
type ResultRepository interface {
	SaveSegmentation(ctx context.Context, result *models.SegmentationResult) (*models.SegmentationResult, error)
	SaveClassification(ctx context.Context, result *models.ClassificationResult) (*models.ClassificationResult, error)
	SaveConnectivityGraph(ctx context.Context, result *models.ConnectivityGraph) (*models.ConnectivityGraph, error)
	GetResultsByJob(ctx context.Context, jobID string) (*models.JobResults, error)
}

// ReportRepository defines persistence operations for reports.
type ReportRepository interface {
	Create(ctx context.Context, report *models.Report) (*models.Report, error)
	GetByID(ctx context.Context, id string) (*models.Report, error)
	ListByJob(ctx context.Context, jobID string) ([]*models.Report, error)
	ListByUser(ctx context.Context, userID string) ([]*models.Report, error)
	Delete(ctx context.Context, id string) error
}

// AdminRepository defines persistence operations that back the admin panel.
type AdminRepository interface {
	CountUsers(ctx context.Context) (int, error)
	CountProjects(ctx context.Context) (int, error)
	CountActiveJobs(ctx context.Context) (int, error)
	CountReports(ctx context.Context) (int, error)
	ListRecentActivity(ctx context.Context, limit int) ([]*models.AdminActivity, error)
	ListUserSummaries(ctx context.Context, pendingOnly bool) ([]*models.AdminUserSummary, error)
	GetUserSummary(ctx context.Context, id string) (*models.AdminUserSummary, error)
	ListProjectSummaries(ctx context.Context) ([]*models.AdminProjectSummary, error)
	GetProjectSummary(ctx context.Context, id string) (*models.AdminProjectSummary, error)
	DeleteProject(ctx context.Context, id string) error
	ListJobSummaries(ctx context.Context, limit int) ([]*models.AdminJobSummary, error)
	GetDatabaseSizeBytes(ctx context.Context) (int64, error)
	ListLogs(ctx context.Context, limit int) ([]*models.AdminLogEntry, error)
	AppendLog(ctx context.Context, userID *string, level, eventType, message string, metadata map[string]any) error
	GetSettings(ctx context.Context) (map[string]any, error)
	SaveSettings(ctx context.Context, actorID string, settings map[string]any) (map[string]any, error)
}
