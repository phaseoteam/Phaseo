// Package realtime is a small client for Phaseo realtime voice sessions.
//
// Connect creates the session over REST, opens the relay WebSocket and waits for
// relay.connected. Provider events pass through unchanged; End sends session.end
// and returns the session.ended final bill. It lives in its own package so the
// WebSocket dependency (github.com/coder/websocket) is only compiled when used.
package realtime

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	phaseo "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3"
)

// relayProtocol is echoed by the relay; clients that offer subprotocols need one selected.
const relayProtocol = "statsync-realtime"

// Options configures Connect.
type Options struct {
	Model        string
	Voice        string
	Instructions string
	Provider     string
	Metadata     map[string]any
	// ConnectTimeout bounds waiting for relay.connected. Default 30 seconds.
	ConnectTimeout time.Duration
}

// EndOptions configures End.
type EndOptions struct {
	// Reason is your own note, echoed back as client_reason.
	Reason string
	// CancelResponse false lets a reply that is still playing finish. Nil uses the relay default (true).
	CancelResponse *bool
	// Timeout bounds waiting for session.ended. Default 60 seconds.
	Timeout time.Duration
}

// Event is any relay event: Phaseo's own or the provider's, unchanged.
type Event map[string]any

// Type returns the event's "type" field.
func (e Event) Type() string {
	value, _ := e["type"].(string)
	return value
}

// FinalBill is the request that returns a session's final cost once it is settled.
type FinalBill struct {
	Method string `json:"method"`
	Path   string `json:"path"`
}

// Cost is the cost block on session.ended.
type Cost struct {
	TotalUSD         float64 `json:"total_usd"`
	TotalNanos       int64   `json:"total_nanos"`
	Estimated        bool    `json:"estimated"`
	EstimateBasis    *string `json:"estimate_basis"`
	DebtNanos        int64   `json:"debt_nanos"`
	UncollectedNanos int64   `json:"uncollected_nanos"`
	Currency         string  `json:"currency"`
}

// Ended is the session.ended event: how the call ended and its bill.
type Ended struct {
	Type              string             `json:"type"`
	SessionID         string             `json:"session_id"`
	Reason            string             `json:"reason"`
	InitiatedBy       string             `json:"initiated_by"`
	ClientReason      string             `json:"client_reason,omitempty"`
	ProviderCloseCode *int               `json:"provider_close_code,omitempty"`
	DurationSeconds   float64            `json:"duration_seconds"`
	Usage             map[string]float64 `json:"usage"`
	Cost              Cost               `json:"cost"`
	BillingStatus     string             `json:"billing_status"`
	FinalBill         *FinalBill         `json:"final_bill,omitempty"`
	// Raw is the full event, including fields added later.
	Raw Event `json:"-"`
}

// Warning is a session.warning event.
type Warning struct {
	Code    string
	Message string
	Raw     Event
}

// FinalBillFor returns GET /v1/generations?id=realtime:<session_id>.
func FinalBillFor(sessionID string) FinalBill {
	return FinalBill{Method: "GET", Path: "/v1/generations?id=" + url.QueryEscape("realtime:"+sessionID)}
}

// ClosedError reports that the socket closed, or End timed out, without session.ended.
// The call is still billed; FinalBill returns the cost once it is settled.
type ClosedError struct {
	SessionID string
	CloseCode int
	Detail    string
	FinalBill FinalBill
}

func (e *ClosedError) Error() string {
	return fmt.Sprintf("realtime session %s %s without session.ended; the call is still billed, fetch the final bill with GET %s",
		e.SessionID, e.Detail, e.FinalBill.Path)
}

func newClosedError(sessionID string, code int, detail string) *ClosedError {
	return &ClosedError{SessionID: sessionID, CloseCode: code, Detail: detail, FinalBill: FinalBillFor(sessionID)}
}

