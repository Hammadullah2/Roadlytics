// Package middleware provides HTTP middleware for authentication and authorization.
package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/murtazatunio/road-quality-assessment/backend/internal/config"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/models"
	"github.com/murtazatunio/road-quality-assessment/backend/internal/repository"
	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

type contextKey string

const identityKey contextKey = "auth_identity"

// Identity stores the authenticated user details placed into request context.
type Identity struct {
	UserID         string `json:"user_id"`
	Role           string `json:"role"`
	Email          string `json:"email,omitempty"`
	ApprovalStatus string `json:"approval_status,omitempty"`
}

type tokenClaims struct {
	Email string `json:"email"`
	Role  string `json:"role"`
	jwt.RegisteredClaims
}

type accessRequirement int

const (
	requireAuth accessRequirement = iota
	requireApproved
	requireAdmin
)

// AuthMiddleware validates Supabase JWTs and profile-based access rules.
type AuthMiddleware struct {
	jwtSecret      []byte
	users          repository.UserRepository
	supabaseURL    string
	supabaseAPIKey string
	httpClient     *http.Client
}

// NewAuthMiddleware creates authentication middleware from application config.
func NewAuthMiddleware(cfg *config.Config, users repository.UserRepository) (*AuthMiddleware, error) {
	if cfg == nil {
		return nil, fmt.Errorf("config is required")
	}

	if users == nil {
		return nil, fmt.Errorf("user repository is required")
	}

	supabaseURL := strings.TrimSpace(cfg.SupabaseURL)
	supabaseAPIKey := strings.TrimSpace(cfg.SupabaseAnonKey)
	if supabaseAPIKey == "" {
		supabaseAPIKey = strings.TrimSpace(cfg.SupabaseServiceRoleKey)
	}

	jwtSecret := strings.TrimSpace(cfg.SupabaseJWTSecret)
	if jwtSecret == "" && (supabaseURL == "" || supabaseAPIKey == "") {
		return nil, fmt.Errorf("either SUPABASE_JWT_SECRET or SUPABASE_URL with a Supabase API key is required")
	}

	return &AuthMiddleware{
		jwtSecret:      []byte(jwtSecret),
		users:          users,
		supabaseURL:    supabaseURL,
		supabaseAPIKey: supabaseAPIKey,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}, nil
}

// RequireAuth validates the Supabase JWT and attaches user identity to context.
func (m *AuthMiddleware) RequireAuth() func(http.Handler) http.Handler {
	return m.require(requireAuth)
}

// RequireApproved validates the JWT and enforces approval_status=approved.
func (m *AuthMiddleware) RequireApproved() func(http.Handler) http.Handler {
	return m.require(requireApproved)
}

// RequireAdmin validates the JWT and enforces role=admin for approved users.
func (m *AuthMiddleware) RequireAdmin() func(http.Handler) http.Handler {
	return m.require(requireAdmin)
}

func (m *AuthMiddleware) require(level accessRequirement) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
			if authHeader == "" {
				if token := strings.TrimSpace(r.URL.Query().Get("token")); token != "" {
					authHeader = "Bearer " + token
				}
			}

			identity, err := m.authenticate(r.Context(), authHeader, level)
			if err != nil {
				m.writeAuthError(w, err)
				return
			}

			next.ServeHTTP(w, r.WithContext(withIdentity(r.Context(), identity)))
		})
	}
}

func (m *AuthMiddleware) authenticate(ctx context.Context, authHeader string, level accessRequirement) (Identity, error) {
	identity, ok := IdentityFromContext(ctx)
	if !ok || strings.TrimSpace(identity.UserID) == "" {
		tokenString, err := bearerToken(authHeader)
		if err != nil {
			return Identity{}, err
		}

		claims, err := m.parseToken(ctx, tokenString)
		if err != nil {
			return Identity{}, err
		}

		identity = Identity{
			UserID: claims.Subject,
			Role:   claims.Role,
			Email:  claims.Email,
		}
	}

	if level == requireAuth {
		return identity, nil
	}

	profile, err := m.users.GetByID(ctx, identity.UserID)
	if err != nil {
		return Identity{}, fmt.Errorf("load profile for %q: %w", identity.UserID, err)
	}

	identity.Role = profile.Role
	identity.ApprovalStatus = profile.ApprovalStatus
	if identity.Email == "" {
		identity.Email = profile.Email
	}

	if profile.ApprovalStatus != models.ApprovalApproved {
		return Identity{}, fmt.Errorf("account is not approved")
	}

	if level == requireAdmin && profile.Role != models.RoleAdmin {
		return Identity{}, fmt.Errorf("admin role required")
	}

	return identity, nil
}

