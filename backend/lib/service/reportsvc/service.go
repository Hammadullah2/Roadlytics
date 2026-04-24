// Package reportsvc implements report generation and retrieval operations.
package reportsvc

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/lib/repository"
	"github.com/Hammadullah2/Roadlytics/backend/lib/modelclient"
	"io"
)

// StorageClient defines the storage operations used by report workflows.
type StorageClient interface {
	UploadFile(bucket string, path string, data []byte, contentType string) (string, error)
	GetSignedURL(bucket string, path string, expiresIn int) (string, error)
	DeleteFile(bucket string, path string) error
}

// ReportService defines the report operations used by handlers.
type ReportService interface {
	GenerateReport(ctx context.Context, userID, jobID, reportType string) (*models.Report, error)
	GetReport(ctx context.Context, userID, reportID string) (*models.Report, error)
	ListReports(ctx context.Context, userID, jobID string) ([]*models.Report, error)
	ListUserReports(ctx context.Context, userID string) ([]*models.Report, error)
	DeleteReport(ctx context.Context, userID, reportID string) error
}

// Service handles report generation and retrieval.
type Service struct {
	reports repository.ReportRepository
	jobs    repository.JobRepository
	storage StorageClient
	mlClient *modelclient.Client
}

// New creates a report service from repository and storage dependencies.
func New(reports repository.ReportRepository, jobs repository.JobRepository, storage StorageClient, mlClient *modelclient.Client) ReportService {
	return &Service{reports: reports, jobs: jobs, storage: storage, mlClient: mlClient}
}

// GenerateReport creates a report record and returns a signed URL for retrieval.
func (s *Service) GenerateReport(ctx context.Context, userID, jobID, reportType string) (*models.Report, error) {
	job, err := s.jobs.GetByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get job %q: %w", jobID, err)
	}

	if job.CreatedBy != userID {
		return nil, fmt.Errorf("generate report for job %q and user %q: %w", jobID, userID, pgx.ErrNoRows)
	}

	reportType, extension, contentType, err := normalizeReportType(reportType)
	if err != nil {
		return nil, err
	}

	reportPath := path.Join(jobID, fmt.Sprintf("%s-%d.%s", reportType, time.Now().UTC().UnixNano(), extension))
	if s.storage != nil {
		payload, payloadErr := buildReportPayload(job, reportType, s.mlClient)
		if payloadErr != nil {
			return nil, payloadErr
		}

		if _, err := s.storage.UploadFile("reports", reportPath, payload, contentType); err != nil {
			return nil, fmt.Errorf("upload report artifact %q: %w", reportPath, err)
		}
	}

	report, err := s.reports.Create(ctx, &models.Report{
		JobID:      jobID,
		ReportType: reportType,
		FilePath:   reportPath,
	})
	if err != nil {
		return nil, fmt.Errorf("create report for job %q: %w", jobID, err)
	}

	if err := s.attachSignedURL(ctx, report, job); err != nil {
		return nil, err
	}

	return report, nil
}

// GetReport returns a report if it belongs to the authenticated user's job.
func (s *Service) GetReport(ctx context.Context, userID, reportID string) (*models.Report, error) {
	report, err := s.reports.GetByID(ctx, reportID)
	if err != nil {
		return nil, fmt.Errorf("get report %q: %w", reportID, err)
	}

	job, err := s.jobs.GetByID(ctx, report.JobID)
	if err != nil {
		return nil, fmt.Errorf("get job %q for report %q: %w", report.JobID, reportID, err)
	}

	if job.CreatedBy != userID {
		return nil, fmt.Errorf("get report %q for user %q: %w", reportID, userID, pgx.ErrNoRows)
	}

	if err := s.attachSignedURL(ctx, report, job); err != nil {
		return nil, err
	}

	return report, nil
}

// ListReports returns reports for a job owned by the authenticated user.
func (s *Service) ListReports(ctx context.Context, userID, jobID string) ([]*models.Report, error) {
	job, err := s.jobs.GetByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("get job %q: %w", jobID, err)
	}

	if job.CreatedBy != userID {
		return nil, fmt.Errorf("list reports for job %q and user %q: %w", jobID, userID, pgx.ErrNoRows)
	}

	reports, err := s.reports.ListByJob(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("list reports for job %q: %w", jobID, err)
	}

	return reports, nil
}

