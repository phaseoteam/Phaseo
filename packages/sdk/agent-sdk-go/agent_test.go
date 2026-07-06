package phaseoagent

import (
	"context"
	"testing"
)

type fakeClient struct {
	calls int
}

func (f *fakeClient) Generate(_ context.Context, _ ModelRequest) (ModelResponse, error) {
	f.calls++
	if f.calls == 1 {
		return ModelResponse{
			Message: Message{
				Role:    "assistant",
				Content: "",
				ToolCalls: []ToolCall{
					{ID: "call_1", Name: "lookup", Input: map[string]any{"slug": "presets"}},
				},
			},
		}, nil
	}
	return ModelResponse{
		Message: Message{
			Role:    "assistant",
			Content: "Presets let you define stable routing defaults.",
		},
	}, nil
}

func TestAgentExecutesToolLoop(t *testing.T) {
	agent := CreateAgent(AgentDefinition{
		ID:           "support-agent",
		Instructions: "Use tools when helpful.",
		Tools: []Tool{
			DefineTool(Tool{
				ID:          "lookup",
				Description: "Lookup docs",
				Parameters:  map[string]any{"type": "object"},
				Execute: func(input any, _ RuntimeContext) (any, error) {
					payload := input.(map[string]any)
					return map[string]any{"slug": payload["slug"], "ok": true}, nil
				},
			}),
		},
	})

	result, err := agent.Run(context.Background(), RunOptions{
		Input:  "Explain presets",
		Client: &fakeClient{},
	})
	if err != nil {
		t.Fatalf("Run failed: %v", err)
	}
	if result.Output != "Presets let you define stable routing defaults." {
		t.Fatalf("unexpected output: %#v", result.Output)
	}
	if len(result.Steps) != 2 {
		t.Fatalf("expected 2 steps, got %d", len(result.Steps))
	}
	if got := result.Messages[len(result.Messages)-2].Role; got != "tool" {
		t.Fatalf("expected penultimate message to be tool, got %q", got)
	}
}
