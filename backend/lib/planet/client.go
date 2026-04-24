// Package planet provides a minimal client for the Planet Copernicus Data API.
package planet

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	apiURL   = "https://api.planet.com/data/v1"
	itemType = "Sentinel2L2A"
)

// SceneResult holds a Planet Sentinel-2 scene id and its acquisition date.
type SceneResult struct {
	SceneID   string
	SceneDate string // YYYY-MM-DD
}

// TileURLTemplate returns a Leaflet-compatible URL template for the given scene.
// The backend must proxy requests through its own tile endpoint to keep the API key server-side.
func TileURLTemplate(backendBase, sceneID string) string {
	return fmt.Sprintf("%s/satellite/tiles/%s/{z}/{x}/{y}", backendBase, sceneID)
}

type quickSearchRequest struct {
	ItemTypes []string    `json:"item_types"`
	Filter    interface{} `json:"filter"`
}

type quickSearchFeature struct {
	ID         string                 `json:"id"`
	Properties map[string]interface{} `json:"properties"`
}

type quickSearchResponse struct {
	Features []quickSearchFeature `json:"features"`
}

// SearchBestScene finds the least-cloudy Sentinel-2 L2A scene matching the bbox and date range.
// Returns nil, nil if no scenes are found (not an error — caller should handle gracefully).
func SearchBestScene(
	ctx context.Context,
	apiKey string,
	minLon, minLat, maxLon, maxLat float64,
	startDate, endDate string,
	maxCloudCover float64,
) (*SceneResult, error) {
	payload := quickSearchRequest{
		ItemTypes: []string{itemType},
		Filter: map[string]interface{}{
			"type": "AndFilter",
			"config": []interface{}{
				map[string]interface{}{
					"type":       "GeometryFilter",
					"field_name": "geometry",
					"config": map[string]interface{}{
						"type": "Polygon",
						"coordinates": []interface{}{
							[]interface{}{
								[]float64{minLon, minLat},
								[]float64{maxLon, minLat},
								[]float64{maxLon, maxLat},
								[]float64{minLon, maxLat},
								[]float64{minLon, minLat},
							},
						},
					},
				},
				map[string]interface{}{
					"type":       "DateRangeFilter",
					"field_name": "acquired",
					"config": map[string]interface{}{
						"gte": startDate + "T00:00:00Z",
						"lte": endDate + "T23:59:59Z",
					},
				},
				map[string]interface{}{
					"type":       "RangeFilter",
					"field_name": "cloud_cover",
					"config": map[string]interface{}{
						"lte": maxCloudCover,
					},
				},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("planet: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL+"/quick-search", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("planet: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(apiKey, "")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("planet: quick-search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("planet: quick-search returned HTTP %d", resp.StatusCode)
	}

	var result quickSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("planet: decode response: %w", err)
	}

	if len(result.Features) == 0 {
		return nil, nil
	}

	best := result.Features[0]
	bestCC, _ := best.Properties["cloud_cover"].(float64)
	for _, f := range result.Features[1:] {
		if cc, _ := f.Properties["cloud_cover"].(float64); cc < bestCC {
			best = f
			bestCC = cc
		}
	}

	acquired, _ := best.Properties["acquired"].(string)
	sceneDate := ""
	if len(acquired) >= 10 {
		sceneDate = acquired[:10]
	}

	return &SceneResult{
		SceneID:   best.ID,
		SceneDate: sceneDate,
	}, nil
}
