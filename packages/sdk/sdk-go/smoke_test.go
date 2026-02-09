package aistats

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	gen "github.com/AI-Stats/ai-stats-go-sdk-wrapper/src/gen"
)

type operation struct {
	Method       string          `json:"method"`
	Path         string          `json:"path"`
	ExpectStatus int             `json:"expectStatus"`
	Body         json.RawMessage `json:"body"`
}

type manifest struct {
	ApiKeyEnv      string               `json:"apiKeyEnv"`
	BaseUrlEnv     string               `json:"baseUrlEnv"`
	DefaultBaseUrl string               `json:"defaultBaseUrl"`
	Operations     map[string]operation `json:"operations"`
}

func loadManifest(t *testing.T) manifest {
	t.Helper()
	path := filepath.Clean(filepath.Join("..", "smoke-manifest.json"))
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read manifest: %v", err)
	}
	var m manifest
	if err := json.Unmarshal(data, &m); err != nil {
		t.Fatalf("parse manifest: %v", err)
	}
	if m.ApiKeyEnv == "" {
		m.ApiKeyEnv = "AI_STATS_API_KEY"
	}
	if m.BaseUrlEnv == "" {
		m.BaseUrlEnv = "AI_STATS_BASE_URL"
	}
	return m
}

func TestSmokeSuite(t *testing.T) {
	m := loadManifest(t)
	apiKey := os.Getenv(m.ApiKeyEnv)
	if apiKey == "" {
		t.Skipf("set %s to run smoke tests", m.ApiKeyEnv)
	}
	baseURL := strings.TrimRight(os.Getenv(m.BaseUrlEnv), "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(m.DefaultBaseUrl, "/")
	}

	client := New(apiKey, baseURL)
	ctx := context.Background()

	healthOp := m.Operations["health"]
	healthReq, _ := http.NewRequest(healthOp.Method, baseURL+healthOp.Path, nil)
	healthReq.Header.Set("Authorization", "Bearer "+apiKey)
	healthRes, err := http.DefaultClient.Do(healthReq)
	if err != nil {
		t.Fatalf("health request failed: %v", err)
	}
	defer healthRes.Body.Close()
	if healthRes.StatusCode != healthOp.ExpectStatus {
		t.Fatalf("health status %d != %d", healthRes.StatusCode, healthOp.ExpectStatus)
	}
	var healthBody struct {
		Status string `json:"status"`
	}
	_ = json.NewDecoder(healthRes.Body).Decode(&healthBody)
	if healthBody.Status == "" {
		t.Fatalf("health status missing")
	}

	models, err := client.GetModels(ctx, nil)
	if err != nil {
		t.Fatalf("models failed: %v", err)
	}
	modelList, ok := models["models"].([]interface{})
	if !ok || len(modelList) == 0 {
		t.Fatalf("models list empty")
	}

	chatOp := m.Operations["chat"]
	var chatReq gen.ChatCompletionsRequest
	if err := json.Unmarshal(chatOp.Body, &chatReq); err != nil {
		t.Fatalf("parse chat body: %v", err)
	}
	chatResp, err := client.GenerateText(ctx, chatReq)
	if err != nil {
		t.Fatalf("chat failed: %v", err)
	}
	choices, ok := chatResp["choices"].([]interface{})
	if !ok || len(choices) == 0 {
		t.Fatalf("chat choices empty")
	}

	unauthOp := m.Operations["unauthorized"]
	unauthReq, _ := http.NewRequest(unauthOp.Method, baseURL+unauthOp.Path, nil)
	unauthRes, err := http.DefaultClient.Do(unauthReq)
	if err != nil {
		t.Fatalf("unauthorized request failed: %v", err)
	}
	defer unauthRes.Body.Close()
	if unauthRes.StatusCode != unauthOp.ExpectStatus && unauthRes.StatusCode != http.StatusForbidden {
		t.Fatalf("unauthorized status %d", unauthRes.StatusCode)
	}

	nfOp := m.Operations["notFound"]
	nfReq, _ := http.NewRequest(nfOp.Method, baseURL+nfOp.Path, nil)
	nfReq.Header.Set("Authorization", "Bearer "+apiKey)
	nfRes, err := http.DefaultClient.Do(nfReq)
	if err != nil {
		t.Fatalf("notFound request failed: %v", err)
	}
	defer nfRes.Body.Close()
	if nfRes.StatusCode != nfOp.ExpectStatus {
		t.Fatalf("notFound status %d != %d", nfRes.StatusCode, nfOp.ExpectStatus)
	}
}
