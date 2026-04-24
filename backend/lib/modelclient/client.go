// Package modelclient is the independent HTTP/WebSocket boundary between the
// backend and the external Python inference server. Everything about the remote
// service — its base URL, its timeouts, its readiness — is resolved through
// this package; no other package imports anything that assumes the inference
// server's infrastructure.
package modelclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
)



// InferenceJobResponse is the immediate response after triggering a job.
type InferenceJobResponse struct {
	JobID        string `json:"job_id"`
	Status       string `json:"status"`
	Stage        string `json:"stage"`
	ProgressPct  int    `json:"progress_pct"`
	WebsocketURL string `json:"websocket_url"`
}

// InferenceJobResult is the full result returned when a job completes.
type InferenceJobResult struct {
	JobID     string               `json:"job_id"`
	Status    string               `json:"status"`
	Downloads *models.JobDownloads `json:"downloads,omitempty"`
	Stats     *models.JobStats     `json:"stats,omitempty"`
}

// InferenceWSEvent is a single message from the inference server WebSocket stream.
type InferenceWSEvent struct {
	Type      string         `json:"type"`
	JobID     string         `json:"job_id"`
	Timestamp string         `json:"timestamp"`
	Payload   WSEventPayload `json:"payload"`
}

// WSEventPayload carries stage-specific fields within a WebSocket event.
// On a job_completed event, the payload is the InferencePipeline return dict:
//
//	{status, job_id, scene_meta, stats, outputs}
//
// On a job_failed event, the payload is:
//
//	{status: "error", job_id, error_message}
type WSEventPayload struct {
	Stage        string               `json:"stage,omitempty"`
	ProgressPct  int                  `json:"progress_pct,omitempty"`
	Message      string               `json:"message,omitempty"`
	Outputs      *models.JobDownloads `json:"outputs,omitempty"`
	Stats        *models.JobStats     `json:"stats,omitempty"`
	ErrorMessage string               `json:"error_message,omitempty"`
}

// HealthResponse is the shape of the inference server's GET /api/health body.
type HealthResponse struct {
	Status string `json:"status"`
	Device string `json:"device"`
}

// Options tunes timeouts for the model client. Zero fields fall back to defaults.
type Options struct {
	// HTTPTimeout bounds control-plane requests (fetch-and-run, health, status).
	HTTPTimeout time.Duration
	// DownloadTimeout bounds file proxy requests (roads GeoJSON, PDFs, shapefiles).
	// These can be large, so this defaults to several minutes.
	DownloadTimeout time.Duration
}

// Client sends requests to the inference server REST API. It owns two HTTP
// clients so short control-plane calls don't share a timeout budget with
// long-running downloads.
type Client struct {
	baseURL        string
	httpClient     *http.Client
	downloadClient *http.Client
}

// New creates a model client targeting the given base URL with default timeouts.
func New(baseURL string) *Client {
	return NewWithOptions(baseURL, Options{})
}

// NewWithOptions creates a model client with explicit timeout options.
func NewWithOptions(baseURL string, opts Options) *Client {
	httpTimeout := opts.HTTPTimeout
	if httpTimeout <= 0 {
		httpTimeout = 30 * time.Second
	}

	downloadTimeout := opts.DownloadTimeout
	if downloadTimeout <= 0 {
		downloadTimeout = 5 * time.Minute
	}

	return &Client{
		baseURL:        strings.TrimRight(baseURL, "/"),
		httpClient:     &http.Client{Timeout: httpTimeout},
		downloadClient: &http.Client{Timeout: downloadTimeout},
	}
}

// BaseURL returns the configured base URL (without trailing slash).
func (c *Client) BaseURL() string { return c.baseURL }

// HealthCheck pings the inference server's /api/health endpoint. Returns the
// parsed status document on success or a descriptive error on any failure
// (network, non-200, malformed body). Cheap enough to call on startup or from
// the backend's own health probes without affecting the inference server.
func (c *Client) HealthCheck(ctx context.Context) (*HealthResponse, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/health", nil)
	if err != nil {
		return nil, fmt.Errorf("build health request: %w", err)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call inference server health: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return nil, fmt.Errorf("inference server health returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var result HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode health response: %w", err)
	}

	return &result, nil
}

// UploadAndRun submits a user-uploaded GeoTIFF to the inference server via multipart form.
// Transient network errors and 5xx responses are retried with exponential
// backoff; 4xx responses are returned immediately.
func (c *Client) UploadAndRun(ctx context.Context, tifData []byte, regionName, backendJobID, segModel, clfModel string) (*InferenceJobResponse, error) {
	const maxAttempts = 3
	backoff := 500 * time.Millisecond

	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		result, retry, err := c.tryUploadAndRun(ctx, tifData, regionName, backendJobID, segModel, clfModel)
		if err == nil {
			return result, nil
		}

		lastErr = err
		if !retry || attempt == maxAttempts {
			return nil, lastErr
		}

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
		backoff *= 2
	}

	return nil, lastErr
}

