// Package database wraps Supabase Storage operations used by backend services.
package database

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/Hammadullah2/Roadlytics/backend/lib/config"
	storage "github.com/supabase-community/storage-go"
)

const storageAPIPath = "/storage/v1"

// StorageClient wraps service-role Supabase storage operations.
type StorageClient struct {
	baseURL string
	apiKey  string
}

// NewStorageClient creates a storage wrapper from application config.
func NewStorageClient(cfg *config.Config) (*StorageClient, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is required")
	}

	baseURL := strings.TrimRight(strings.TrimSpace(cfg.SupabaseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("SUPABASE_URL is required")
	}

	apiKey := strings.TrimSpace(cfg.SupabaseServiceRoleKey)
	if apiKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_ROLE_KEY is required")
	}

	return &StorageClient{
		baseURL: baseURL,
		apiKey:  apiKey,
	}, nil
}

// UploadFile uploads a file to Supabase Storage for FileIngestor (IngestionSvc).
func (s *StorageClient) UploadFile(bucket string, path string, data []byte, contentType string) (string, error) {
	if s == nil {
		return "", fmt.Errorf("storage client is not initialized")
	}

	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return "", fmt.Errorf("bucket is required")
	}

	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("path is required")
	}

	contentType = strings.TrimSpace(contentType)
	if contentType == "" {
		return "", fmt.Errorf("contentType is required")
	}

	options := storage.FileOptions{
		ContentType: &contentType,
	}

	if _, err := s.storage().UploadFile(bucket, path, bytes.NewReader(data), options); err != nil {
		return "", fmt.Errorf("upload file to bucket %q at path %q: %w", bucket, path, err)
	}

	return path, nil
}

// GetSignedURL creates a time-limited download URL for ReportSvc.
func (s *StorageClient) GetSignedURL(bucket string, path string, expiresIn int) (string, error) {
	if s == nil {
		return "", fmt.Errorf("storage client is not initialized")
	}

	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return "", fmt.Errorf("bucket is required")
	}

	path = strings.TrimSpace(path)
	if path == "" {
		return "", fmt.Errorf("path is required")
	}

	if expiresIn <= 0 {
		return "", fmt.Errorf("expiresIn must be greater than zero")
	}

	response, err := s.storage().CreateSignedUrl(bucket, path, expiresIn)
	if err != nil {
		return "", fmt.Errorf("create signed URL for bucket %q at path %q: %w", bucket, path, err)
	}

	if strings.TrimSpace(response.SignedURL) == "" {
		return "", fmt.Errorf("create signed URL for bucket %q at path %q: empty signed URL returned", bucket, path)
	}

	return response.SignedURL, nil
}

// DeleteFile removes a file from Supabase Storage for cleanup routines.
func (s *StorageClient) DeleteFile(bucket string, path string) error {
	if s == nil {
		return fmt.Errorf("storage client is not initialized")
	}

	bucket = strings.TrimSpace(bucket)
	if bucket == "" {
		return fmt.Errorf("bucket is required")
	}

	path = strings.TrimSpace(path)
	if path == "" {
		return fmt.Errorf("path is required")
	}

	if _, err := s.storage().RemoveFile(bucket, []string{path}); err != nil {
		return fmt.Errorf("delete file from bucket %q at path %q: %w", bucket, path, err)
	}

	return nil
}

func (s *StorageClient) storage() *storage.Client {
	return storage.NewClient(s.baseURL+storageAPIPath, s.apiKey, map[string]string{
		"apikey": s.apiKey,
	})
}
