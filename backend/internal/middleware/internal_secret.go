// Package middleware provides HTTP middleware for authentication and authorization.
package middleware

import (
	"net/http"
	"strings"

	"github.com/murtazatunio/road-quality-assessment/backend/pkg/response"
)

// InternalSecret protects internal callback routes with a shared secret header.
func InternalSecret(secret string) func(http.Handler) http.Handler {
	expectedSecret := strings.TrimSpace(secret)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if expectedSecret == "" {
				response.Error(w, http.StatusInternalServerError, "internal secret middleware is not configured")
				return
			}

			providedSecret := strings.TrimSpace(r.Header.Get("X-Internal-Secret"))
			if providedSecret == "" || providedSecret != expectedSecret {
				response.Error(w, http.StatusUnauthorized, "invalid internal secret")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
