package phaseo

import "testing"

func TestCheckParameterSupportHighlightsPartialAndInvalidValues(t *testing.T) {
	model := map[string]any{"id": "openai/example", "endpoints": []any{
		map[string]any{"id": "openai:responses", "endpoint": "responses", "public_path": "/v1/responses", "routable": true, "status": "active", "provider": map[string]any{"id": "openai"}, "capabilities": map[string]any{"parameters": []any{"temperature"}, "parameter_details": map[string]any{"temperature": map[string]any{"supported": true, "minimum": 0.0, "maximum": 1.0}}}},
		map[string]any{"id": "other:responses", "endpoint": "responses", "routable": true, "status": "active", "provider": map[string]any{"id": "other"}, "capabilities": map[string]any{"parameters": []any{}}},
	}}
	report := CheckParameterSupport(model, map[string]any{"temperature": 1.5}, ParameterSupportOptions{})
	if report.OK {
		t.Fatal("expected invalid value to have no matching route")
	}
	if got := report.Parameters[0].Status; got != ParameterPartial {
		t.Fatalf("expected partial, got %s", got)
	}
	if len(report.Parameters[0].AcceptedBy) != 0 {
		t.Fatal("expected no accepting routes")
	}
}