// Conn is the WebSocket the session uses. *websocket.Conn from github.com/coder/websocket is adapted to it.
type Conn interface {
	Read(ctx context.Context) (string, error)
	Write(ctx context.Context, text string) error
	Close(code int, reason string) error
}

// Dialer opens the relay socket. Tests and custom transports can replace the default.
type Dialer func(ctx context.Context, url string, subprotocols []string) (Conn, error)

type coderConn struct{ conn *websocket.Conn }

func (c coderConn) Read(ctx context.Context) (string, error) {
	_, data, err := c.conn.Read(ctx)
	return string(data), err
}

func (c coderConn) Write(ctx context.Context, text string) error {
	return c.conn.Write(ctx, websocket.MessageText, []byte(text))
}

func (c coderConn) Close(code int, reason string) error {
	return c.conn.Close(websocket.StatusCode(code), reason)
}

// DefaultDialer dials with github.com/coder/websocket.
func DefaultDialer(ctx context.Context, url string, subprotocols []string) (Conn, error) {
	conn, _, err := websocket.Dial(ctx, url, &websocket.DialOptions{Subprotocols: subprotocols})
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(-1)
	return coderConn{conn: conn}, nil
}

// RelayURL resolves the session's connect.url against the client's base URL as ws:// or wss://.
func RelayURL(baseURL string, connectURL string) (string, error) {
	base, err := url.Parse(strings.TrimRight(baseURL, "/") + "/")
	if err != nil {
		return "", err
	}
	ref, err := url.Parse(connectURL)
	if err != nil {
		return "", err
	}
	resolved := base.ResolveReference(ref)
	switch resolved.Scheme {
	case "https":
		resolved.Scheme = "wss"
	case "http":
		resolved.Scheme = "ws"
	}
	return resolved.String(), nil
}

// Session is a connected realtime voice call.
type Session struct {
	// ID is the realtime session ID.
	ID string
	// Info is the create-session response without client_secret.
	Info map[string]any

	conn      Conn
	mu        sync.Mutex
	listeners map[string][]func(Event)
	subs      []*subscription
	done      chan struct{}
	ended     *Ended
	closedErr *ClosedError
	connected chan struct{}
	writeMu   sync.Mutex
}

// Connect creates a realtime session, opens the relay socket and waits for relay.connected.
func Connect(ctx context.Context, client *phaseo.Phaseo, options Options) (*Session, error) {
	return ConnectWithDialer(ctx, client, options, DefaultDialer)
}

// ConnectWithDialer is Connect with a custom WebSocket dialer.
func ConnectWithDialer(ctx context.Context, client *phaseo.Phaseo, options Options, dial Dialer) (*Session, error) {
	if strings.TrimSpace(options.Model) == "" {
		return nil, errors.New("realtime: Model is required")
	}
	body := map[string]any{"model": options.Model}
	for key, value := range map[string]string{"voice": options.Voice, "instructions": options.Instructions, "provider": options.Provider} {
		if value != "" {
			body[key] = value
		}
	}
	if options.Metadata != nil {
		body["metadata"] = options.Metadata
	}
	response, err := client.RequestWithResponse(ctx, "POST", "/audio/realtime/sessions", nil, body, nil)
	if err != nil {
		return nil, err
	}
	var info map[string]any
	if err := json.Unmarshal(response.Body, &info); err != nil {
		return nil, fmt.Errorf("realtime: decode session response: %w", err)
	}
	secret, _ := info["client_secret"].(string)
	sessionID, _ := info["session_id"].(string)
	if sessionID == "" {
		sessionID, _ = info["id"].(string)
	}
	connect, _ := info["connect"].(map[string]any)
	connectURL, _ := connect["url"].(string)
	if secret == "" || sessionID == "" || connectURL == "" {
		return nil, errors.New("realtime: session response is missing session_id, client_secret or connect.url")
	}
	relayURL, err := RelayURL(client.RawClient().BaseURL, connectURL)
	if err != nil {
		return nil, err
	}
	timeout := options.ConnectTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	connectCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	conn, err := dial(connectCtx, relayURL, []string{relayProtocol, "rtsec." + secret})
	if err != nil {
		return nil, err
	}
	publicInfo := map[string]any{}
	for key, value := range info {
		if key != "client_secret" && key != "clientSecret" {
			publicInfo[key] = value
		}
	}
	session := &Session{
		ID: sessionID, Info: publicInfo, conn: conn,
		listeners: map[string][]func(Event){}, done: make(chan struct{}), connected: make(chan struct{}),
	}
	go session.read()
	select {
	case <-session.connected:
		return session, nil
	case <-session.done:
		if session.ended != nil {
			return nil, fmt.Errorf("realtime: session %s ended before connecting: %s", sessionID, session.ended.Reason)
		}
		return nil, session.closedErr
	case <-connectCtx.Done():
		_ = conn.Close(1000, "client_closed")
		return nil, fmt.Errorf("realtime: session %s did not connect: %w", sessionID, connectCtx.Err())
	}
}

