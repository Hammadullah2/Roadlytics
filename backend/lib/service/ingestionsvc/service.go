// Package ingestionsvc implements project, region, upload, and job creation workflows.
package ingestionsvc

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository"
)

// StorageClient defines the storage operations used by ingestion workflows.
type StorageClient interface {
	UploadFile(bucket string, path string, data []byte, contentType string) (string, error)
}

// IngestionService defines ingestion and setup operations used by handlers.
type IngestionService interface {
	CreateProject(ctx context.Context, ownerID, name, description string) (*models.Project, error)
	GetProject(ctx context.Context, ownerID, projectID string) (*models.Project, error)
	ListProjects(ctx context.Context, ownerID string) ([]*models.Project, error)
	UpdateProject(ctx context.Context, ownerID string, project *models.Project) (*models.Project, error)
	DeleteProject(ctx context.Context, ownerID, projectID string) error
	CreateRegion(ctx context.Context, ownerID, projectID string, region *models.Region) (*models.Region, error)
	GetRegion(ctx context.Context, ownerID, projectID, regionID string) (*models.Region, error)
	GetRegionByID(ctx context.Context, ownerID, regionID string) (*models.Region, error)
	ListRegions(ctx context.Context, ownerID, projectID string) ([]*models.Region, error)
	DeleteRegion(ctx context.Context, ownerID, projectID, regionID string) error
	DeleteRegionByID(ctx context.Context, ownerID, regionID string) error

	CreateJob(ctx context.Context, userID, regionID, jobType string) (*models.Job, error)
}

// Service handles project, region, GeoJSON upload, and job operations.
type Service struct {
	projects repository.ProjectRepository
	regions  repository.RegionRepository
	jobs     repository.JobRepository
	storage  StorageClient
}

// New creates an ingestion service from repository and storage dependencies.
func New(
	projects repository.ProjectRepository,
	regions repository.RegionRepository,
	jobs repository.JobRepository,
	storage StorageClient,
) IngestionService {
	return &Service{
		projects: projects,
		regions:  regions,
		jobs:     jobs,
		storage:  storage,
	}
}

// CreateProject creates a project owned by the authenticated user.
func (s *Service) CreateProject(ctx context.Context, ownerID, name, description string) (*models.Project, error) {
	project := &models.Project{
		OwnerID:     ownerID,
		Name:        name,
		Description: description,
	}

	created, err := s.projects.Create(ctx, project)
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}

	return created, nil
}

// GetProject returns a project owned by the authenticated user.
func (s *Service) GetProject(ctx context.Context, ownerID, projectID string) (*models.Project, error) {
	project, err := s.projects.GetByID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get project %q: %w", projectID, err)
	}

	if project.OwnerID != ownerID {
		return nil, fmt.Errorf("get project %q for owner %q: %w", projectID, ownerID, pgx.ErrNoRows)
	}

	return project, nil
}

// ListProjects returns all projects belonging to the authenticated user.
func (s *Service) ListProjects(ctx context.Context, ownerID string) ([]*models.Project, error) {
	projects, err := s.projects.ListByOwner(ctx, ownerID)
	if err != nil {
		return nil, fmt.Errorf("list projects for owner %q: %w", ownerID, err)
	}

	return projects, nil
}

// UpdateProject updates a project owned by the authenticated user.
func (s *Service) UpdateProject(ctx context.Context, ownerID string, project *models.Project) (*models.Project, error) {
	current, err := s.GetProject(ctx, ownerID, project.ID)
	if err != nil {
		return nil, err
	}

	current.Name = project.Name
	current.Description = project.Description
	if project.Status != "" {
		current.Status = project.Status
	}

	updated, err := s.projects.Update(ctx, current)
	if err != nil {
		return nil, fmt.Errorf("update project %q: %w", project.ID, err)
	}

	return updated, nil
}

// DeleteProject deletes a project owned by the authenticated user.
func (s *Service) DeleteProject(ctx context.Context, ownerID, projectID string) error {
	if _, err := s.GetProject(ctx, ownerID, projectID); err != nil {
		return err
	}

	if err := s.projects.Delete(ctx, projectID); err != nil {
		return fmt.Errorf("delete project %q: %w", projectID, err)
	}

	return nil
}

