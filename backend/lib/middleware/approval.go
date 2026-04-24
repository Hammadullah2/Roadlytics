// Package middleware provides HTTP middleware for authentication and authorization.
package middleware

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/Hammadullah2/Roadlytics/backend/lib/models"
	"github.com/Hammadullah2/Roadlytics/backend/pkg/response"
)

// RequireApproved ensures the authenticated user's profile has been approved by an admin.
func RequireApproved(auth *AuthMiddleware) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if auth == nil {
				response.Error(w, http.StatusInternalServerError, "approval middleware is not configured")
				return
			}

			userID := UserIDFromContext(r.Context())
			if userID == "" {
				response.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}

			profile, err := auth.users.GetByID(r.Context(), userID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					response.Error(w, http.StatusForbidden, "Your account is pending admin approval")
					return
				}

				response.Error(w, http.StatusInternalServerError, "failed to verify account approval")
				return
			}

			if profile.ApprovalStatus != models.ApprovalApproved {
				response.Error(w, http.StatusForbidden, "Your account is pending admin approval")
				return
			}

			identity, ok := IdentityFromContext(r.Context())
			if !ok {
				identity = Identity{}
			}

			identity.UserID = userID
			identity.Role = profile.Role
			identity.Email = profile.Email
			identity.ApprovalStatus = profile.ApprovalStatus

			next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), identity)))
		})
	}
}

// RequireAdmin ensures the authenticated user has the admin role and is approved.
func RequireAdmin(auth *AuthMiddleware) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if auth == nil {
				response.Error(w, http.StatusInternalServerError, "admin middleware is not configured")
				return
			}

			userID := UserIDFromContext(r.Context())
			if userID == "" {
				response.Error(w, http.StatusUnauthorized, "authentication required")
				return
			}

			profile, err := auth.users.GetByID(r.Context(), userID)
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					response.Error(w, http.StatusForbidden, "Admin access required")
					return
				}

				response.Error(w, http.StatusInternalServerError, "failed to verify admin access")
				return
			}

			if profile.ApprovalStatus != models.ApprovalApproved {
				response.Error(w, http.StatusForbidden, "Your account is pending admin approval")
				return
			}

			if profile.Role != models.RoleAdmin {
				response.Error(w, http.StatusForbidden, "Admin access required")
				return
			}

			identity, ok := IdentityFromContext(r.Context())
			if !ok {
				identity = Identity{}
			}

			identity.UserID = userID
			identity.Role = profile.Role
			identity.Email = profile.Email
			identity.ApprovalStatus = profile.ApprovalStatus

			next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), identity)))
		})
	}
}
