package validator

import (
	"fmt"
	"strings"
)

// Errors collects validation error messages.
type Errors map[string]string

func (e Errors) Error() string {
	parts := make([]string, 0, len(e))
	for field, msg := range e {
		parts = append(parts, fmt.Sprintf("%s: %s", field, msg))
	}
	return strings.Join(parts, "; ")
}

// HasErrors returns true if any validation errors exist.
func (e Errors) HasErrors() bool {
	return len(e) > 0
}

// RequireString checks that a string field is non-empty.
func RequireString(errs Errors, field, value string) {
	if strings.TrimSpace(value) == "" {
		errs[field] = "is required"
	}
}

// MaxLength checks that a string does not exceed max length.
func MaxLength(errs Errors, field, value string, max int) {
	if len(value) > max {
		errs[field] = fmt.Sprintf("must be at most %d characters", max)
	}
}
