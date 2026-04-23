// Package models defines the project-related domain models for the backend.
package models

import "time"

// Project groups assessment regions under a single workspace for the user.
type Project struct {
	ID          string    `json:"id" db:"id"`
	OwnerID     string    `json:"owner_id" db:"owner_id"`
	Name        string    `json:"name" db:"name"`
	Description string    `json:"description" db:"description"`
	Status      string    `json:"status" db:"status"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

const (
	ProjectStatusActive   = "active"
	ProjectStatusArchived = "archived"
)