// SendAudio sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google) as client.audio.
func (s *Session) SendAudio(ctx context.Context, pcm16 []byte) error {
	return s.Send(ctx, map[string]any{"type": "client.audio", "audio": base64.StdEncoding.EncodeToString(pcm16)})
}

// Send sends any event as JSON, for provider-specific messages.
func (s *Session) Send(ctx context.Context, event any) error {
	select {
	case <-s.done:
		return fmt.Errorf("realtime: session %s is not open", s.ID)
	default:
	}
	data, err := json.Marshal(event)
	if err != nil {
		return err
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.conn.Write(ctx, string(data))
}

// On subscribes to one event type, or every event with "*". It returns an unsubscribe function.
// Listeners run on the reader goroutine; keep them quick.
func (s *Session) On(eventType string, listener func(Event)) func() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.listeners[eventType] = append(s.listeners[eventType], listener)
	index := len(s.listeners[eventType]) - 1
	return func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if list := s.listeners[eventType]; index < len(list) {
			list[index] = nil
		}
	}
}

// OnWarning subscribes to session.warning.
func (s *Session) OnWarning(listener func(Warning)) func() {
	return s.On("session.warning", func(event Event) {
		code, _ := event["code"].(string)
		message, _ := event["message"].(string)
		listener(Warning{Code: code, Message: message, Raw: event})
	})
}

// OnEnded subscribes to session.ended.
func (s *Session) OnEnded(listener func(*Ended)) func() {
	return s.On("session.ended", func(event Event) {
		if ended, err := decodeEnded(event); err == nil {
			listener(ended)
		}
	})
}

// Events returns a channel of every event from now until the socket closes, when it is closed.
// Events are queued without limit, so a slow reader never blocks the session.
func (s *Session) Events() <-chan Event {
	sub := newSubscription()
	s.mu.Lock()
	select {
	case <-s.done:
		sub.close()
	default:
		s.subs = append(s.subs, sub)
	}
	s.mu.Unlock()
	return sub.out
}

// Done is closed when the session has ended or the socket has closed.
func (s *Session) Done() <-chan struct{} { return s.done }

// Result returns session.ended, or a *ClosedError when the socket closed without it. Call it after Done.
func (s *Session) Result() (*Ended, error) {
	<-s.done
	if s.ended != nil {
		return s.ended, nil
	}
	return nil, s.closedErr
}

// End sends session.end and waits for session.ended (the final bill).
// It returns a *ClosedError if the socket closes, or the timeout passes, without it.
func (s *Session) End(ctx context.Context, options EndOptions) (*Ended, error) {
	select {
	case <-s.done:
		return s.Result()
	default:
	}
	message := map[string]any{"type": "session.end"}
	if options.Reason != "" {
		message["reason"] = options.Reason
	}
	if options.CancelResponse != nil {
		message["cancel_response"] = *options.CancelResponse
	}
	_ = s.Send(ctx, message) // A send failure means the socket is closing; the reader reports how it ended.
	timeout := options.Timeout
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-s.done:
		return s.Result()
	case <-timer.C:
		s.fail(newClosedError(s.ID, 0, fmt.Sprintf("timed out after %s", timeout)))
	case <-ctx.Done():
		s.fail(newClosedError(s.ID, 0, "was cancelled ("+ctx.Err().Error()+")"))
	}
	_ = s.conn.Close(1000, "client_end_timeout")
	return s.Result()
}

