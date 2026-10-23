package realtime_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	phaseo "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3"
	"github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3/realtime"
)

var endedEvent = map[string]any{
	"type": "session.ended", "session_id": "rt_test", "reason": "client_requested", "initiated_by": "client",
	"client_reason": "caller hung up", "duration_seconds": 12.5,
	"usage": map[string]any{"input_audio_tokens": 100, "output_audio_tokens": 200},
	"cost": map[string]any{"total_usd": 0.01, "total_nanos": 10000000, "estimated": false, "estimate_basis": nil,
		"debt_nanos": 0, "uncollected_nanos": 0, "currency": "USD"},
	"billing_status": "settled",
}

type relayState struct {
	mu        sync.Mutex
	created   map[string]any
	protocols string
	path      string
	received  []map[string]any
}

func (s *relayState) snapshot() []map[string]any {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]map[string]any(nil), s.received...)
}

// fakeRelay serves the create-session call and a WebSocket relay played by behaviour.
func fakeRelay(t *testing.T, behaviour func(ctx context.Context, conn *websocket.Conn, state *relayState)) (*httptest.Server, *relayState) {
	t.Helper()
	state := &relayState{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/v1/audio/realtime/sessions" {
			_ = json.NewDecoder(r.Body).Decode(&state.created)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"id": "rt_test", "session_id": "rt_test", "provider": "openai", "client_secret": "rtsec_secret",
				"connect":              map[string]any{"transport": "websocket", "url": "/v1/realtime/sessions/rt_test/relay"},
				"max_duration_seconds": 3600, "idle_timeout_seconds": nil,
			})
			return
		}
		state.protocols = r.Header.Get("Sec-WebSocket-Protocol")
		state.path = r.URL.Path
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{"statsync-realtime"}})
		if err != nil {
			return
		}
		ctx := r.Context()
		_ = conn.Write(ctx, websocket.MessageText, []byte(`{"type":"relay.connected","session_id":"rt_test"}`))
		behaviour(ctx, conn, state)
	}))
	t.Cleanup(server.Close)
	return server, state
}

func receiveUntil(ctx context.Context, conn *websocket.Conn, state *relayState, eventType string) {
	for {
		_, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		var message map[string]any
		_ = json.Unmarshal(data, &message)
		state.mu.Lock()
		state.received = append(state.received, message)
		state.mu.Unlock()
		if message["type"] == eventType {
			return
		}
	}
}

func send(ctx context.Context, conn *websocket.Conn, event map[string]any) {
	data, _ := json.Marshal(event)
	_ = conn.Write(ctx, websocket.MessageText, data)
}

func newClient(server *httptest.Server) *phaseo.Phaseo {
	return phaseo.New("sk_test_123", server.URL+"/v1", phaseo.WithDeprecationWarnings(false))
}

