// Package middleware provides HTTP middleware for authentication and authorization.
package middleware

import (
	"net/url"
	"strings"
)

// AllowedOrigins returns the frontend origins permitted for HTTP and websocket access.
func AllowedOrigins(frontendURL string) map[string]struct{} {
	allowedOrigins := map[string]struct{}{
		"http://localhost:3000": {},
		"http://127.0.0.1:3000": {},
		"http://localhost:5173": {},
		"http://127.0.0.1:5173": {},
	}

	if origin := strings.TrimSpace(frontendURL); origin != "" {
		for _, alias := range loopbackAliases(origin) {
			allowedOrigins[alias] = struct{}{}
		}
	}

	return allowedOrigins
}

func loopbackAliases(origin string) []string {
	parsedOrigin, err := url.Parse(origin)
	if err != nil || parsedOrigin.Scheme == "" || parsedOrigin.Host == "" {
		return []string{origin}
	}

	host := parsedOrigin.Hostname()
	if host != "localhost" && host != "127.0.0.1" {
		return []string{origin}
	}

	port := parsedOrigin.Port()
	aliases := make([]string, 0, 2)
	for _, loopbackHost := range []string{"localhost", "127.0.0.1"} {
		alias := parsedOrigin.Scheme + "://" + loopbackHost
		if port != "" {
			alias += ":" + port
		}
		aliases = append(aliases, alias)
	}

	return aliases
}
