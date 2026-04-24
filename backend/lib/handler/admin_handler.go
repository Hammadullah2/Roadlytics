// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/Hammadullah2/Roadlytics/backend/lib/middleware"
	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/adminsvc"
	"github.com/Hammadullah2/Roadlytics/backend/lib/service/usersvc"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

// AdminHandler serves admin-only user moderation endpoints.
type AdminHandler struct {
	users usersvc.UserService
	admin adminsvc.AdminService
}

// NewAdminHandler creates an admin handler from the user service dependency.
func NewAdminHandler(users usersvc.UserService, adminServices ...adminsvc.AdminService) *AdminHandler {
	var adminService adminsvc.AdminService
	if len(adminServices) > 0 {
		adminService = adminServices[0]
	}

	return &AdminHandler{
		users: users,
		admin: adminService,
	}
}

type adminUserResponse struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Email          string `json:"email"`
	Role           string `json:"role"`
	ApprovalStatus string `json:"approval_status"`
	ProjectCount   int    `json:"project_count"`
	CreatedAt      any    `json:"created_at"`
}

type adminProjectResponse struct {
	ID          string `json:"id"`
	OwnerID     string `json:"owner_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	OwnerName   string `json:"owner_name"`
	RegionCount int    `json:"region_count"`
	Status      string `json:"status"`
	CreatedAt   any    `json:"created_at"`
}

type adminJobResponse struct {
	ID          string `json:"id"`
	ProjectID   string `json:"project_id"`
	ProjectName string `json:"project_name"`
	RegionID    string `json:"region_id"`
	RegionName  string `json:"region_name"`
	OwnerID     string `json:"owner_id"`
	OwnerName   string `json:"owner_name"`
	JobType     string `json:"job_type"`
	Status      string `json:"status"`
	Progress    int    `json:"progress"`
	CreatedAt   any    `json:"created_at"`
	StartedAt   any    `json:"started_at,omitempty"`
	CompletedAt any    `json:"completed_at,omitempty"`
}

type adminActivityResponse struct {
	ID        string `json:"id"`
	User      string `json:"user"`
	Action    string `json:"action"`
	Project   string `json:"project"`
	CreatedAt any    `json:"created_at"`
}

type adminOverviewResponse struct {
	TotalUsers     int                     `json:"total_users"`
	TotalProjects  int                     `json:"total_projects"`
	ActiveJobs     int                     `json:"active_jobs"`
	ReportsCount   int                     `json:"reports_count"`
	RecentActivity []adminActivityResponse `json:"recent_activity"`
}

type adminLogResponse struct {
	ID        string `json:"id"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	CreatedAt any    `json:"created_at"`
}

type adminSystemResponse struct {
	CPUPercent          int                `json:"cpu_percent"`
	MemoryUsedGB        float64            `json:"memory_used_gb"`
	MemoryTotalGB       float64            `json:"memory_total_gb"`
	StorageUsedGB       float64            `json:"storage_used_gb"`
	StorageTotalTB      float64            `json:"storage_total_tb"`
	NetworkDownloadMbps float64            `json:"network_download_mbps"`
	NetworkUploadMbps   float64            `json:"network_upload_mbps"`
	NetworkLevel        string             `json:"network_level"`
	ActiveJobs          int                `json:"active_jobs"`
	ReportsCount        int                `json:"reports_count"`
	Logs                []adminLogResponse `json:"logs"`
}

func (h *AdminHandler) requireAdminService(w http.ResponseWriter) bool {
	if h.admin != nil {
		return true
	}

	response.Error(w, http.StatusInternalServerError, "admin service is not configured")
	return false
}

// GetOverview returns the live admin dashboard summary.
func (h *AdminHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	overview, err := h.admin.GetOverview(r.Context())
	if err != nil {
		writeServiceError(w, err, "failed to load admin overview")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminOverviewResponse(overview), "admin overview loaded successfully")
}

// ListPendingUsers returns users awaiting approval.
func (h *AdminHandler) ListPendingUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	users, err := h.admin.ListUsers(r.Context(), true)
	if err != nil {
		writeServiceError(w, err, "failed to list pending users")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminUserResponses(users), "pending users loaded successfully")
}