func (c *Client) tryUploadAndRun(ctx context.Context, tifData []byte, regionName, backendJobID, segModel, clfModel string) (*InferenceJobResponse, bool, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile("file", "upload.tif")
	if err != nil {
		return nil, false, fmt.Errorf("create form file: %w", err)
	}
	if _, err := part.Write(tifData); err != nil {
		return nil, false, fmt.Errorf("write form file: %w", err)
	}

	if err := writer.WriteField("region_name", regionName); err != nil {
		return nil, false, fmt.Errorf("write region_name field: %w", err)
	}

	if backendJobID != "" {
		if err := writer.WriteField("backend_job_id", backendJobID); err != nil {
			return nil, false, fmt.Errorf("write backend_job_id field: %w", err)
		}
	}

	if segModel != "" {
		if err := writer.WriteField("seg_model", segModel); err != nil {
			return nil, false, fmt.Errorf("write seg_model field: %w", err)
		}
	}

	if clfModel != "" {
		if err := writer.WriteField("clf_model", clfModel); err != nil {
			return nil, false, fmt.Errorf("write clf_model field: %w", err)
		}
	}

	if err := writer.Close(); err != nil {
		return nil, false, fmt.Errorf("close multipart writer: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/jobs/upload-and-run", &body)
	if err != nil {
		return nil, false, fmt.Errorf("build upload-and-run request: %w", err)
	}

	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		// Network / timeout errors are retryable.
		return nil, true, fmt.Errorf("call inference server upload-and-run: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, true, fmt.Errorf("inference server returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusAccepted {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, false, fmt.Errorf("inference server returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var result InferenceJobResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, false, fmt.Errorf("decode upload-and-run response: %w", err)
	}

	return &result, false, nil
}

// DownloadFile streams a specific output file from the inference server.
// fileKey is one of the keys in the pipeline's outputs dict (e.g. "graph_geojson",
// "report_pdf", "report_zip"). The caller owns closing the response body.
// Uses the longer download timeout to accommodate large files.
func (c *Client) DownloadFile(ctx context.Context, inferenceJobID, fileKey string) (*http.Response, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/jobs/"+inferenceJobID+"/download/"+fileKey, nil)
	if err != nil {
		return nil, fmt.Errorf("build download request: %w", err)
	}

	resp, err := c.downloadClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call inference server download: %w", err)
	}

	return resp, nil
}

// GetJobResult retrieves the final result from the inference server for a completed job.
func (c *Client) GetJobResult(ctx context.Context, inferenceJobID string) (*InferenceJobResult, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/api/jobs/"+inferenceJobID, nil)
	if err != nil {
		return nil, fmt.Errorf("build get-job-result request: %w", err)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call inference server get-job: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("inference server returned %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var result InferenceJobResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode job result response: %w", err)
	}

	return &result, nil
}

// WSBaseURL returns the WebSocket base URL derived from the HTTP base URL.
// "http://host" becomes "ws://host", "https://host" becomes "wss://host".
func (c *Client) WSBaseURL() string {
	if strings.HasPrefix(c.baseURL, "https://") {
		return "wss://" + strings.TrimPrefix(c.baseURL, "https://")
	}

	if strings.HasPrefix(c.baseURL, "http://") {
		return "ws://" + strings.TrimPrefix(c.baseURL, "http://")
	}

	return c.baseURL
}

// BBoxFromPolygon extracts [min_lon, min_lat, max_lon, max_lat] from a GeoJSON Polygon JSON blob.
// The polygon is expected to hold a standard GeoJSON {"type":"Polygon","coordinates":[...]} structure.
func BBoxFromPolygon(polygonJSON []byte) ([4]float64, error) {
	var poly struct {
		Coordinates [][][2]float64 `json:"coordinates"`
	}

	if err := json.Unmarshal(polygonJSON, &poly); err != nil {
		return [4]float64{}, fmt.Errorf("parse polygon: %w", err)
	}

	if len(poly.Coordinates) == 0 || len(poly.Coordinates[0]) == 0 {
		return [4]float64{}, fmt.Errorf("polygon has no coordinates")
	}

	ring := poly.Coordinates[0]
	minLon, minLat := ring[0][0], ring[0][1]
	maxLon, maxLat := ring[0][0], ring[0][1]

	for _, coord := range ring {
		lon, lat := coord[0], coord[1]
		if lon < minLon {
			minLon = lon
		}
		if lat < minLat {
			minLat = lat
		}
		if lon > maxLon {
			maxLon = lon
		}
		if lat > maxLat {
			maxLat = lat
		}
	}

	return [4]float64{minLon, minLat, maxLon, maxLat}, nil
}
