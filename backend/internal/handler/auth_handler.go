// Package handler exposes HTTP handlers for the backend REST API.
package handler

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/middleware"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/service/usersvc"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

type profileResponse struct {
	ID             string `json:"id"`
	Name           string `json:"name"`
	Email          string `json:"email"`
	Role           string `json:"role"`
	ApprovalStatus string `json:"approval_status"`
	CreatedAt      any    `json:"created_at"`
}

// AuthHandler serves profile registration and profile-management endpoints.
type AuthHandler struct {
	users usersvc.UserService
}

// NewAuthHandler creates an auth handler from the user service dependency.
func NewAuthHandler(users usersvc.UserService) *AuthHandler {
	return &AuthHandler{users: users}
}

// Register creates or refreshes the current user's profile after Supabase signup.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name  string `json:"name"`
		Email string `json:"email"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	userID := middleware.UserIDFromContext(r.Context())
	existingProfile, err := h.users.GetProfile(r.Context(), userID)
	if err == nil && existingProfile != nil {
		response.Error(w, http.StatusConflict, "profile already exists")
		return
	}

	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeServiceError(w, err, "failed to check existing profile")
		return
	}

	profile, err := h.users.RegisterProfile(r.Context(), &models.Profile{
		ID:             userID,
		Email:          middleware.EmailFromContext(r.Context()),
		FullName:       req.Name,
		Role:           models.RoleUser,
		ApprovalStatus: models.ApprovalPending,
	})
	if err != nil {
		writeServiceError(w, err, "failed to register profile")
		return
	}

	writeSuccess(w, http.StatusCreated, toProfileResponse(profile), "profile registered successfully")
}

// GetProfile returns the authenticated user's profile.
func (h *AuthHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	profile, err := h.users.GetProfile(r.Context(), middleware.UserIDFromContext(r.Context()))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			response.Error(w, http.StatusNotFound, "profile not found")
			return
		}

		writeServiceError(w, err, "failed to load profile")
		return
	}

	writeSuccess(w, http.StatusOK, toProfileResponse(profile), "profile loaded successfully")
}

// UpdateProfile updates the authenticated user's profile fields.
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}

	if err := decodeJSON(r, &req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}

	profile, err := h.users.UpdateProfile(r.Context(), middleware.UserIDFromContext(r.Context()), req.Name)
	if err != nil {
		writeServiceError(w, err, "failed to update profile")
		return
	}

	writeSuccess(w, http.StatusOK, toProfileResponse(profile), "profile updated successfully")
}

func toProfileResponse(profile *models.Profile) profileResponse {
	return profileResponse{
		ID:             profile.ID,
		Name:           profile.FullName,
		Email:          profile.Email,
		Role:           profile.Role,
		ApprovalStatus: profile.ApprovalStatus,
		CreatedAt:      profile.CreatedAt,
	}
}