func (m *AuthMiddleware) parseToken(ctx context.Context, tokenString string) (*tokenClaims, error) {
	claims, err := m.parseTokenWithSecret(tokenString)
	if err == nil {
		return claims, nil
	}

	fallbackClaims, fallbackErr := m.parseTokenWithSupabase(ctx, tokenString)
	if fallbackErr == nil {
		return fallbackClaims, nil
	}

	return nil, err
}

func (m *AuthMiddleware) parseTokenWithSecret(tokenString string) (*tokenClaims, error) {
	if len(m.jwtSecret) == 0 {
		return nil, fmt.Errorf("local JWT secret verification is not configured")
	}

	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	claims := &tokenClaims{}

	token, err := parser.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		return m.jwtSecret, nil
	})
	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	if strings.TrimSpace(claims.Subject) == "" {
		return nil, fmt.Errorf("token subject is missing")
	}

	return claims, nil
}

func (m *AuthMiddleware) parseTokenWithSupabase(ctx context.Context, tokenString string) (*tokenClaims, error) {
	if strings.TrimSpace(m.supabaseURL) == "" || strings.TrimSpace(m.supabaseAPIKey) == "" {
		return nil, fmt.Errorf("supabase token verification is not configured")
	}

	if m.httpClient == nil {
		return nil, fmt.Errorf("supabase HTTP client is not configured")
	}

	endpoint := strings.TrimRight(m.supabaseURL, "/") + "/auth/v1/user"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create supabase auth verification request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+tokenString)
	req.Header.Set("apikey", m.supabaseAPIKey)
	req.Header.Set("Accept", "application/json")

	resp, err := m.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("verify token with supabase auth: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("verify token with supabase auth: unexpected status %d", resp.StatusCode)
	}

	var user struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Role  string `json:"role"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("decode supabase auth verification response: %w", err)
	}

	if strings.TrimSpace(user.ID) == "" {
		return nil, fmt.Errorf("supabase auth verification response is missing user id")
	}

	return &tokenClaims{
		Email: user.Email,
		Role:  user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject: user.ID,
		},
	}, nil
}

func (m *AuthMiddleware) writeAuthError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, jwt.ErrTokenExpired):
		response.Error(w, http.StatusUnauthorized, "token is expired")
	case errors.Is(err, jwt.ErrTokenMalformed),
		errors.Is(err, jwt.ErrTokenSignatureInvalid),
		errors.Is(err, jwt.ErrTokenUnverifiable),
		errors.Is(err, jwt.ErrTokenInvalidClaims),
		errors.Is(err, jwt.ErrTokenRequiredClaimMissing):
		response.Error(w, http.StatusUnauthorized, "invalid token")
	case strings.Contains(err.Error(), "authorization"):
		response.Error(w, http.StatusUnauthorized, err.Error())
	case strings.Contains(err.Error(), "approved"),
		strings.Contains(err.Error(), "admin role required"):
		response.Error(w, http.StatusForbidden, err.Error())
	default:
		response.Error(w, http.StatusForbidden, "access denied")
	}
}

func bearerToken(authHeader string) (string, error) {
	authHeader = strings.TrimSpace(authHeader)
	if authHeader == "" {
		return "", fmt.Errorf("authorization header is required")
	}

	parts := strings.Fields(authHeader)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", fmt.Errorf("authorization header must use Bearer token format")
	}

	if parts[1] == "" {
		return "", fmt.Errorf("authorization token is required")
	}

	return parts[1], nil
}

func withIdentity(ctx context.Context, identity Identity) context.Context {
	return context.WithValue(ctx, identityKey, identity)
}

// IdentityFromContext returns the authenticated identity stored in request context.
func IdentityFromContext(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(identityKey).(Identity)
	return identity, ok
}

// UserIDFromContext extracts the authenticated user ID from request context.
func UserIDFromContext(ctx context.Context) string {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return ""
	}

	return identity.UserID
}

// RoleFromContext extracts the authenticated role from request context.
func RoleFromContext(ctx context.Context) string {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return ""
	}

	return identity.Role
}

// EmailFromContext extracts the authenticated email from request context.
func EmailFromContext(ctx context.Context) string {
	identity, ok := IdentityFromContext(ctx)
	if !ok {
		return ""
	}

	return identity.Email
}
