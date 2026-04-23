// Package middleware tests JWT authentication and approval-role guards.
package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/config"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
)

func TestAuthMiddleware_RequireAuthRejectsInvalidRequests(t *testing.T) {
	auth := newTestAuthMiddleware(t, &mockUserRepository{})

	testCases := []struct {
		name   string
		header string
	}{
		{
			name: "missing authorization header",
		},
		{
			name:   "malformed JWT",
			header: "Bearer not-a-jwt",
		},
		{
			name:   "expired JWT",
			header: "Bearer " + signedTestToken(t, "test-secret", "user-1", "user@example.com", models.RoleUser, time.Now().Add(-time.Hour)),
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			nextCalled := false
			handler := auth.RequireAuth()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				nextCalled = true
				w.WriteHeader(http.StatusOK)
			}))

			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}

			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, req)

			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}

			if nextCalled {
				t.Fatal("next handler was called for an unauthorized request")
			}
		})
	}
}

func TestRequireApproved_RejectsUnapprovedUser(t *testing.T) {
	repo := &mockUserRepository{
		profilesByID: map[string]*models.Profile{
			"user-1": {
				ID:             "user-1",
				Email:          "user@example.com",
				FullName:       "Pending User",
				Role:           models.RoleUser,
				ApprovalStatus: models.ApprovalPending,
			},
		},
	}

	auth := newTestAuthMiddleware(t, repo)
	handler := auth.RequireAuth()(RequireApproved(auth)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	req := httptest.NewRequest(http.MethodGet, "/approved", nil)
	req.Header.Set("Authorization", "Bearer "+signedTestToken(t, "test-secret", "user-1", "user@example.com", models.RoleUser, time.Now().Add(time.Hour)))

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestRequireAdmin_RejectsNonAdminUser(t *testing.T) {
	repo := &mockUserRepository{
		profilesByID: map[string]*models.Profile{
			"user-1": {
				ID:             "user-1",
				Email:          "user@example.com",
				FullName:       "Approved User",
				Role:           models.RoleUser,
				ApprovalStatus: models.ApprovalApproved,
			},
		},
	}

	auth := newTestAuthMiddleware(t, repo)
	handler := auth.RequireAuth()(RequireAdmin(auth)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+signedTestToken(t, "test-secret", "user-1", "user@example.com", models.RoleUser, time.Now().Add(time.Hour)))

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
}

func TestRequireAdmin_AllowsAdminProfileWithStandardSupabaseTokenRole(t *testing.T) {
	repo := &mockUserRepository{
		profilesByID: map[string]*models.Profile{
			"user-1": {
				ID:             "user-1",
				Email:          "admin@example.com",
				FullName:       "Admin User",
				Role:           models.RoleAdmin,
				ApprovalStatus: models.ApprovalApproved,
			},
		},
	}

	auth := newTestAuthMiddleware(t, repo)
	nextCalled := false
	handler := auth.RequireAuth()(RequireAdmin(auth)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		w.WriteHeader(http.StatusOK)
	})))

	req := httptest.NewRequest(http.MethodGet, "/admin", nil)
	req.Header.Set("Authorization", "Bearer "+signedTestToken(t, "test-secret", "user-1", "admin@example.com", "authenticated", time.Now().Add(time.Hour)))

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}

	if !nextCalled {
		t.Fatal("next handler was not called for an approved admin user")
	}
}

func TestAuthMiddleware_RequireAuthFallsBackToSupabaseVerification(t *testing.T) {
	supabaseServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/user" {
			http.NotFound(w, r)
			return
		}

		if got := r.Header.Get("Authorization"); got != "Bearer remote-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		if got := r.Header.Get("apikey"); got != "anon-key" {
			http.Error(w, "missing apikey", http.StatusUnauthorized)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"id":    "user-remote",
			"email": "remote@example.com",
			"role":  models.RoleUser,
		})
	}))
	defer supabaseServer.Close()

	auth, err := NewAuthMiddleware(&config.Config{
		SupabaseJWTSecret: "test-secret",
		SupabaseURL:       supabaseServer.URL,
		SupabaseAnonKey:   "anon-key",
	}, &mockUserRepository{})
	if err != nil {
		t.Fatalf("NewAuthMiddleware() error = %v", err)
	}

	handler := auth.RequireAuth()(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		identity, ok := IdentityFromContext(r.Context())
		if !ok {
			t.Fatal("identity missing from context")
		}

		if identity.UserID != "user-remote" {
			t.Fatalf("identity.UserID = %q, want %q", identity.UserID, "user-remote")
		}

		if identity.Email != "remote@example.com" {
			t.Fatalf("identity.Email = %q, want %q", identity.Email, "remote@example.com")
		}

		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer remote-token")

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
}

func newTestAuthMiddleware(t *testing.T, repo *mockUserRepository) *AuthMiddleware {
	t.Helper()

	auth, err := NewAuthMiddleware(&config.Config{
		SupabaseJWTSecret: "test-secret",
	}, repo)
	if err != nil {
		t.Fatalf("NewAuthMiddleware() error = %v", err)
	}

	return auth
}

func signedTestToken(
	t *testing.T,
	secret string,
	userID string,
	email string,
	role string,
	expiresAt time.Time,
) string {
	t.Helper()

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, tokenClaims{
		Email: email,
		Role:  role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})

	signedToken, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("SignedString() error = %v", err)
	}

	return signedToken
}

type mockUserRepository struct {
	profilesByID map[string]*models.Profile
}

func (m *mockUserRepository) GetByID(_ context.Context, id string) (*models.Profile, error) {
	if profile, ok := m.profilesByID[id]; ok {
		return profile, nil
	}

	return nil, jwt.ErrTokenInvalidClaims
}

func (m *mockUserRepository) GetByEmail(context.Context, string) (*models.Profile, error) {
	return nil, nil
}

func (m *mockUserRepository) Create(context.Context, *models.Profile) (*models.Profile, error) {
	return nil, nil
}

func (m *mockUserRepository) UpdateProfile(context.Context, string, string) (*models.Profile, error) {
	return nil, nil
}

func (m *mockUserRepository) UpdateApprovalStatus(context.Context, string, string) error {
	return nil
}

func (m *mockUserRepository) ListPending(context.Context) ([]*models.Profile, error) {
	return nil, nil
}

func (m *mockUserRepository) ListAll(context.Context) ([]*models.Profile, error) {
	return nil, nil
}