// ListUsers returns every profile in the system.
func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	users, err := h.admin.ListUsers(r.Context(), false)
	if err != nil {
		writeServiceError(w, err, "failed to list users")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminUserResponses(users), "users loaded successfully")
}

// ApproveUser marks a pending user as approved.
func (h *AdminHandler) ApproveUser(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	userID := chi.URLParam(r, "id")
	if err := h.users.ApproveUser(r.Context(), userID); err != nil {
		writeServiceError(w, err, "failed to approve user")
		return
	}

	profile, err := h.admin.GetUser(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.Error(w, http.StatusNotFound, "profile not found")
			return
		}

		writeServiceError(w, err, "failed to load approved user")
		return
	}

	if err := h.admin.RecordEvent(r.Context(), middleware.UserIDFromContext(r.Context()), "INFO", "user_approved", "Approved user", map[string]any{
		"target_user_id": userID,
		"user_name":      profile.Name,
	}); err != nil {
		writeServiceError(w, err, "failed to record user approval")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminUserResponse(profile), "user approved successfully")
}

// RejectUser marks a pending user as rejected.
func (h *AdminHandler) RejectUser(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	userID := chi.URLParam(r, "id")
	if err := h.users.RejectUser(r.Context(), userID); err != nil {
		writeServiceError(w, err, "failed to reject user")
		return
	}

	profile, err := h.admin.GetUser(r.Context(), userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.Error(w, http.StatusNotFound, "profile not found")
			return
		}

		writeServiceError(w, err, "failed to load rejected user")
		return
	}

	if err := h.admin.RecordEvent(r.Context(), middleware.UserIDFromContext(r.Context()), "WARNING", "user_rejected", "Rejected user", map[string]any{
		"target_user_id": userID,
		"user_name":      profile.Name,
	}); err != nil {
		writeServiceError(w, err, "failed to record user rejection")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminUserResponse(profile), "user rejected successfully")
}

// ListProjects returns all projects for the admin project panel.
func (h *AdminHandler) ListProjects(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	projects, err := h.admin.ListProjects(r.Context())
	if err != nil {
		writeServiceError(w, err, "failed to list admin projects")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminProjectResponses(projects), "admin projects loaded successfully")
}

// DeleteProject removes one project from the admin panel.
func (h *AdminHandler) DeleteProject(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	projectID := chi.URLParam(r, "id")
	if err := h.admin.DeleteProject(r.Context(), middleware.UserIDFromContext(r.Context()), projectID); err != nil {
		writeServiceError(w, err, "failed to delete admin project")
		return
	}

	writeSuccess(w, http.StatusOK, map[string]string{"id": projectID}, "project deleted successfully")
}

// ListJobs returns recent jobs across the workspace for the admin panel.
func (h *AdminHandler) ListJobs(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	jobs, err := h.admin.ListJobs(r.Context())
	if err != nil {
		writeServiceError(w, err, "failed to list admin jobs")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminJobResponses(jobs), "admin jobs loaded successfully")
}

// ListLogs returns recent system logs for the admin panel.
func (h *AdminHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	logs, err := h.admin.ListLogs(r.Context())
	if err != nil {
		writeServiceError(w, err, "failed to list admin logs")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminLogResponses(logs), "admin logs loaded successfully")
}

// GetSystem returns live system metrics and recent log entries for the admin panel.
func (h *AdminHandler) GetSystem(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	systemSnapshot, err := h.admin.GetSystemSnapshot(r.Context())
	if err != nil {
		writeServiceError(w, err, "failed to load admin system snapshot")
		return
	}

	writeSuccess(w, http.StatusOK, toAdminSystemResponse(systemSnapshot), "admin system snapshot loaded successfully")
}

// GetSettings returns the persisted admin settings payload.
func (h *AdminHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	settings, err := h.admin.GetSettings(r.Context())
	if err != nil {
		writeServiceError(w, err, "failed to load admin settings")
		return
	}

	writeSuccess(w, http.StatusOK, settings, "admin settings loaded successfully")
}

// UpdateSettings persists the admin settings payload.
func (h *AdminHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdminService(w) {
		return
	}

	var payload map[string]any
	if err := decodeJSON(r, &payload); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	settings, err := h.admin.UpdateSettings(r.Context(), middleware.UserIDFromContext(r.Context()), payload)
	if err != nil {
		writeServiceError(w, err, "failed to save admin settings")
		return
	}

	writeSuccess(w, http.StatusOK, settings, "admin settings saved successfully")
}

