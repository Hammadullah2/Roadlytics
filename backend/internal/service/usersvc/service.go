// Package usersvc implements profile and user-approval operations.
package usersvc

import (
	"context"
	"fmt"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
)

// UserService defines the user-related business operations used by handlers.
type UserService interface {
	RegisterProfile(ctx context.Context, profile *models.Profile) (*models.Profile, error)
	GetProfile(ctx context.Context, userID string) (*models.Profile, error)
	UpdateProfile(ctx context.Context, userID, fullName string) (*models.Profile, error)
	ListPendingUsers(ctx context.Context) ([]*models.Profile, error)
	ListAll(ctx context.Context) ([]*models.Profile, error)
	ApproveUser(ctx context.Context, targetID string) error
	RejectUser(ctx context.Context, targetID string) error
}

// Service handles user profile and admin operations.
type Service struct {
	users repository.UserRepository
}

// New creates a user service from a user repository dependency.
func New(users repository.UserRepository) UserService {
	return &Service{users: users}
}

// RegisterProfile creates or refreshes a profile row after Supabase Auth signup.
func (s *Service) RegisterProfile(ctx context.Context, profile *models.Profile) (*models.Profile, error) {
	if profile == nil {
		return nil, fmt.Errorf("profile is required")
	}

	if profile.ID == "" {
		return nil, fmt.Errorf("profile id is required")
	}

	if profile.FullName == "" {
		return nil, fmt.Errorf("full_name is required")
	}

	created, err := s.users.Create(ctx, profile)
	if err != nil {
		return nil, fmt.Errorf("register profile: %w", err)
	}

	return created, nil
}

// GetProfile returns the current user's profile.
func (s *Service) GetProfile(ctx context.Context, userID string) (*models.Profile, error) {
	profile, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get profile %q: %w", userID, err)
	}

	return profile, nil
}

// UpdateProfile updates the current user's display name.
func (s *Service) UpdateProfile(ctx context.Context, userID, fullName string) (*models.Profile, error) {
	if fullName == "" {
		return nil, fmt.Errorf("full_name is required")
	}

	profile, err := s.users.UpdateProfile(ctx, userID, fullName)
	if err != nil {
		return nil, fmt.Errorf("update profile %q: %w", userID, err)
	}

	return profile, nil
}

// ListPendingUsers returns all users waiting for admin approval.
func (s *Service) ListPendingUsers(ctx context.Context) ([]*models.Profile, error) {
	profiles, err := s.users.ListPending(ctx)
	if err != nil {
		return nil, fmt.Errorf("list pending users: %w", err)
	}

	return profiles, nil
}

// ListAll returns all profiles for admin views.
func (s *Service) ListAll(ctx context.Context) ([]*models.Profile, error) {
	profiles, err := s.users.ListAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("list all users: %w", err)
	}

	return profiles, nil
}

// ApproveUser marks a pending user as approved.
func (s *Service) ApproveUser(ctx context.Context, targetID string) error {
	profile, err := s.users.GetByID(ctx, targetID)
	if err != nil {
		return fmt.Errorf("load user %q: %w", targetID, err)
	}

	if profile.ApprovalStatus != models.ApprovalPending {
		return fmt.Errorf("user is already %s", profile.ApprovalStatus)
	}

	if err := s.users.UpdateApprovalStatus(ctx, targetID, models.ApprovalApproved); err != nil {
		return fmt.Errorf("approve user %q: %w", targetID, err)
	}

	return nil
}

// RejectUser marks a pending user as rejected.
func (s *Service) RejectUser(ctx context.Context, targetID string) error {
	profile, err := s.users.GetByID(ctx, targetID)
	if err != nil {
		return fmt.Errorf("load user %q: %w", targetID, err)
	}

	if profile.ApprovalStatus != models.ApprovalPending {
		return fmt.Errorf("user is already %s", profile.ApprovalStatus)
	}

	if err := s.users.UpdateApprovalStatus(ctx, targetID, models.ApprovalRejected); err != nil {
		return fmt.Errorf("reject user %q: %w", targetID, err)
	}

	return nil
}