// ListUserReports returns every report belonging to the authenticated user.
func (s *Service) ListUserReports(ctx context.Context, userID string) ([]*models.Report, error) {
	reports, err := s.reports.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list reports for user %q: %w", userID, err)
	}

	return reports, nil
}

// DeleteReport deletes a report record and its storage object.
func (s *Service) DeleteReport(ctx context.Context, userID, reportID string) error {
	report, err := s.GetReport(ctx, userID, reportID)
	if err != nil {
		return err
	}

	if s.storage != nil {
		if err := s.storage.DeleteFile("reports", report.FilePath); err != nil && !isMissingStorageObjectError(err) {
			return fmt.Errorf("delete report file %q: %w", report.FilePath, err)
		}
	}

	if err := s.reports.Delete(ctx, reportID); err != nil {
		return fmt.Errorf("delete report record %q: %w", reportID, err)
	}

	return nil
}

func (s *Service) attachSignedURL(ctx context.Context, report *models.Report, job *models.Job) error {
	if s.storage == nil || report == nil {
		return nil
	}

	signedURL, err := s.storage.GetSignedURL("reports", report.FilePath, 3600)
	if err == nil {
		report.SignedURL = signedURL
		return nil
	}

	if job == nil {
		job, err = s.jobs.GetByID(ctx, report.JobID)
		if err != nil {
			return fmt.Errorf("get job %q for report %q: %w", report.JobID, report.ID, err)
		}
	}

	reportType, _, contentType, normalizeErr := normalizeReportType(report.ReportType)
	if normalizeErr != nil {
		return normalizeErr
	}

	payload, payloadErr := buildReportPayload(job, reportType, s.mlClient)
	if payloadErr != nil {
		return payloadErr
	}

	if _, uploadErr := s.storage.UploadFile("reports", report.FilePath, payload, contentType); uploadErr != nil {
		return fmt.Errorf("repair report artifact %q: %w", report.FilePath, uploadErr)
	}

	signedURL, err = s.storage.GetSignedURL("reports", report.FilePath, 3600)
	if err != nil {
		return fmt.Errorf("sign report %q: %w", report.ID, err)
	}

	report.SignedURL = signedURL
	return nil
}

func normalizeReportType(reportType string) (normalized string, extension string, contentType string, err error) {
	switch strings.TrimSpace(strings.ToLower(reportType)) {
	case "pdf":
		return "pdf", "pdf", "application/pdf", nil
	case "csv":
		return "csv", "csv", "text/csv", nil
	case "shapefile", "shape", "shp":
		return "shapefile", "zip", "application/zip", nil
	default:
		return "", "", "", fmt.Errorf("unsupported report type %q", reportType)
	}
}

func buildReportPayload(job *models.Job, reportType string, mlClient *modelclient.Client) ([]byte, error) {
	if job == nil {
		return nil, fmt.Errorf("job is required")
	}

	if job.ResultRefs != nil && mlClient != nil {
		var refs models.JobResultRefs
		if err := json.Unmarshal(job.ResultRefs, &refs); err == nil && refs.Downloads != nil {
			var fileKey string
			switch reportType {
			case "pdf":
				if refs.Downloads.ReportPDF != "" {
					fileKey = "report_pdf"
				}
			case "shapefile":
				if refs.Downloads.ReportZip != "" {
					fileKey = "report_zip"
				}
			case "csv":
				if refs.Downloads.ComponentsCsv != "" {
					fileKey = "components_csv"
				}
			}

			if fileKey != "" {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
				defer cancel()

				resp, err := mlClient.DownloadFile(ctx, refs.InferenceJobID, fileKey)
				if err == nil {
					defer resp.Body.Close()
					if resp.StatusCode == 200 {
						data, err := io.ReadAll(resp.Body)
						if err == nil {
							return data, nil
						}
					}
				}
			}
		}
	}

	switch reportType {
	case "pdf":
		return buildPDFPayload(job), nil
	case "csv":
		return buildCSVPayload(job)
	case "shapefile":
		return buildShapefilePayload(job)
	default:
		return nil, fmt.Errorf("unsupported report type %q", reportType)
	}
}

