// Package middleware provides HTTP middleware for authentication and authorization.
package middleware

import (
	"net/http"
	"strings"
)

// CORS configures Cross-Origin Resource Sharing for the frontend applications.
func CORS(frontendURL string) func(http.Handler) http.Handler {
	allowedOrigins := AllowedOrigins(frontendURL)

	const allowMethods = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
	const allowHeaders = "Authorization, Content-Type"

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			if _, ok := allowedOrigins[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Add("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", allowMethods)
				w.Header().Set("Access-Control-Allow-Headers", allowHeaders)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