// CreateRegion creates a region under a project owned by the authenticated user.
func (s *Service) CreateRegion(ctx context.Context, ownerID, projectID string, region *models.Region) (*models.Region, error) {
	if _, err := s.GetProject(ctx, ownerID, projectID); err != nil {
		return nil, err
	}

	region.ProjectID = projectID
	created, err := s.regions.Create(ctx, region)
	if err != nil {
		return nil, fmt.Errorf("create region for project %q: %w", projectID, err)
	}

	return created, nil
}

// GetRegion returns a region owned through the authenticated user's project.
func (s *Service) GetRegion(ctx context.Context, ownerID, projectID, regionID string) (*models.Region, error) {
	region, err := s.regions.GetByID(ctx, regionID)
	if err != nil {
		return nil, fmt.Errorf("get region %q: %w", regionID, err)
	}

	if region.ProjectID != projectID {
		return nil, fmt.Errorf("get region %q for project %q: %w", regionID, projectID, pgx.ErrNoRows)
	}

	project, err := s.GetProject(ctx, ownerID, projectID)
	if err != nil {
		return nil, err
	}

	if project.OwnerID != ownerID {
		return nil, fmt.Errorf("get region %q for owner %q: %w", regionID, ownerID, pgx.ErrNoRows)
	}

	return region, nil
}

// GetRegionByID returns a region owned by the authenticated user without requiring the project path.
func (s *Service) GetRegionByID(ctx context.Context, ownerID, regionID string) (*models.Region, error) {
	region, err := s.authorizeRegion(ctx, ownerID, regionID)
	if err != nil {
		return nil, err
	}

	return region, nil
}

// ListRegions returns regions for a project owned by the authenticated user.
func (s *Service) ListRegions(ctx context.Context, ownerID, projectID string) ([]*models.Region, error) {
	if _, err := s.GetProject(ctx, ownerID, projectID); err != nil {
		return nil, err
	}

	regions, err := s.regions.ListByProject(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("list regions for project %q: %w", projectID, err)
	}

	return regions, nil
}

// DeleteRegion deletes a region owned through the authenticated user's project.
func (s *Service) DeleteRegion(ctx context.Context, ownerID, projectID, regionID string) error {
	if _, err := s.GetRegion(ctx, ownerID, projectID, regionID); err != nil {
		return err
	}

	if err := s.regions.Delete(ctx, regionID); err != nil {
		return fmt.Errorf("delete region %q: %w", regionID, err)
	}

	return nil
}

// DeleteRegionByID deletes a region by id after ownership authorization.
func (s *Service) DeleteRegionByID(ctx context.Context, ownerID, regionID string) error {
	if _, err := s.authorizeRegion(ctx, ownerID, regionID); err != nil {
		return err
	}

	if err := s.regions.Delete(ctx, regionID); err != nil {
		return fmt.Errorf("delete region %q: %w", regionID, err)
	}

	return nil
}



// CreateJob creates a pending job for a region owned by the authenticated user.
func (s *Service) CreateJob(ctx context.Context, userID, regionID, jobType string) (*models.Job, error) {
	if _, err := s.authorizeRegion(ctx, userID, regionID); err != nil {
		return nil, err
	}

	job := &models.Job{
		RegionID:  regionID,
		CreatedBy: userID,
		JobType:   jobType,
		Status:    models.JobStatusPending,
		Progress:  0,
	}

	created, err := s.jobs.Create(ctx, job)
	if err != nil {
		return nil, fmt.Errorf("create job for region %q: %w", regionID, err)
	}

	return created, nil
}

func (s *Service) authorizeRegion(ctx context.Context, ownerID, regionID string) (*models.Region, error) {
	region, err := s.regions.GetByID(ctx, regionID)
	if err != nil {
		return nil, fmt.Errorf("get region %q: %w", regionID, err)
	}

	project, err := s.projects.GetByID(ctx, region.ProjectID)
	if err != nil {
		return nil, fmt.Errorf("get project %q for region %q: %w", region.ProjectID, regionID, err)
	}

	if project.OwnerID != ownerID {
		return nil, fmt.Errorf("get region %q for owner %q: %w", regionID, ownerID, pgx.ErrNoRows)
	}

	return region, nil
}

func sanitizeFilename(filename string) string {
	base := filepath.Base(strings.TrimSpace(filename))
	base = strings.ReplaceAll(base, " ", "-")
	base = strings.ReplaceAll(base, "..", "")
	base = strings.ReplaceAll(base, "/", "-")
	base = strings.ReplaceAll(base, "\\", "-")
	if base == "" {
		return "upload.geojson"
	}

	return base
}
