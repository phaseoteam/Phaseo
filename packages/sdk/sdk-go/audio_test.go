package aistats

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAudioHelpersReturnPayloads(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/data/models":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"models":[{"model_id":"openai/gpt-4o-mini-tts","status":"active"},{"model_id":"openai/gpt-4o-transcribe","status":"active"}]}`))
		case r.Method == http.MethodPost && r.URL.Path == "/audio/speech":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode speech body: %v", err)
			}
			if body["model"] != "openai/gpt-4o-mini-tts" {
				t.Fatalf("unexpected speech model: %#v", body["model"])
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"audio":"base64-audio","format":"mp3"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/audio/transcriptions":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode transcription body: %v", err)
			}
			if body["model"] != "openai/gpt-4o-transcribe" {
				t.Fatalf("unexpected transcription model: %#v", body["model"])
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"text":"hello world","language":"en"}`))
		case r.Method == http.MethodPost && r.URL.Path == "/audio/translations":
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode translation body: %v", err)
			}
			if body["model"] != "openai/gpt-4o-transcribe" {
				t.Fatalf("unexpected translation model: %#v", body["model"])
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"text":"translated hello world","language":"en"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	client := New("test", server.URL, WithDeprecationWarnings(false))

	speech, err := client.CreateSpeech(context.Background(), map[string]any{
		"model":  "openai/gpt-4o-mini-tts",
		"input":  "Hello from Go",
		"voice":  "alloy",
		"format": "mp3",
	})
	if err != nil {
		t.Fatalf("CreateSpeech failed: %v", err)
	}
	speechPayload, ok := speech.(map[string]any)
	if !ok {
		t.Fatalf("unexpected speech payload type: %T", speech)
	}
	if speechPayload["audio"] != "base64-audio" || speechPayload["format"] != "mp3" {
		t.Fatalf("unexpected speech payload: %#v", speechPayload)
	}

	transcription, err := client.CreateTranscription(context.Background(), map[string]any{
		"model":     "openai/gpt-4o-transcribe",
		"audio_b64": "base64-audio",
		"language":  "en",
	})
	if err != nil {
		t.Fatalf("CreateTranscription failed: %v", err)
	}
	if transcription["text"] != "hello world" || transcription["language"] != "en" {
		t.Fatalf("unexpected transcription payload: %#v", transcription)
	}

	translation, err := client.CreateTranslation(context.Background(), map[string]any{
		"model":     "openai/gpt-4o-transcribe",
		"audio_b64": "base64-audio",
	})
	if err != nil {
		t.Fatalf("CreateTranslation failed: %v", err)
	}
	if translation["text"] != "translated hello world" || translation["language"] != "en" {
		t.Fatalf("unexpected translation payload: %#v", translation)
	}
}
