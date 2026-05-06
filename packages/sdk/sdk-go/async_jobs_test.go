package aistats

import "testing"

func TestAsyncJobsResourceDelegatesToHelper(t *testing.T) {
	client := New("test", "https://api.phaseo.app/v1")
	closeOnTerminal := false

	url, err := client.AsyncJobs.WebSocketURL("video", "video 123", &AsyncJobWebSocketOptions{
		IntervalMS:      1500,
		CloseOnTerminal: &closeOnTerminal,
	})
	if err != nil {
		t.Fatalf("AsyncJobs.WebSocketURL failed: %v", err)
	}

	expected := "wss://api.phaseo.app/v1/async/video/video%20123/ws?close_on_terminal=false&interval_ms=1500"
	if url != expected {
		t.Fatalf("unexpected async jobs resource URL: got %q want %q", url, expected)
	}
}
