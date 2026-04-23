// Package models defines the geographic region models for the backend.
package models

import (
	"encoding/json"
	"time"
)

// Region represents a user-defined Area of Interest (AOI) within a project.
// The Polygon field stores a GeoJSON polygon defining the geographic boundary.
type Region struct {
	ID        string          `json:"id" db:"id"`
	ProjectID string          `json:"project_id" db:"project_id"`
	Name      string          `json:"name" db:"name"`
	Polygon   json.RawMessage `json:"polygon" db:"polygon"`
	CreatedAt time.Time       `json:"created_at" db:"created_at"`
}
