package aistats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	gen "github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go/src/gen"
)

func TestGenerateTextPreservesGatewayMetadata(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path == "/gateway/models" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"model_id":"openai/gpt-5-nano","status":"active"}]}`))
			return
		}
		if r.Method != http.MethodPost || r.URL.Path != "/chat/completions" {
			http.NotFound(w, r)
			return
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if body["model"] != "openai/gpt-5-nano" {
			t.Fatalf("expected model in request body, got %#v", body["model"])
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"req_go_chat_1","nativeResponseId":"chatcmpl_go_1","object":"chat.completion","created":1723000000,"model":"openai/gpt-5-nano","provider":"openai","session_id":"session_go_chat_1","upstream_request_id":"upstream_go_chat_1","provider_attempts":[{"provider":"openai","status_code":200,"duration_ms":412}],"pricing_lines":[{"provider":"openai","cost_usd":0.0025}],"usage":{"input_tokens":2,"output_tokens":1,"total_tokens":3},"choices":[{"index":0,"message":{"role":"assistant","content":"hi"},"finish_reason":"stop"}]}`))
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))
	response, err := client.GenerateText(context.Background(), gen.ChatCompletionsRequest{
		Model: "openai/gpt-5-nano",
		Messages: []map[string]interface{}{
			{"role": "user", "content": "hi"},
		},
	})
	if err != nil {
		t.Fatalf("GenerateText failed: %v", err)
	}

	if response["provider"] != "openai" {
		t.Fatalf("expected provider metadata, got %#v", response["provider"])
	}
	if response["nativeResponseId"] != "chatcmpl_go_1" {
		t.Fatalf("expected nativeResponseId metadata, got %#v", response["nativeResponseId"])
	}
	if response["session_id"] != "session_go_chat_1" {
		t.Fatalf("expected session_id metadata, got %#v", response["session_id"])
	}
	if response["upstream_request_id"] != "upstream_go_chat_1" {
		t.Fatalf("expected upstream_request_id metadata, got %#v", response["upstream_request_id"])
	}
	if response["provider_attempts"] == nil {
		t.Fatalf("expected provider_attempts metadata")
	}
	if response["pricing_lines"] == nil {
		t.Fatalf("expected pricing_lines metadata")
	}
	usage, ok := response["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage metadata, got %#v", response["usage"])
	}
	if usage["input_tokens"] != float64(2) || usage["output_tokens"] != float64(1) || usage["total_tokens"] != float64(3) {
		t.Fatalf("unexpected usage payload: %#v", usage)
	}
}
