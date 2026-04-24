// Package models defines admin-facing dashboard and management models.
package models

import "time"

// AdminUserSummary represents the data needed for the admin user table.
type AdminUserSummary struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Email          string    `json:"email"`
	Role           string    `json:"role"`
	ApprovalStatus string    `json:"approval_status"`
	ProjectCount   int       `json:"project_count"`
	CreatedAt      time.Time `json:"created_at"`
}

// AdminProjectSummary represents the data needed for the admin project table.
type AdminProjectSummary struct {
	ID          string    `json:"id"`
	OwnerID     string    `json:"owner_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	OwnerName   string    `json:"owner_name"`
	RegionCount int       `json:"region_count"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

// AdminJobSummary represents a job row shown in admin operational views.
type AdminJobSummary struct {
	ID          string     `json:"id"`
	ProjectID   string     `json:"project_id"`
	ProjectName string     `json:"project_name"`
	RegionID    string     `json:"region_id"`
	RegionName  string     `json:"region_name"`
	OwnerID     string     `json:"owner_id"`
	OwnerName   string     `json:"owner_name"`
	JobType     string     `json:"job_type"`
	Status      string     `json:"status"`
	Progress    int        `json:"progress"`
	CreatedAt   time.Time  `json:"created_at"`
	StartedAt   *time.Time `json:"started_at,omitempty"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

// AdminActivity captures a single recent activity row for the admin overview.
type AdminActivity struct {
	ID        string    `json:"id"`
	User      string    `json:"user"`
	Action    string    `json:"action"`
	Project   string    `json:"project"`
	CreatedAt time.Time `json:"created_at"`
}

// AdminOverview aggregates the admin dashboard cards and recent activity.
type AdminOverview struct {
	TotalUsers     int              `json:"total_users"`
	TotalProjects  int              `json:"total_projects"`
	ActiveJobs     int              `json:"active_jobs"`
	ReportsCount   int              `json:"reports_count"`
	RecentActivity []*AdminActivity `json:"recent_activity"`
}

// AdminLogEntry represents a system log row rendered in the admin system panel.
type AdminLogEntry struct {
	ID        string    `json:"id"`
	Level     string    `json:"level"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

// AdminSystemSnapshot contains live metrics and logs for the admin system panel.
type AdminSystemSnapshot struct {
	CPUPercent          int              `json:"cpu_percent"`
	MemoryUsedGB        float64          `json:"memory_used_gb"`
	MemoryTotalGB       float64          `json:"memory_total_gb"`
	StorageUsedGB       float64          `json:"storage_used_gb"`
	StorageTotalTB      float64          `json:"storage_total_tb"`
	NetworkDownloadMbps float64          `json:"network_download_mbps"`
	NetworkUploadMbps   float64          `json:"network_upload_mbps"`
	NetworkLevel        string           `json:"network_level"`
	ActiveJobs          int              `json:"active_jobs"`
	ReportsCount        int              `json:"reports_count"`
	Logs                []*AdminLogEntry `json:"logs"`
}
