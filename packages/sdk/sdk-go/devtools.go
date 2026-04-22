package aistats

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const goSDKVersion = "2.0.0"

type DevtoolsConfig struct {
	Enabled        bool
	Directory      string
	CaptureHeaders bool
	SaveAssets     bool
}

type DevtoolsOption func(*DevtoolsConfig)

func CreateAIStatsDevtools(opts ...DevtoolsOption) DevtoolsConfig {
	config := DevtoolsConfig{
		Enabled:        true,
		Directory:      ".ai-stats-devtools",
		CaptureHeaders: false,
		SaveAssets:     true,
	}
	for _, opt := range opts {
		if opt != nil {
			opt(&config)
		}
	}
	return config
}

func WithDevtools(config DevtoolsConfig) Option {
	return func(c *AIStats) {
		c.telemetry = newTelemetryRecorder(&config, goSDKVersion)
	}
}

func WithDevtoolsDirectory(directory string) DevtoolsOption {
	return func(config *DevtoolsConfig) {
		config.Directory = directory
	}
}

func WithDevtoolsEnabled(enabled bool) DevtoolsOption {
	return func(config *DevtoolsConfig) {
		config.Enabled = enabled
	}
}

func WithDevtoolsCaptureHeaders(enabled bool) DevtoolsOption {
	return func(config *DevtoolsConfig) {
		config.CaptureHeaders = enabled
	}
}

func WithDevtoolsSaveAssets(enabled bool) DevtoolsOption {
	return func(config *DevtoolsConfig) {
		config.SaveAssets = enabled
	}
}

type telemetryRecorder struct {
	enabled        bool
	directory      string
	captureHeaders bool
	saveAssets     bool
	sdkVersion     string
	mu             sync.Mutex
}

var telemetryCounter uint64

func newTelemetryRecorder(config *DevtoolsConfig, sdkVersion string) *telemetryRecorder {
	defaultEnabled := false
	enabled := defaultEnabled
	directory := ".ai-stats-devtools"
	captureHeaders := false
	saveAssets := true

	if config != nil {
		enabled = config.Enabled
		if strings.TrimSpace(config.Directory) != "" {
			directory = strings.TrimSpace(config.Directory)
		}
		captureHeaders = config.CaptureHeaders
		saveAssets = config.SaveAssets
	}

	if raw := strings.TrimSpace(os.Getenv("AI_STATS_DEVTOOLS")); raw != "" {
		enabled = parseEnvBool(raw, enabled)
	}
	if rawDir := strings.TrimSpace(os.Getenv("AI_STATS_DEVTOOLS_DIR")); rawDir != "" {
		directory = rawDir
	}

	recorder := &telemetryRecorder{
		enabled:        enabled,
		directory:      directory,
		captureHeaders: captureHeaders,
		saveAssets:     saveAssets,
		sdkVersion:     sdkVersion,
	}
	if recorder.enabled {
		recorder.ensureLayoutLocked()
		recorder.writeMetadataLocked()
	}
	return recorder
}

func (t *telemetryRecorder) captureSuccess(endpoint string, request any, response any, duration time.Duration) {
	if t == nil || !t.enabled {
		return
	}

	entry := map[string]any{
		"id":          newEntryID(),
		"type":        strings.TrimSpace(endpoint),
		"timestamp":   time.Now().UTC().UnixMilli(),
		"duration_ms": duration.Milliseconds(),
		"request":     normalizeForJSON(request),
		"response":    normalizeForJSON(response),
		"error":       nil,
		"metadata": map[string]any{
			"sdk":         "go",
			"sdk_version": t.sdkVersion,
			"stream":      false,
		},
	}
	t.enrichMetadata(entry, request, response)
	t.appendEntry(entry)
}

func (t *telemetryRecorder) captureError(endpoint string, request any, err error, duration time.Duration) {
	if t == nil || !t.enabled {
		return
	}

	entry := map[string]any{
		"id":          newEntryID(),
		"type":        strings.TrimSpace(endpoint),
		"timestamp":   time.Now().UTC().UnixMilli(),
		"duration_ms": duration.Milliseconds(),
		"request":     normalizeForJSON(request),
		"response":    nil,
		"error": map[string]any{
			"message": err.Error(),
		},
		"metadata": map[string]any{
			"sdk":         "go",
			"sdk_version": t.sdkVersion,
			"stream":      false,
		},
	}
	t.enrichMetadata(entry, request, nil)
	t.appendEntry(entry)
}

