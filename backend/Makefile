.PHONY: test test-unit test-integration test-coverage health

test:
	go test ./... -v -timeout 30s

test-unit:
	go test ./internal/... -v -timeout 30s

test-integration:
	go test ./cmd/... -v -timeout 60s

test-coverage:
	go test ./... -coverprofile=coverage.out
	go tool cover -html=coverage.out -o coverage.html

health:
	go run scripts/healthcheck.go
