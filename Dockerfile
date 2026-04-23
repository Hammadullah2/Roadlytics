FROM golang:1.25-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server

FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata wget

WORKDIR /app

COPY --from=builder /server /app/server
COPY database/ /app/database/

EXPOSE 8080

ENV SERVER_PORT=8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/api/v1/health >/dev/null 2>&1 || exit 1

CMD ["/app/server"]
