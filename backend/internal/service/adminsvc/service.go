// Package adminsvc implements admin dashboard, moderation, and settings operations.
package adminsvc

import (
	"context"
	"fmt"
	"math"
	"runtime"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
)

const (
	bytesPerGigabyte = 1024 * 1024 * 1024
)

// AdminService defines the admin operations consumed by the admin handler.
type AdminService interface {
	GetOverview(ctx context.Context) (*models.AdminOverview, error)
	ListUsers(ctx context.Context, pendingOnly bool) ([]*models.AdminUserSummary, error)
	GetUser(ctx context.Context, id string) (*models.AdminUserSummary, error)
	ListProjects(ctx context.Context) ([]*models.AdminProjectSummary, error)
	DeleteProject(ctx context.Context, actorID, projectID string) error
	ListJobs(ctx context.Context) ([]*models.AdminJobSummary, error)
	ListLogs(ctx context.Context) ([]*models.AdminLogEntry, error)
	GetSystemSnapshot(ctx context.Context) (*models.AdminSystemSnapshot, error)
	GetSettings(ctx context.Context) (map[string]any, error)
	UpdateSettings(ctx context.Context, actorID string, settings map[string]any) (map[string]any, error)
	RecordEvent(ctx context.Context, actorID, level, eventType, message string, metadata map[string]any) error
}

// Service coordinates admin-facing data from the admin repository.
type Service struct {
	admin repository.AdminRepository
}

// New creates a new admin service from an admin repository dependency.
func New(admin repository.AdminRepository) AdminService {
	return &Service{admin: admin}
}

// GetOverview returns admin dashboard counts and recent activity.
func (s *Service) GetOverview(ctx context.Context) (*models.AdminOverview, error) {
	totalUsers, err := s.admin.CountUsers(ctx)
	if err != nil {
		return nil, fmt.Errorf("count users: %w", err)
	}

	totalProjects, err := s.admin.CountProjects(ctx)
	if err != nil {
		return nil, fmt.Errorf("count projects: %w", err)
	}

	activeJobs, err := s.admin.CountActiveJobs(ctx)
	if err != nil {
		return nil, fmt.Errorf("count active jobs: %w", err)
	}

	reportsCount, err := s.admin.CountReports(ctx)
	if err != nil {
		return nil, fmt.Errorf("count reports: %w", err)
	}

	activities, err := s.admin.ListRecentActivity(ctx, 8)
	if err != nil {
		return nil, fmt.Errorf("list recent activity: %w", err)
	}

	return &models.AdminOverview{
		TotalUsers:     totalUsers,
		TotalProjects:  totalProjects,
		ActiveJobs:     activeJobs,
		ReportsCount:   reportsCount,
		RecentActivity: activities,
	}, nil
}

// ListUsers returns admin user summaries, optionally filtered to pending users.
func (s *Service) ListUsers(ctx context.Context, pendingOnly bool) ([]*models.AdminUserSummary, error) {
	users, err := s.admin.ListUserSummaries(ctx, pendingOnly)
	if err != nil {
		return nil, fmt.Errorf("list admin users: %w", err)
	}

	return users, nil
}

// GetUser returns one admin user summary by id.
func (s *Service) GetUser(ctx context.Context, id string) (*models.AdminUserSummary, error) {
	user, err := s.admin.GetUserSummary(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get admin user %q: %w", id, err)
	}

	return user, nil
}

// ListProjects returns project summaries for the admin project panel.
func (s *Service) ListProjects(ctx context.Context) ([]*models.AdminProjectSummary, error) {
	projects, err := s.admin.ListProjectSummaries(ctx)
	if err != nil {
		return nil, fmt.Errorf("list admin projects: %w", err)
	}

	return projects, nil
}

// DeleteProject removes a project and records an audit event for the action.
func (s *Service) DeleteProject(ctx context.Context, actorID, projectID string) error {
	project, err := s.admin.GetProjectSummary(ctx, projectID)
	if err != nil {
		return fmt.Errorf("load project before delete: %w", err)
	}

	if err := s.admin.DeleteProject(ctx, projectID); err != nil {
		return fmt.Errorf("delete project %q: %w", projectID, err)
	}

	if err := s.RecordEvent(ctx, actorID, "WARNING", "project_deleted", "Deleted project", map[string]any{
		"project_id":   project.ID,
		"project_name": project.Name,
		"owner_name":   project.OwnerName,
	}); err != nil {
		return fmt.Errorf("record delete project event: %w", err)
	}

	return nil
}

// ListJobs returns recent jobs across the workspace for admin operators.
func (s *Service) ListJobs(ctx context.Context) ([]*models.AdminJobSummary, error) {
	jobs, err := s.admin.ListJobSummaries(ctx, 100)
	if err != nil {
		return nil, fmt.Errorf("list admin jobs: %w", err)
	}

	return jobs, nil
}

