package phaseo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateBatchReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/batches" {
			http.NotFound(w, r)
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if body["input_file_id"] != "file_123" {
			t.Fatalf("expected input_file_id in request body, got %#v", body["input_file_id"])
		}
		if body["session_id"] != "session_go_batch_1" {
			t.Fatalf("expected session_id in request body, got %#v", body["session_id"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"batch_123","status":"validating","provider":"openai","request_id":"req_go_batch_1","session_id":"session_go_batch_1","pricing_lines":[{"provider":"openai","cost_usd":0.03}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.CreateBatch(context.Background(), map[string]any{
		"input_file_id":      "file_123",
		"endpoint":           "/v1/responses",
		"completion_window":  "24h",
		"session_id":         "session_go_batch_1",
	})
	if err != nil {
		t.Fatalf("CreateBatch failed: %v", err)
	}

	body, ok := response.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map response, got %T", response)
	}
	if body["id"] != "batch_123" {
		t.Fatalf("expected batch id, got %#v", body["id"])
	}
	if body["status"] != "validating" {
		t.Fatalf("expected validating status, got %#v", body["status"])
	}
	if body["provider"] != "openai" {
		t.Fatalf("expected provider, got %#v", body["provider"])
	}
	if body["request_id"] != "req_go_batch_1" {
		t.Fatalf("expected request_id, got %#v", body["request_id"])
	}
	if body["session_id"] != "session_go_batch_1" {
		t.Fatalf("expected session_id, got %#v", body["session_id"])
	}
	if body["pricing_lines"] == nil {
		t.Fatalf("expected pricing_lines to be preserved")
	}
}

func TestRetrieveBatchReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/batches/batch_123" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"batch_123","status":"completed","provider":"openai","request_id":"req_go_batch_2","session_id":"session_go_batch_1","request_counts":{"total":4,"completed":3,"failed":1},"billing":{"charged":true,"cost_usd":0.12}}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.RetrieveBatch(context.Background(), "batch_123")
	if err != nil {
		t.Fatalf("RetrieveBatch failed: %v", err)
	}

	body, ok := response.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map response, got %T", response)
	}
	if body["id"] != "batch_123" {
		t.Fatalf("expected batch id, got %#v", body["id"])
	}
	if body["status"] != "completed" {
		t.Fatalf("expected completed status, got %#v", body["status"])
	}
	if body["provider"] != "openai" {
		t.Fatalf("expected provider, got %#v", body["provider"])
	}
	if body["request_id"] != "req_go_batch_2" {
		t.Fatalf("expected request_id, got %#v", body["request_id"])
	}
	if body["session_id"] != "session_go_batch_1" {
		t.Fatalf("expected session_id, got %#v", body["session_id"])
	}
	if body["request_counts"] == nil {
		t.Fatalf("expected request_counts to be preserved")
	}
	if body["billing"] == nil {
		t.Fatalf("expected billing to be preserved")
	}
}

func TestCancelBatchReturnsPayload(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/batches/batch_123/cancel" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"batch_123","status":"cancelling"}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.CancelBatch(context.Background(), "batch_123")
	if err != nil {
		t.Fatalf("CancelBatch failed: %v", err)
	}

	body, ok := response.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map response, got %T", response)
	}
	if body["id"] != "batch_123" {
		t.Fatalf("expected batch id, got %#v", body["id"])
	}
	if body["status"] != "cancelling" {
		t.Fatalf("expected cancelling status, got %#v", body["status"])
	}
}

func TestGetBatchWebSocketURLBuildsExpectedURL(t *testing.T) {
	closeOnTerminal := false
	client := New("test", "https://api.phaseo.app/v1/", WithDeprecationWarnings(false))

	url, err := client.GetBatchWebSocketURL("batch_123", &AsyncJobWebSocketOptions{
		IntervalMS:      1500,
		CloseOnTerminal: &closeOnTerminal,
	})
	if err != nil {
		t.Fatalf("GetBatchWebSocketURL failed: %v", err)
	}

	expected := "wss://api.phaseo.app/v1/async/batch/batch_123/ws?close_on_terminal=false&interval_ms=1500"
	if url != expected {
		t.Fatalf("unexpected websocket URL: %q", url)
	}
}

func TestGetAsyncJobWebSocketURLBuildsExpectedURL(t *testing.T) {
	closeOnTerminal := false
	client := New("test", "https://api.phaseo.app/v1/", WithDeprecationWarnings(false))

	url, err := client.GetAsyncJobWebSocketURL("video", "video 123", &AsyncJobWebSocketOptions{
		IntervalMS:      1500,
		CloseOnTerminal: &closeOnTerminal,
	})
	if err != nil {
		t.Fatalf("GetAsyncJobWebSocketURL failed: %v", err)
	}

	expected := "wss://api.phaseo.app/v1/async/video/video%20123/ws?close_on_terminal=false&interval_ms=1500"
	if url != expected {
		t.Fatalf("unexpected websocket URL: %q", url)
	}
}