func toAdminUserResponses(users []*models.AdminUserSummary) []adminUserResponse {
	items := make([]adminUserResponse, 0, len(users))
	for _, user := range users {
		items = append(items, toAdminUserResponse(user))
	}

	return items
}

func toAdminUserResponse(user *models.AdminUserSummary) adminUserResponse {
	return adminUserResponse{
		ID:             user.ID,
		Name:           user.Name,
		Email:          user.Email,
		Role:           user.Role,
		ApprovalStatus: user.ApprovalStatus,
		ProjectCount:   user.ProjectCount,
		CreatedAt:      user.CreatedAt,
	}
}

func toAdminProjectResponses(projects []*models.AdminProjectSummary) []adminProjectResponse {
	items := make([]adminProjectResponse, 0, len(projects))
	for _, project := range projects {
		items = append(items, toAdminProjectResponse(project))
	}

	return items
}

func toAdminProjectResponse(project *models.AdminProjectSummary) adminProjectResponse {
	return adminProjectResponse{
		ID:          project.ID,
		OwnerID:     project.OwnerID,
		Name:        project.Name,
		Description: project.Description,
		OwnerName:   project.OwnerName,
		RegionCount: project.RegionCount,
		Status:      project.Status,
		CreatedAt:   project.CreatedAt,
	}
}

func toAdminJobResponses(jobs []*models.AdminJobSummary) []adminJobResponse {
	items := make([]adminJobResponse, 0, len(jobs))
	for _, job := range jobs {
		items = append(items, adminJobResponse{
			ID:          job.ID,
			ProjectID:   job.ProjectID,
			ProjectName: job.ProjectName,
			RegionID:    job.RegionID,
			RegionName:  job.RegionName,
			OwnerID:     job.OwnerID,
			OwnerName:   job.OwnerName,
			JobType:     job.JobType,
			Status:      job.Status,
			Progress:    job.Progress,
			CreatedAt:   job.CreatedAt,
			StartedAt:   job.StartedAt,
			CompletedAt: job.CompletedAt,
		})
	}

	return items
}

func toAdminLogResponses(logs []*models.AdminLogEntry) []adminLogResponse {
	items := make([]adminLogResponse, 0, len(logs))
	for _, entry := range logs {
		items = append(items, adminLogResponse{
			ID:        entry.ID,
			Level:     entry.Level,
			Message:   entry.Message,
			CreatedAt: entry.CreatedAt,
		})
	}

	return items
}

func toAdminOverviewResponse(overview *models.AdminOverview) adminOverviewResponse {
	activities := make([]adminActivityResponse, 0, len(overview.RecentActivity))
	for _, activity := range overview.RecentActivity {
		activities = append(activities, adminActivityResponse{
			ID:        activity.ID,
			User:      activity.User,
			Action:    activity.Action,
			Project:   activity.Project,
			CreatedAt: activity.CreatedAt,
		})
	}

	return adminOverviewResponse{
		TotalUsers:     overview.TotalUsers,
		TotalProjects:  overview.TotalProjects,
		ActiveJobs:     overview.ActiveJobs,
		ReportsCount:   overview.ReportsCount,
		RecentActivity: activities,
	}
}

func toAdminSystemResponse(snapshot *models.AdminSystemSnapshot) adminSystemResponse {
	return adminSystemResponse{
		CPUPercent:          snapshot.CPUPercent,
		MemoryUsedGB:        snapshot.MemoryUsedGB,
		MemoryTotalGB:       snapshot.MemoryTotalGB,
		StorageUsedGB:       snapshot.StorageUsedGB,
		StorageTotalTB:      snapshot.StorageTotalTB,
		NetworkDownloadMbps: snapshot.NetworkDownloadMbps,
		NetworkUploadMbps:   snapshot.NetworkUploadMbps,
		NetworkLevel:        snapshot.NetworkLevel,
		ActiveJobs:          snapshot.ActiveJobs,
		ReportsCount:        snapshot.ReportsCount,
		Logs:                toAdminLogResponses(snapshot.Logs),
	}
}
