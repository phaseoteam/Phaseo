package phaseo

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type capturedUpload struct {
	path        string
	query       string
	contentType string
	fields      map[string]string
	filename    string
	fileType    string
	fileData    string
	jsonBody    map[string]any
}

func newUploadServer(t *testing.T, captured *capturedUpload) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == http.MethodGet && r.URL.Path == "/models" {
			_, _ = w.Write([]byte(`{"models":[{"model_id":"openai/whisper-1","status":"active"},{"model_id":"mistral/voxtral-mini-transcribe-2","status":"active"}]}`))
			return
		}
		captured.path = r.URL.Path
		captured.query = r.URL.RawQuery
		captured.contentType = r.Header.Get("Content-Type")
		if strings.HasPrefix(captured.contentType, "multipart/form-data") {
			if err := r.ParseMultipartForm(1 << 20); err != nil {
				t.Errorf("parse multipart: %v", err)
				return
			}
			captured.fields = map[string]string{}
			for key, values := range r.MultipartForm.Value {
				captured.fields[key] = values[0]
			}
			if files := r.MultipartForm.File["file"]; len(files) == 1 {
				captured.filename = files[0].Filename
				captured.fileType = files[0].Header.Get("Content-Type")
				file, _ := files[0].Open()
				data, _ := io.ReadAll(file)
				captured.fileData = string(data)
			}
		} else {
			_ = json.NewDecoder(r.Body).Decode(&captured.jsonBody)
		}
		_, _ = w.Write([]byte(`{"id":"ok","text":"hello"}`))
	}))
	t.Cleanup(server.Close)
	return server
}

func TestTranslationSendsTheAudioAsMultipart(t *testing.T) {
	var captured capturedUpload
	server := newUploadServer(t, &captured)
	client := New("test", server.URL, WithDeprecationWarnings(false))

	_, err := client.CreateTranslation(context.Background(), map[string]any{
		"model":       "openai/whisper-1",
		"file":        File{Filename: "clip.mp3", ContentType: "audio/mpeg", Data: []byte("ID3-audio")},
		"temperature": 0.2,
		"provider":    map[string]any{"order": []string{"openai"}},
	})
	if err != nil {
		t.Fatalf("CreateTranslation failed: %v", err)
	}
	if captured.path != "/audio/translations" || !strings.HasPrefix(captured.contentType, "multipart/form-data; boundary=") {
		t.Fatalf("sent %s with %q, want multipart to /audio/translations", captured.path, captured.contentType)
	}
	if captured.filename != "clip.mp3" || captured.fileType != "audio/mpeg" || captured.fileData != "ID3-audio" {
		t.Fatalf("file part = %q %q %q", captured.filename, captured.fileType, captured.fileData)
	}
	if captured.fields["model"] != "openai/whisper-1" || captured.fields["temperature"] != "0.2" {
		t.Fatalf("text fields = %#v", captured.fields)
	}
	if captured.fields["provider"] != `{"order":["openai"]}` {
		t.Fatalf("provider field = %q, want JSON text", captured.fields["provider"])
	}
}

func TestTranscriptionAcceptsAFileFromDisk(t *testing.T) {
	var captured capturedUpload
	server := newUploadServer(t, &captured)
	client := New("test", server.URL, WithDeprecationWarnings(false))

	path := filepath.Join(t.TempDir(), "meeting.wav")
	if err := os.WriteFile(path, []byte("RIFF-audio"), 0o600); err != nil {
		t.Fatal(err)
	}
	file, err := FileFromPath(path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.CreateTranscription(context.Background(), map[string]any{"model": "openai/whisper-1", "file": &file, "stream": false}); err != nil {
		t.Fatalf("CreateTranscription failed: %v", err)
	}
	if captured.path != "/audio/transcriptions" || captured.filename != "meeting.wav" || captured.fileData != "RIFF-audio" {
		t.Fatalf("got path %s, file %q %q", captured.path, captured.filename, captured.fileData)
	}
	if captured.fields["stream"] != "false" {
		t.Fatalf("stream field = %q", captured.fields["stream"])
	}
}

func TestAudioFileMustBeANamedFile(t *testing.T) {
	var captured capturedUpload
	server := newUploadServer(t, &captured)
	client := New("test", server.URL, WithDeprecationWarnings(false))

	cases := map[string]any{
		"a path string": "clip.mp3",
		"raw bytes":     []byte("ID3-audio"),
		"no filename":   File{Data: []byte("ID3-audio")},
	}
	for name, file := range cases {
		t.Run(name, func(t *testing.T) {
			captured = capturedUpload{}
			_, err := client.CreateTranslation(context.Background(), map[string]any{"model": "openai/whisper-1", "file": file})
			if err == nil || !strings.Contains(err.Error(), "phaseo:") {
				t.Fatalf("error = %v, want a phaseo error", err)
			}
			if captured.path != "" {
				t.Fatalf("sent a request to %s", captured.path)
			}
		})
	}
}

func TestFileContentTypeComesFromTheExtension(t *testing.T) {
	var captured capturedUpload
	server := newUploadServer(t, &captured)
	client := New("test", server.URL, WithDeprecationWarnings(false))

	if _, err := client.CreateTranslation(context.Background(), map[string]any{
		"model": "openai/whisper-1",
		"file":  File{Filename: "clip.wav", Data: []byte("RIFF")},
	}); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(captured.fileType, "audio/") {
		t.Fatalf("file part content type = %q, want audio/*", captured.fileType)
	}
}

func TestTranscriptionByURLStaysJSON(t *testing.T) {
	var captured capturedUpload
	server := newUploadServer(t, &captured)
	client := New("test", server.URL, WithDeprecationWarnings(false))

	_, err := client.CreateTranscription(context.Background(), map[string]any{
		"model":    "mistral/voxtral-mini-transcribe-2",
		"file_url": "https://example.com/clip.mp3",
	})
	if err != nil {
		t.Fatalf("CreateTranscription failed: %v", err)
	}
	if captured.contentType != "application/json" || captured.jsonBody["file_url"] != "https://example.com/clip.mp3" {
		t.Fatalf("sent %q %#v, want JSON with file_url", captured.contentType, captured.jsonBody)
	}
}

func TestUploadFileSendsMultipartWithProviderInTheQuery(t *testing.T) {
	var captured capturedUpload
	server := newUploadServer(t, &captured)
	client := New("test", server.URL, WithDeprecationWarnings(false))

	_, err := client.UploadFile(context.Background(), UploadFileParams{
		File:     File{Filename: "batch.jsonl", ContentType: "application/jsonl", Data: []byte("{\"custom_id\":\"1\"}\n")},
		Purpose:  "batch",
		Model:    "openai/gpt-5-nano",
		Provider: "openai",
	})
	if err != nil {
		t.Fatalf("UploadFile failed: %v", err)
	}
	if captured.path != "/batches/files" || !strings.HasPrefix(captured.contentType, "multipart/form-data") {
		t.Fatalf("sent %s with %q", captured.path, captured.contentType)
	}
	if captured.query != "model=openai%2Fgpt-5-nano&provider=openai" {
		t.Fatalf("query = %q", captured.query)
	}
	if captured.fields["purpose"] != "batch" || captured.filename != "batch.jsonl" {
		t.Fatalf("fields %#v, filename %q", captured.fields, captured.filename)
	}
}