func buildPDFPayload(job *models.Job) []byte {
	lines := []string{
		"Road Quality Assessment Report",
		"",
		"Job ID: " + job.ID,
		"Region ID: " + job.RegionID,
		"Job Type: " + job.JobType,
		"Status: " + job.Status,
		fmt.Sprintf("Progress: %d%%", job.Progress),
		"Generated At: " + time.Now().UTC().Format(time.RFC3339),
	}
	stream := "BT /F1 12 Tf 50 760 Td (" + escapePDFText(strings.Join(lines, "\\n")) + ") Tj ET"
	return []byte("%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n4 0 obj<< /Length " + fmt.Sprint(len(stream)) + " >>stream\n" + stream + "\nendstream\nendobj\n5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000063 00000 n \n0000000122 00000 n \n0000000248 00000 n \n0000000344 00000 n \ntrailer<< /Size 6 /Root 1 0 R >>\nstartxref\n414\n%%EOF")
}

func escapePDFText(value string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "(", "\\(", ")", "\\)")
	return replacer.Replace(value)
}

func buildCSVPayload(job *models.Job) ([]byte, error) {
	buffer := &bytes.Buffer{}
	writer := csv.NewWriter(buffer)
	rows := [][]string{
		{"field", "value"},
		{"job_id", job.ID},
		{"region_id", job.RegionID},
		{"job_type", job.JobType},
		{"status", job.Status},
		{"progress", fmt.Sprintf("%d", job.Progress)},
		{"generated_at", time.Now().UTC().Format(time.RFC3339)},
	}

	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return nil, fmt.Errorf("write csv report: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return nil, fmt.Errorf("flush csv report: %w", err)
	}

	return buffer.Bytes(), nil
}

func buildShapefilePayload(job *models.Job) ([]byte, error) {
	buffer := &bytes.Buffer{}
	zipWriter := zip.NewWriter(buffer)

	readme, err := zipWriter.Create("README.txt")
	if err != nil {
		return nil, fmt.Errorf("create shapefile placeholder entry: %w", err)
	}

	lines := []string{
		"Shapefile placeholder archive",
		"Job ID: " + job.ID,
		"Region ID: " + job.RegionID,
		"Job Type: " + job.JobType,
		"Status: " + job.Status,
		fmt.Sprintf("Progress: %d%%", job.Progress),
		"Generated At: " + time.Now().UTC().Format(time.RFC3339),
	}

	if _, err := readme.Write([]byte(strings.Join(lines, "\n"))); err != nil {
		return nil, fmt.Errorf("write shapefile placeholder entry: %w", err)
	}

	manifest, err := zipWriter.Create("manifest.json")
	if err != nil {
		return nil, fmt.Errorf("create shapefile manifest entry: %w", err)
	}

	manifestPayload := map[string]any{
		"job_id":       job.ID,
		"region_id":    job.RegionID,
		"job_type":     job.JobType,
		"status":       job.Status,
		"progress":     job.Progress,
		"generated_at": time.Now().UTC().Format(time.RFC3339),
	}

	encodedManifest, err := json.MarshalIndent(manifestPayload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal shapefile manifest: %w", err)
	}

	if _, err := manifest.Write(encodedManifest); err != nil {
		return nil, fmt.Errorf("write shapefile manifest: %w", err)
	}

	if err := zipWriter.Close(); err != nil {
		return nil, fmt.Errorf("close shapefile placeholder archive: %w", err)
	}

	return buffer.Bytes(), nil
}

func isMissingStorageObjectError(err error) bool {
	if err == nil {
		return false
	}

	message := strings.ToLower(err.Error())
	return strings.Contains(message, "not found") || strings.Contains(message, "404")
}

func sortedKeys(values map[string]any) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