func TestConnectStreamsEventsAndEndReturnsTheBill(t *testing.T) {
	server, state := fakeRelay(t, func(ctx context.Context, conn *websocket.Conn, state *relayState) {
		receiveUntil(ctx, conn, state, "client.audio")
		send(ctx, conn, map[string]any{"type": "response.output_audio.delta", "delta": "AAA="})
		send(ctx, conn, map[string]any{"type": "session.warning", "code": "max_duration_approaching", "seconds_remaining": 120})
		receiveUntil(ctx, conn, state, "session.end")
		send(ctx, conn, endedEvent)
		_ = conn.Close(websocket.StatusNormalClosure, "")
	})
	ctx := context.Background()
	session, err := realtime.Connect(ctx, newClient(server), realtime.Options{Model: "openai/gpt-realtime-2", Voice: "marin"})
	if err != nil {
		t.Fatal(err)
	}
	if state.protocols != "statsync-realtime,rtsec.rtsec_secret" || state.path != "/v1/realtime/sessions/rt_test/relay" {
		t.Fatalf("unexpected handshake: %q %q", state.protocols, state.path)
	}
	if state.created["model"] != "openai/gpt-realtime-2" || state.created["voice"] != "marin" {
		t.Fatalf("unexpected create body: %v", state.created)
	}
	if _, ok := session.Info["client_secret"]; ok || session.ID != "rt_test" {
		t.Fatalf("unexpected session info: %v", session.Info)
	}
	warnings := make(chan realtime.Warning, 1)
	session.OnWarning(func(warning realtime.Warning) { warnings <- warning })
	events := session.Events()
	if err := session.SendAudio(ctx, []byte{0, 1, 2, 255}); err != nil {
		t.Fatal(err)
	}
	var types []string
	for event := range events {
		types = append(types, event.Type())
		if event.Type() == "session.warning" {
			break
		}
	}
	if strings.Join(types, ",") != "response.output_audio.delta,session.warning" {
		t.Fatalf("unexpected events: %v", types)
	}
	if warning := <-warnings; warning.Code != "max_duration_approaching" {
		t.Fatalf("unexpected warning: %v", warning)
	}
	cancel := false
	ended, err := session.End(ctx, realtime.EndOptions{Reason: "caller hung up", CancelResponse: &cancel})
	if err != nil {
		t.Fatal(err)
	}
	if ended.Reason != "client_requested" || ended.BillingStatus != "settled" || ended.Cost.TotalUSD != 0.01 || ended.Usage["output_audio_tokens"] != 200 {
		t.Fatalf("unexpected bill: %+v", ended)
	}
	received := state.snapshot()
	if received[0]["type"] != "client.audio" || received[0]["audio"] != "AAEC/w==" {
		t.Fatalf("unexpected audio message: %v", received[0])
	}
	last := received[len(received)-1]
	if last["type"] != "session.end" || last["reason"] != "caller hung up" || last["cancel_response"] != false {
		t.Fatalf("unexpected end message: %v", last)
	}
}

func TestEndReturnsClosedErrorWithFinalBill(t *testing.T) {
	server, _ := fakeRelay(t, func(ctx context.Context, conn *websocket.Conn, state *relayState) {
		receiveUntil(ctx, conn, state, "session.end")
		_ = conn.Close(websocket.StatusInternalError, "realtime_client_socket_error")
	})
	session, err := realtime.Connect(context.Background(), newClient(server), realtime.Options{Model: "openai/gpt-realtime-2"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = session.End(context.Background(), realtime.EndOptions{})
	var closed *realtime.ClosedError
	if !errors.As(err, &closed) {
		t.Fatalf("expected ClosedError, got %v", err)
	}
	if closed.CloseCode != 1011 || closed.FinalBill.Path != "/v1/generations?id=realtime%3Art_test" {
		t.Fatalf("unexpected error: %+v", closed)
	}
	if !strings.Contains(err.Error(), "GET /v1/generations?id=realtime%3Art_test") {
		t.Fatalf("message should point at the final bill: %v", err)
	}
}

func TestEndTimesOut(t *testing.T) {
	server, _ := fakeRelay(t, func(ctx context.Context, conn *websocket.Conn, state *relayState) {
		receiveUntil(ctx, conn, state, "never")
	})
	session, err := realtime.Connect(context.Background(), newClient(server), realtime.Options{Model: "openai/gpt-realtime-2"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = session.End(context.Background(), realtime.EndOptions{Timeout: 50 * time.Millisecond})
	if err == nil || !strings.Contains(err.Error(), "timed out after 50ms") {
		t.Fatalf("expected timeout, got %v", err)
	}
}

func TestProviderEndedSessionClosesEvents(t *testing.T) {
	server, _ := fakeRelay(t, func(ctx context.Context, conn *websocket.Conn, state *relayState) {
		time.Sleep(50 * time.Millisecond)
		ended := map[string]any{}
		for key, value := range endedEvent {
			ended[key] = value
		}
		ended["reason"], ended["initiated_by"] = "max_duration_reached", "gateway"
		send(ctx, conn, ended)
		_ = conn.Close(websocket.StatusNormalClosure, "")
	})
	session, err := realtime.Connect(context.Background(), newClient(server), realtime.Options{Model: "openai/gpt-realtime-2"})
	if err != nil {
		t.Fatal(err)
	}
	var types []string
	for event := range session.Events() {
		types = append(types, event.Type())
	}
	ended, err := session.Result()
	if err != nil || ended.Reason != "max_duration_reached" || strings.Join(types, ",") != "session.ended" {
		t.Fatalf("unexpected result: %v %v %v", ended, err, types)
	}
}