// Close closes the socket without waiting for the bill. The call is still billed; prefer End.
func (s *Session) Close() error {
	return s.conn.Close(1000, "client_closed")
}

func (s *Session) read() {
	for {
		text, err := s.conn.Read(context.Background())
		if err != nil {
			code := int(websocket.CloseStatus(err))
			if code < 0 {
				code = 0
			}
			detail := fmt.Sprintf("closed (code %d)", code)
			if code == 0 {
				detail = "closed (" + err.Error() + ")"
			}
			s.fail(newClosedError(s.ID, code, detail))
			return
		}
		var event Event
		if json.Unmarshal([]byte(text), &event) != nil || event.Type() == "" {
			continue
		}
		s.dispatch(event)
	}
}

func (s *Session) dispatch(event Event) {
	s.mu.Lock()
	var listeners []func(Event)
	listeners = append(listeners, s.listeners[event.Type()]...)
	listeners = append(listeners, s.listeners["*"]...)
	subs := append([]*subscription(nil), s.subs...)
	finished := false
	select {
	case <-s.done:
		finished = true
	default:
	}
	s.mu.Unlock()
	for _, listener := range listeners {
		if listener != nil {
			func() {
				defer func() { _ = recover() }() // Listener panics must not break the session.
				listener(event)
			}()
		}
	}
	for _, sub := range subs {
		sub.push(event)
	}
	if event.Type() == "relay.connected" {
		select {
		case <-s.connected:
		default:
			close(s.connected)
		}
	}
	if event.Type() == "session.ended" && !finished {
		ended, err := decodeEnded(event)
		if err == nil {
			s.finish(ended, nil)
		}
	}
}

func (s *Session) fail(err *ClosedError) { s.finish(nil, err) }

func (s *Session) finish(ended *Ended, err *ClosedError) {
	s.mu.Lock()
	defer s.mu.Unlock()
	select {
	case <-s.done:
		return
	default:
	}
	s.ended, s.closedErr = ended, err
	close(s.done)
	for _, sub := range s.subs {
		sub.close()
	}
	s.subs = nil
}

func decodeEnded(event Event) (*Ended, error) {
	data, err := json.Marshal(event)
	if err != nil {
		return nil, err
	}
	var ended Ended
	if err := json.Unmarshal(data, &ended); err != nil {
		return nil, err
	}
	ended.Raw = event
	return &ended, nil
}

// subscription is an unbounded queue feeding one Events channel.
type subscription struct {
	mu     sync.Mutex
	cond   *sync.Cond
	queue  []Event
	closed bool
	out    chan Event
}

func newSubscription() *subscription {
	sub := &subscription{out: make(chan Event)}
	sub.cond = sync.NewCond(&sub.mu)
	go sub.pump()
	return sub
}

func (q *subscription) push(event Event) {
	q.mu.Lock()
	q.queue = append(q.queue, event)
	q.mu.Unlock()
	q.cond.Signal()
}

func (q *subscription) close() {
	q.mu.Lock()
	q.closed = true
	q.mu.Unlock()
	q.cond.Signal()
}

func (q *subscription) pump() {
	defer close(q.out)
	for {
		q.mu.Lock()
		for len(q.queue) == 0 && !q.closed {
			q.cond.Wait()
		}
		if len(q.queue) == 0 {
			q.mu.Unlock()
			return
		}
		event := q.queue[0]
		q.queue = q.queue[1:]
		q.mu.Unlock()
		q.out <- event
	}
}
