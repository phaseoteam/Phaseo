package client

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestDoSendsPhaseoHeadersAndDecodesResponse(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/workspaces/workspace-1" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected authorization: %s", got)
		}
		if got := r.Header.Get("User-Agent"); got != "terraform-provider-phaseo/1.2.3" {
			t.Fatalf("unexpected user agent: %s", got)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"id":"workspace-1"}}`))
	}))
	defer server.Close()

	apiClient, err := New("test-key", server.URL+"/v1", "1.2.3", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	var response struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := apiClient.Do(context.Background(), http.MethodGet, "workspaces/workspace-1", nil, &response); err != nil {
		t.Fatal(err)
	}
	if response.Data.ID != "workspace-1" {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestDoReturnsStructuredAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"message":"workspace not found"}`))
	}))
	defer server.Close()
	apiClient, err := New("test-key", server.URL, "test", server.Client())
	if err != nil {
		t.Fatal(err)
	}
	err = apiClient.Do(context.Background(), http.MethodGet, "workspaces/missing", nil, nil)
	if !IsNotFound(err) {
		t.Fatalf("expected not found error, got %v", err)
	}
}

func TestNewRejectsInvalidConfiguration(t *testing.T) {
	if _, err := New("", DefaultBaseURL, "test", nil); err == nil {
		t.Fatal("expected empty API key error")
	}
	if _, err := New("key", "file:///tmp/phaseo", "test", nil); err == nil {
		t.Fatal("expected invalid scheme error")
	}
}