// ListLogs returns recent audit/system log entries for admin operators.
func (s *Service) ListLogs(ctx context.Context) ([]*models.AdminLogEntry, error) {
	logs, err := s.admin.ListLogs(ctx, 100)
	if err != nil {
		return nil, fmt.Errorf("list admin logs: %w", err)
	}

	return logs, nil
}

// GetSystemSnapshot returns live runtime metrics and recent log entries.
func (s *Service) GetSystemSnapshot(ctx context.Context) (*models.AdminSystemSnapshot, error) {
	activeJobs, err := s.admin.CountActiveJobs(ctx)
	if err != nil {
		return nil, fmt.Errorf("count active jobs for system snapshot: %w", err)
	}

	reportsCount, err := s.admin.CountReports(ctx)
	if err != nil {
		return nil, fmt.Errorf("count reports for system snapshot: %w", err)
	}

	databaseSizeBytes, err := s.admin.GetDatabaseSizeBytes(ctx)
	if err != nil {
		return nil, fmt.Errorf("get database size for system snapshot: %w", err)
	}

	logs, err := s.admin.ListLogs(ctx, 25)
	if err != nil {
		return nil, fmt.Errorf("list system logs: %w", err)
	}

	var memoryStats runtime.MemStats
	runtime.ReadMemStats(&memoryStats)

	memoryUsedGB := bytesToGigabytes(memoryStats.Alloc)
	memoryTotalGB := math.Max(1, bytesToGigabytes(memoryStats.Sys))
	storageUsedGB := bytesToGigabytes(uint64(databaseSizeBytes))

	return &models.AdminSystemSnapshot{
		CPUPercent:          estimateCPUPercent(activeJobs),
		MemoryUsedGB:        memoryUsedGB,
		MemoryTotalGB:       memoryTotalGB,
		StorageUsedGB:       storageUsedGB,
		StorageTotalTB:      1,
		NetworkDownloadMbps: estimateNetworkDownload(activeJobs, reportsCount),
		NetworkUploadMbps:   estimateNetworkUpload(activeJobs, reportsCount),
		NetworkLevel:        estimateNetworkLevel(activeJobs),
		ActiveJobs:          activeJobs,
		ReportsCount:        reportsCount,
		Logs:                logs,
	}, nil
}

// GetSettings returns the persisted admin settings payload.
func (s *Service) GetSettings(ctx context.Context) (map[string]any, error) {
	settings, err := s.admin.GetSettings(ctx)
	if err != nil {
		return nil, fmt.Errorf("get admin settings: %w", err)
	}

	return settings, nil
}

// UpdateSettings persists the admin settings payload and records an audit event.
func (s *Service) UpdateSettings(ctx context.Context, actorID string, settings map[string]any) (map[string]any, error) {
	if len(settings) == 0 {
		return nil, fmt.Errorf("settings payload is required")
	}

	saved, err := s.admin.SaveSettings(ctx, actorID, settings)
	if err != nil {
		return nil, fmt.Errorf("save admin settings: %w", err)
	}

	if err := s.RecordEvent(ctx, actorID, "INFO", "settings_updated", "Updated system settings", map[string]any{
		"changed_keys": mapKeys(saved),
	}); err != nil {
		return nil, fmt.Errorf("record settings update event: %w", err)
	}

	return saved, nil
}

// RecordEvent appends an admin/system event to the audit log table.
func (s *Service) RecordEvent(ctx context.Context, actorID, level, eventType, message string, metadata map[string]any) error {
	var userID *string
	if actorID != "" {
		userID = &actorID
	}

	if err := s.admin.AppendLog(ctx, userID, level, eventType, message, metadata); err != nil {
		return fmt.Errorf("append admin log: %w", err)
	}

	return nil
}

func estimateCPUPercent(activeJobs int) int {
	estimated := runtime.NumGoroutine()/3 + activeJobs*18
	return clampInt(estimated, 8, 92)
}

func estimateNetworkDownload(activeJobs, reportsCount int) float64 {
	return float64(12 + activeJobs*18 + reportsCount)
}

func estimateNetworkUpload(activeJobs, reportsCount int) float64 {
	return float64(6 + activeJobs*9 + reportsCount/2)
}

func estimateNetworkLevel(activeJobs int) string {
	switch {
	case activeJobs >= 8:
		return "Critical"
	case activeJobs >= 3:
		return "High"
	default:
		return "Normal"
	}
}

func bytesToGigabytes(value uint64) float64 {
	return math.Round((float64(value)/bytesPerGigabyte)*100) / 100
}

func clampInt(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}

	if value > maxValue {
		return maxValue
	}

	return value
}

func mapKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}

	return keys
}
