package aistats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRetrieveVideoContentReturnsBytes(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/videos/video_123/content" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "video/mp4")
		_, _ = w.Write([]byte("video-bytes"))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	content, err := client.RetrieveVideoContent(context.Background(), "video_123")
	if err != nil {
		t.Fatalf("RetrieveVideoContent failed: %v", err)
	}
	if string(content) != "video-bytes" {
		t.Fatalf("unexpected video content: %q", string(content))
	}
}

func TestGetVideoDownloadURLReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/videos/video_123/download_url" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"download_url":"https://cdn.example.test/video.mp4","expires_at":1723000000}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.GetVideoDownloadURL(context.Background(), "video_123", map[string]any{
		"disposition": "attachment",
	})
	if err != nil {
		t.Fatalf("GetVideoDownloadURL failed: %v", err)
	}
	if response["download_url"] != "https://cdn.example.test/video.mp4" {
		t.Fatalf("unexpected download_url: %#v", response["download_url"])
	}
	if response["expires_at"] != float64(1723000000) {
		t.Fatalf("unexpected expires_at: %#v", response["expires_at"])
	}
}

func TestVideoLifecycleHelpersReturnPayloads(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/gateway/models":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"model_id":"google/veo-3","status":"active"}]}`))
		case r.Method == http.MethodPost && r.URL.Path == "/videos":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode create video body: %v", err)
			}
			if body["model"] != "google/veo-3" {
				t.Fatalf("unexpected model: %#v", body["model"])
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"video_123","object":"video","status":"queued","provider":"google","request_id":"req_go_video_1","session_id":"session_go_video_1","pricing_lines":[{"dimension":"video_seconds","units":8}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/videos/video_123":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"video_123","object":"video","status":"completed","provider":"google","request_id":"req_go_video_1","session_id":"session_go_video_1","pricing_lines":[{"dimension":"video_seconds","units":8}]}`))
		case r.Method == http.MethodPost && r.URL.Path == "/videos/video_123/cancel":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"video_123","object":"video","status":"cancelled"}`))
		case r.Method == http.MethodDelete && r.URL.Path == "/videos/video_123":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"id":"video_123","object":"video","deleted":true}`))
		case r.Method == http.MethodGet && r.URL.Path == "/videos":
			if r.URL.Query().Get("status") != "queued,completed" {
				t.Fatalf("unexpected video list status filter: %#v", r.URL.Query().Get("status"))
			}
			if r.URL.Query().Get("limit") != "2" {
				t.Fatalf("unexpected video list limit: %#v", r.URL.Query().Get("limit"))
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"video_123","status":"queued"},{"id":"video_456","status":"completed"}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/videos/models":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"object":"list","data":[{"id":"google/veo-3"}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))

	created, err := client.CreateVideo(context.Background(), map[string]any{
		"model":  "google/veo-3",
		"prompt": "orbiting camera shot",
	})
	if err != nil {
		t.Fatalf("CreateVideo failed: %v", err)
	}
	if created["status"] != "queued" {
		t.Fatalf("unexpected create status: %#v", created["status"])
	}
	if created["provider"] != "google" || created["request_id"] != "req_go_video_1" || created["session_id"] != "session_go_video_1" {
		t.Fatalf("unexpected create metadata: %#v", created)
	}
	if pricingLines, ok := created["pricing_lines"].([]any); !ok || len(pricingLines) != 1 {
		t.Fatalf("unexpected create pricing_lines: %#v", created["pricing_lines"])
	}

	retrieved, err := client.GetVideo(context.Background(), "video_123")
	if err != nil {
		t.Fatalf("GetVideo failed: %v", err)
	}
	if retrieved["status"] != "completed" {
		t.Fatalf("unexpected retrieved status: %#v", retrieved["status"])
	}
	if retrieved["provider"] != "google" || retrieved["request_id"] != "req_go_video_1" || retrieved["session_id"] != "session_go_video_1" {
		t.Fatalf("unexpected retrieved metadata: %#v", retrieved)
	}

	cancelled, err := client.CancelVideo(context.Background(), "video_123")
	if err != nil {
		t.Fatalf("CancelVideo failed: %v", err)
	}
	if cancelled["status"] != "cancelled" {
		t.Fatalf("unexpected cancel status: %#v", cancelled["status"])
	}

	deleted, err := client.DeleteVideo(context.Background(), "video_123")
	if err != nil {
		t.Fatalf("DeleteVideo failed: %v", err)
	}
	if deleted["deleted"] != true {
		t.Fatalf("unexpected delete response: %#v", deleted["deleted"])
	}

	models, err := client.ListVideoModels(context.Background())
	if err != nil {
		t.Fatalf("ListVideoModels failed: %v", err)
	}
	data, ok := models["data"].([]any)
	if !ok || len(data) != 1 {
		t.Fatalf("unexpected video models data: %#v", models["data"])
	}

	videoList, err := client.ListVideos(context.Background(), map[string]string{
		"status": "queued,completed",
		"limit":  "2",
	})
	if err != nil {
		t.Fatalf("ListVideos failed: %v", err)
	}
	videoData, ok := videoList["data"].([]any)
	if !ok || len(videoData) != 2 {
		t.Fatalf("unexpected video list data: %#v", videoList["data"])
	}
}

func TestGetVideoWebSocketURLBuildsExpectedURL(t *testing.T) {
	client := New("test", "http://localhost:8787/v1", WithDeprecationWarnings(false))

	url, err := client.GetVideoWebSocketURL("video_123", &AsyncJobWebSocketOptions{
		IntervalMS: 900,
	})
	if err != nil {
		t.Fatalf("GetVideoWebSocketURL failed: %v", err)
	}

	expected := "ws://localhost:8787/v1/async/video/video_123/ws?interval_ms=900"
	if url != expected {
		t.Fatalf("unexpected websocket URL: %q", url)
	}
}
