package aistats

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProviderAndUsageHelpersReturnPayloads(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/providers":
			if r.URL.Query().Get("limit") != "2" {
				t.Fatalf("unexpected providers query params: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"ok":true,"providers":[{"provider_id":"openai","name":"OpenAI"}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/credits":
			if r.URL.Query().Get("team_id") != "team_123" {
				t.Fatalf("unexpected credits query params: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"ok":true,"credits":{"balance_usd":42.5}}`))
		case r.Method == http.MethodGet && r.URL.Path == "/activity":
			if r.URL.Query().Get("days") != "30" {
				t.Fatalf("unexpected activity query params: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"ok":true,"total":1,"activity":[{"request_id":"req_123"}]}`))
		case r.Method == http.MethodGet && r.URL.Path == "/analytics":
			if r.URL.Query().Get("date") != "2026-05-01" {
				t.Fatalf("unexpected analytics query params: %s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"data":[{"date":"2026-05-01","endpoint_id":"responses","requests":12}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))

	providers, err := client.ListProviders(context.Background(), map[string]string{"limit": "2"})
	if err != nil {
		t.Fatalf("ListProviders failed: %v", err)
	}
	credits, err := client.GetCredits(context.Background(), map[string]string{"team_id": "team_123"})
	if err != nil {
		t.Fatalf("GetCredits failed: %v", err)
	}
	activity, err := client.GetActivity(context.Background(), map[string]string{"days": "30"})
	if err != nil {
		t.Fatalf("GetActivity failed: %v", err)
	}
	analytics, err := client.GetAnalytics(context.Background(), map[string]string{"date": "2026-05-01"})
	if err != nil {
		t.Fatalf("GetAnalytics failed: %v", err)
	}

	if providers["providers"].([]interface{})[0].(map[string]interface{})["provider_id"] != "openai" {
		t.Fatalf("unexpected providers payload: %#v", providers)
	}
	if credits["credits"].(map[string]interface{})["balance_usd"] != 42.5 {
		t.Fatalf("unexpected credits payload: %#v", credits)
	}
	if activity["activity"].([]interface{})[0].(map[string]interface{})["request_id"] != "req_123" {
		t.Fatalf("unexpected activity payload: %#v", activity)
	}
	if analytics["data"].([]interface{})[0].(map[string]interface{})["endpoint_id"] != "responses" {
		t.Fatalf("unexpected analytics payload: %#v", analytics)
	}
}
