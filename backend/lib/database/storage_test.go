// Package database tests Supabase Storage upload, signing, and deletion flows.
package database

import (
	"fmt"
	"net/url"
	"strings"
	"testing"
	"time"
)

const storageTestBucket = "satellite-images"

func TestStorageClient_UploadFile(t *testing.T) {
	client := newLiveStorageClient(t)
	path := newStorageTestPath()

	t.Cleanup(func() {
		_ = client.DeleteFile(storageTestBucket, path)
	})

	returnedPath, err := client.UploadFile(storageTestBucket, path, []byte("road-quality-storage-upload"), "text/plain")
	if err != nil {
		t.Fatalf("UploadFile() error = %v", err)
	}

	if returnedPath != path {
		t.Fatalf("UploadFile() path = %q, want %q", returnedPath, path)
	}
}

func TestStorageClient_GetSignedURL(t *testing.T) {
	client := newLiveStorageClient(t)
	path := newStorageTestPath()

	if _, err := client.UploadFile(storageTestBucket, path, []byte("road-quality-storage-sign"), "text/plain"); err != nil {
		t.Fatalf("UploadFile() setup error = %v", err)
	}

	t.Cleanup(func() {
		_ = client.DeleteFile(storageTestBucket, path)
	})

	signedURL, err := client.GetSignedURL(storageTestBucket, path, 60)
	if err != nil {
		t.Fatalf("GetSignedURL() error = %v", err)
	}

	parsedURL, err := url.Parse(signedURL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		t.Fatalf("signed URL %q is not absolute", signedURL)
	}
}

func TestStorageClient_DeleteFile(t *testing.T) {
	client := newLiveStorageClient(t)
	path := newStorageTestPath()

	if _, err := client.UploadFile(storageTestBucket, path, []byte("road-quality-storage-delete"), "text/plain"); err != nil {
		t.Fatalf("UploadFile() setup error = %v", err)
	}

	if err := client.DeleteFile(storageTestBucket, path); err != nil {
		t.Fatalf("DeleteFile() error = %v", err)
	}
}

func newLiveStorageClient(t *testing.T) *StorageClient {
	t.Helper()

	cfg := newLiveDatabaseConfig(t)

	storageClient, err := NewStorageClient(cfg)
	if err != nil {
		t.Fatalf("NewStorageClient() error = %v", err)
	}

	return storageClient
}

func newStorageTestPath() string {
	return strings.Join([]string{
		"health-tests",
		fmt.Sprintf("storage-%d.txt", time.Now().UnixNano()),
	}, "/")
}
