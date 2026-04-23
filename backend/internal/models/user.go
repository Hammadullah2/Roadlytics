// Package models defines the user-related domain models for the backend.
package models

import "time"

// ApprovalStatus enumerates states for admin approval of new users.
const (
	ApprovalPending  = "pending"
	ApprovalApproved = "approved"
	ApprovalRejected = "rejected"
)

// Role enumerates user roles in the system.
const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

// Profile extends Supabase auth.users with app-specific data.
// The ID field matches the Supabase Auth user UUID.
type Profile struct {
	ID             string     `json:"id" db:"id"`
	Email          string     `json:"email,omitempty" db:"email"`
	FullName       string     `json:"full_name" db:"full_name"`
	Role           string     `json:"role" db:"role"`
	ApprovalStatus string     `json:"approval_status" db:"approval_status"`
	ApprovedBy     *string    `json:"approved_by,omitempty" db:"approved_by"`
	ApprovedAt     *time.Time `json:"approved_at,omitempty" db:"approved_at"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
}

// IsApproved checks whether the user has been approved by an admin.
func (p *Profile) IsApproved() bool {
	return p.ApprovalStatus == ApprovalApproved
}

// IsAdmin checks whether the user has the admin role.
func (p *Profile) IsAdmin() bool {
	return p.Role == RoleAdmin
}
