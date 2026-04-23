package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAllowedOriginsIncludesLoopbackAliases(t *testing.T) {
	allowedOrigins := AllowedOrigins("http://localhost:4173")

	testCases := []string{
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost:4173",
		"http://127.0.0.1:4173",
	}

	for _, origin := range testCases {
		if _, ok := allowedOrigins[origin]; !ok {
			t.Fatalf("origin %q not allowed", origin)
		}
	}
}

func TestCORSAllows127001DevOrigin(t *testing.T) {
	handler := CORS("")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/auth/profile", nil)
	req.Header.Set("Origin", "http://127.0.0.1:5173")
	req.Header.Set("Access-Control-Request-Method", http.MethodGet)

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}

	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:5173" {
		t.Fatalf("allow origin = %q, want %q", got, "http://127.0.0.1:5173")
	}
}