func (t *telemetryRecorder) enrichMetadata(entry map[string]any, request any, response any) {
	metadata, ok := entry["metadata"].(map[string]any)
	if !ok {
		return
	}
	if usage := extractUsage(normalizeToMap(response)); len(usage) > 0 {
		metadata["usage"] = usage
	}
	model, provider := extractModelProvider(normalizeToMap(response), normalizeToMap(request))
	if model != "" {
		metadata["model"] = model
	}
	if provider != "" {
		metadata["provider"] = provider
	}
	if !t.captureHeaders {
		delete(metadata, "headers")
	}
}

func (t *telemetryRecorder) appendEntry(entry map[string]any) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.ensureLayoutLocked()

	file := filepath.Join(t.directory, "generations.jsonl")
	handle, err := os.OpenFile(file, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer handle.Close()

	line, err := json.Marshal(entry)
	if err != nil {
		return
	}
	_, _ = handle.Write(append(line, '\n'))
}

func (t *telemetryRecorder) ensureLayoutLocked() {
	_ = os.MkdirAll(t.directory, 0o755)
	if t.saveAssets {
		_ = os.MkdirAll(filepath.Join(t.directory, "assets", "images"), 0o755)
		_ = os.MkdirAll(filepath.Join(t.directory, "assets", "audio"), 0o755)
		_ = os.MkdirAll(filepath.Join(t.directory, "assets", "video"), 0o755)
	}
}

func (t *telemetryRecorder) writeMetadataLocked() {
	metadataFile := filepath.Join(t.directory, "metadata.json")
	if _, err := os.Stat(metadataFile); err == nil {
		return
	}
	payload := map[string]any{
		"session_id":   newEntryID(),
		"started_at":   time.Now().UTC().UnixMilli(),
		"sdk":          "go",
		"sdk_version":  t.sdkVersion,
		"platform":     runtime.GOOS + "/" + runtime.GOARCH,
		"go_version":   runtime.Version(),
		"capture_mode": "sdk",
	}
	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(metadataFile, data, 0o644)
}

func normalizeForJSON(value any) any {
	if value == nil {
		return nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Sprintf("%v", value)
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		return string(data)
	}
	return out
}

func normalizeToMap(value any) map[string]any {
	switch typed := normalizeForJSON(value).(type) {
	case map[string]any:
		return typed
	default:
		return map[string]any{}
	}
}

func extractUsage(response map[string]any) map[string]any {
	usageValue, ok := response["usage"]
	if !ok {
		return map[string]any{}
	}
	usage, ok := usageValue.(map[string]any)
	if !ok {
		return map[string]any{}
	}

	out := map[string]any{}
	if value := numberOrNil(usage["prompt_tokens"], usage["input_tokens"]); value != nil {
		out["prompt_tokens"] = value
	}
	if value := numberOrNil(usage["completion_tokens"], usage["output_tokens"]); value != nil {
		out["completion_tokens"] = value
	}
	if value := numberOrNil(usage["total_tokens"]); value != nil {
		out["total_tokens"] = value
	}
	return out
}

func extractModelProvider(response map[string]any, request map[string]any) (string, string) {
	model := strings.TrimSpace(toString(response["model"]))
	if model == "" {
		model = strings.TrimSpace(toString(request["model"]))
	}
	provider := strings.TrimSpace(toString(response["provider"]))
	return model, provider
}

func numberOrNil(values ...any) any {
	for _, value := range values {
		switch typed := value.(type) {
		case float64:
			return typed
		case float32:
			return typed
		case int:
			return typed
		case int64:
			return typed
		case int32:
			return typed
		case int16:
			return typed
		case int8:
			return typed
		case uint:
			return typed
		case uint64:
			return typed
		case uint32:
			return typed
		case uint16:
			return typed
		case uint8:
			return typed
		case json.Number:
			if i, err := typed.Int64(); err == nil {
				return i
			}
			if f, err := typed.Float64(); err == nil {
				return f
			}
		}
	}
	return nil
}

func toString(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	case json.Number:
		return typed.String()
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", typed)
	}
}

func parseEnvBool(raw string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		if parsed, err := strconv.ParseBool(raw); err == nil {
			return parsed
		}
		return fallback
	}
}

func newEntryID() string {
	next := atomic.AddUint64(&telemetryCounter, 1)
	return fmt.Sprintf("%d-%d", time.Now().UTC().UnixNano(), next)
}
