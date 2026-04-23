// Package websocket implements room-based WebSocket broadcasting for live job updates.
package websocket

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1024
)

// Message represents a realtime job event delivered over WebSocket.
type Message struct {
	JobID    string `json:"job_id"`
	Type     string `json:"type"`
	Progress int    `json:"progress"`
	Status   string `json:"status"`
	Stage    string `json:"stage"`
	Payload  any    `json:"payload,omitempty"`
}

// Client represents a single WebSocket client subscribed to one job room.
type Client struct {
	hub   *Hub
	conn  *websocket.Conn
	send  chan []byte
	jobID string
}

// Hub coordinates room-scoped WebSocket clients and broadcasts.
type Hub struct {
	clients    map[string]map[*Client]bool
	broadcast  chan Message
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	logger     *slog.Logger
}

// NewHub creates a WebSocket hub with buffered channels for job updates.
func NewHub(logger *slog.Logger) *Hub {
	return &Hub{
		clients:    make(map[string]map[*Client]bool),
		broadcast:  make(chan Message, 256),
		register:   make(chan *Client, 128),
		unregister: make(chan *Client, 128),
		logger:     logger,
	}
}

// Run starts the hub event loop and must be executed in a goroutine.
func (h *Hub) Run() {
	defer func() {
		if recovered := recover(); recovered != nil {
			h.logError("websocket hub panicked", "panic", recovered)
		}
	}()

	for {
		select {
		case client := <-h.register:
			if client == nil {
				continue
			}

			h.registerClient(client)
		case client := <-h.unregister:
			if client == nil {
				continue
			}

			h.unregisterClient(client)
		case message := <-h.broadcast:
			if message.JobID == "" {
				h.logWarn("dropping websocket message without job room")
				continue
			}

			h.broadcastMessage(message)
		}
	}
}

// RegisterClient creates and registers a client for a specific job room.
func (h *Hub) RegisterClient(conn *websocket.Conn, jobID string) *Client {
	client := &Client{
		hub:   h,
		conn:  conn,
		send:  make(chan []byte, 256),
		jobID: jobID,
	}

	h.register <- client

	return client
}

// BroadcastToJob queues a message for every client subscribed to a job room.
func (h *Hub) BroadcastToJob(jobID string, message Message) {
	message.JobID = jobID

	select {
	case h.broadcast <- message:
	default:
		h.logWarn("dropping websocket broadcast because the queue is full", "job_id", jobID, "type", message.Type)
	}
}

// QueueMessage sends an already-serialized message to a single client.
func (c *Client) QueueMessage(message Message) error {
	payload, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("marshal websocket message: %w", err)
	}

	select {
	case c.send <- payload:
		return nil
	default:
		return fmt.Errorf("client send buffer is full")
	}
}

// ReadPump drains inbound frames and unregisters the client when the socket closes.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

// WritePump flushes queued outbound frames and keeps the socket alive with pings.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, nil)
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) registerClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.clients[client.jobID]; !ok {
		h.clients[client.jobID] = make(map[*Client]bool)
	}

	h.clients[client.jobID][client] = true
	h.logDebug("websocket client registered", "job_id", client.jobID, "room_size", len(h.clients[client.jobID]))
}

func (h *Hub) unregisterClient(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	roomClients, ok := h.clients[client.jobID]
	if !ok {
		return
	}

	if _, exists := roomClients[client]; !exists {
		return
	}

	delete(roomClients, client)
	close(client.send)

	if len(roomClients) == 0 {
		delete(h.clients, client.jobID)
	}

	h.logDebug("websocket client unregistered", "job_id", client.jobID)
}

func (h *Hub) broadcastMessage(message Message) {
	payload, err := json.Marshal(message)
	if err != nil {
		h.logError("failed to marshal websocket broadcast", "job_id", message.JobID, "error", err)
		return
	}

	targets := h.roomClients(message.JobID)
	for _, client := range targets {
		select {
		case client.send <- payload:
		default:
			h.unregisterClient(client)
		}
	}
}

func (h *Hub) roomClients(jobID string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	roomClients, ok := h.clients[jobID]
	if !ok {
		return nil
	}

	targets := make([]*Client, 0, len(roomClients))
	for client := range roomClients {
		targets = append(targets, client)
	}

	return targets
}

func (h *Hub) logDebug(message string, args ...any) {
	if h.logger == nil {
		return
	}

	h.logger.Debug(message, args...)
}

func (h *Hub) logWarn(message string, args ...any) {
	if h.logger == nil {
		return
	}

	h.logger.Warn(message, args...)
}

func (h *Hub) logError(message string, args ...any) {
	if h.logger == nil {
		return
	}

	h.logger.Error(message, args...)
}
