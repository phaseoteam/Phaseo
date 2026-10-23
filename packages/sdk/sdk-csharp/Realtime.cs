using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net.WebSockets;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace PhaseoSdk
{
    /// <summary>Options for <see cref="RealtimeResource.ConnectAsync"/>.</summary>
    public sealed class RealtimeConnectOptions
    {
        /// <summary>A realtime model ID, for example <c>openai/gpt-realtime-2</c>.</summary>
        public required string Model { get; init; }
        /// <summary>Provider voice, for example <c>marin</c>.</summary>
        public string? Voice { get; init; }
        /// <summary>System instructions for the call.</summary>
        public string? Instructions { get; init; }
        /// <summary>Pin a provider instead of the default route.</summary>
        public string? Provider { get; init; }
        /// <summary>Your own metadata, stored with the session.</summary>
        public Dictionary<string, object?>? Metadata { get; init; }
        /// <summary>How long to wait for <c>relay.connected</c>. Default 30 seconds.</summary>
        public TimeSpan ConnectTimeout { get; init; } = TimeSpan.FromSeconds(30);
    }

    /// <summary>The relay socket closed, or EndAsync timed out, without <c>session.ended</c>. The call is still billed.</summary>
    public sealed class RealtimeSessionClosedException : Exception
    {
        /// <summary>The realtime session ID.</summary>
        public string SessionId { get; }
        /// <summary>The WebSocket close code, or null when there was none.</summary>
        public int? CloseCode { get; }
        /// <summary>The WebSocket close reason, if any.</summary>
        public string CloseReason { get; }
        /// <summary><c>/v1/generations?id=realtime%3A&lt;session_id&gt;</c>; send it as a GET for the final cost once settled.</summary>
        public string FinalBillPath { get; }

        internal RealtimeSessionClosedException(string sessionId, int? closeCode, string closeReason, string? detail = null)
            : base($"Realtime session {sessionId} {detail ?? $"closed (code {(closeCode?.ToString() ?? "none")}{(string.IsNullOrEmpty(closeReason) ? "" : ", " + closeReason)})"} without session.ended. The call is still billed; fetch the final bill with GET {RealtimeResource.FinalBillPath(sessionId)}")
        {
            SessionId = sessionId;
            CloseCode = closeCode;
            CloseReason = closeReason;
            FinalBillPath = RealtimeResource.FinalBillPath(sessionId);
        }
    }

    /// <summary><c>client.Realtime</c>: realtime voice sessions (beta), over <see cref="ClientWebSocket"/>.</summary>
    public sealed class RealtimeResource
    {
        // The relay echoes this protocol back; WebSocket clients need one selected.
        internal const string RelayProtocol = "statsync-realtime";
        private readonly global::Phaseo.Gen.Client _client;
        private readonly string _basePath;

        internal RealtimeResource(global::Phaseo.Gen.Client client, string basePath)
        {
            _client = client;
            _basePath = basePath;
        }

        /// <summary>Creates the session, opens the relay socket and waits for <c>relay.connected</c>.</summary>
        public async Task<RealtimeSession> ConnectAsync(RealtimeConnectOptions options, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(options.Model)) throw new ArgumentException("Model is required", nameof(options));
            var body = new Dictionary<string, object?> { ["model"] = options.Model };
            if (options.Voice is not null) body["voice"] = options.Voice;
            if (options.Instructions is not null) body["instructions"] = options.Instructions;
            if (options.Provider is not null) body["provider"] = options.Provider;
            if (options.Metadata is not null) body["metadata"] = options.Metadata;
            var info = await _client.SendAsync<JsonElement>("POST", "/audio/realtime/sessions", body: body).ConfigureAwait(false);
            string Text(JsonElement element, string name) =>
                element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
            var secret = Text(info, "client_secret");
            var sessionId = Text(info, "session_id");
            if (sessionId.Length == 0) sessionId = Text(info, "id");
            var connectUrl = info.ValueKind == JsonValueKind.Object && info.TryGetProperty("connect", out var connect) ? Text(connect, "url") : "";
            if (secret.Length == 0 || sessionId.Length == 0 || connectUrl.Length == 0)
            {
                throw new InvalidOperationException("Realtime session response is missing session_id, client_secret or connect.url");
            }

            var socket = new ClientWebSocket();
            socket.Options.AddSubProtocol(RelayProtocol);
            socket.Options.AddSubProtocol("rtsec." + secret);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(options.ConnectTimeout);
            await socket.ConnectAsync(new Uri(RelayUrl(_basePath, connectUrl)), timeout.Token).ConfigureAwait(false);
            var session = new RealtimeSession(sessionId, info, socket);
            try
            {
                await session.Connected.WaitAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                await session.CloseAsync().ConfigureAwait(false);
                throw new TimeoutException($"Realtime session {sessionId} did not connect within {options.ConnectTimeout.TotalMilliseconds} ms");
            }
            return session;
        }

        /// <summary>Resolves the session's <c>connect.url</c> against the base URL as ws:// or wss://.</summary>
        public static string RelayUrl(string basePath, string connectUrl)
        {
            var resolved = new UriBuilder(new Uri(new Uri(basePath.TrimEnd('/') + "/"), connectUrl));
            resolved.Scheme = resolved.Scheme switch { "https" => "wss", "http" => "ws", var other => other };
            if (resolved.Uri.IsDefaultPort) resolved.Port = -1;
            return resolved.Uri.ToString();
        }

        /// <summary><c>/v1/generations?id=realtime%3A&lt;session_id&gt;</c>, the final bill once settled.</summary>
        public static string FinalBillPath(string sessionId) => "/v1/generations?id=" + Uri.EscapeDataString("realtime:" + sessionId);
    }

    /// <summary>A connected realtime voice call. Provider events arrive unchanged as <see cref="JsonElement"/>s.</summary>
    public sealed class RealtimeSession
    {
        private readonly ClientWebSocket _socket;
        private readonly ConcurrentDictionary<string, ImmutableList> _listeners = new();
        private readonly List<Channel<JsonElement>> _subscribers = new();
        private readonly object _gate = new();
        private readonly SemaphoreSlim _sendLock = new(1, 1);
        private readonly TaskCompletionSource<JsonElement> _ended = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _connected = new(TaskCreationOptions.RunContinuationsAsynchronously);

        /// <summary>The realtime session ID.</summary>
        public string Id { get; }
        /// <summary>The create-session response, without <c>client_secret</c>.</summary>
        public JsonElement Info { get; }

        internal RealtimeSession(string id, JsonElement info, ClientWebSocket socket)
        {
            Id = id;
            var copy = new Dictionary<string, JsonElement>();
            foreach (var property in info.EnumerateObject())
            {
                if (property.Name is not "client_secret" and not "clientSecret") copy[property.Name] = property.Value.Clone();
            }
            Info = JsonSerializer.SerializeToElement(copy);
            _socket = socket;
            _ = _ended.Task.ContinueWith(task => _ = task.Exception, TaskContinuationOptions.OnlyOnFaulted);
            _ = Task.Run(ReadLoopAsync);
        }

        internal Task Connected => _connected.Task;

        /// <summary>Completes with <c>session.ended</c> however the call ends; faults with <see cref="RealtimeSessionClosedException"/> without it.</summary>
        public Task<JsonElement> Ended => _ended.Task;

        /// <summary>Sends PCM16 microphone audio (24 kHz for OpenAI and xAI, 16 kHz for Google) as <c>client.audio</c>.</summary>
        public Task SendAudioAsync(ReadOnlyMemory<byte> pcm16, CancellationToken cancellationToken = default) =>
            SendAsync(new Dictionary<string, object> { ["type"] = "client.audio", ["audio"] = Convert.ToBase64String(pcm16.Span) }, cancellationToken);

        /// <summary>Sends any event as JSON, for provider-specific messages.</summary>
        public async Task SendAsync(object @event, CancellationToken cancellationToken = default)
        {
            if (_ended.Task.IsCompleted || _socket.State != WebSocketState.Open)
            {
                throw new InvalidOperationException($"Realtime session {Id} is not open");
            }
            var bytes = JsonSerializer.SerializeToUtf8Bytes(@event);
            await _sendLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                await _socket.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken).ConfigureAwait(false);
            }
            finally
            {
                _sendLock.Release();
            }
        }

        /// <summary>Subscribes to one event type, or every event with "*". Dispose the result to unsubscribe.</summary>
        public IDisposable On(string type, Action<JsonElement> listener)
        {
            _listeners.AddOrUpdate(type, _ => new ImmutableList(listener), (_, list) => list.Add(listener));
            return new Unsubscriber(() => _listeners.AddOrUpdate(type, _ => new ImmutableList(), (_, list) => list.Remove(listener)));
        }

        /// <summary>Subscribes to <c>session.warning</c>.</summary>
        public IDisposable OnWarning(Action<JsonElement> listener) => On("session.warning", listener);

        /// <summary>Subscribes to <c>session.ended</c>.</summary>
        public IDisposable OnEnded(Action<JsonElement> listener) => On("session.ended", listener);

        /// <summary>Every event from now until the socket closes.</summary>
        public async IAsyncEnumerable<JsonElement> EventsAsync([EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            var channel = Channel.CreateUnbounded<JsonElement>();
            lock (_gate)
            {
                if (_ended.Task.IsCompleted) channel.Writer.TryComplete();
                else _subscribers.Add(channel);
            }
            try
            {
                await foreach (var item in channel.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
                {
                    yield return item;
                }
            }
            finally
            {
                lock (_gate) _subscribers.Remove(channel);
            }
        }

        /// <summary>
        /// Sends <c>session.end</c> and returns <c>session.ended</c>: reason, initiated_by, duration_seconds, usage,
        /// cost, billing_status and, unless settled, final_bill. Throws <see cref="RealtimeSessionClosedException"/>
        /// if the socket closes, or the timeout (default 60 seconds) passes, without it.
        /// </summary>
        public async Task<JsonElement> EndAsync(string? reason = null, bool? cancelResponse = null, TimeSpan? timeout = null)
        {
            if (!_ended.Task.IsCompleted)
            {
                var message = new Dictionary<string, object> { ["type"] = "session.end" };
                if (reason is not null) message["reason"] = reason;
                if (cancelResponse is not null) message["cancel_response"] = cancelResponse.Value;
                try
                {
                    await SendAsync(message).ConfigureAwait(false);
                }
                catch (Exception error) when (error is InvalidOperationException or WebSocketException)
                {
                    // The socket is closing; the reader reports how it ended.
                }
            }
            var wait = timeout ?? TimeSpan.FromSeconds(60);
            var finished = await Task.WhenAny(_ended.Task, Task.Delay(wait)).ConfigureAwait(false);
            if (finished != _ended.Task)
            {
                Fail(new RealtimeSessionClosedException(Id, null, "", $"timed out after {wait.TotalMilliseconds} ms"));
                await CloseAsync().ConfigureAwait(false);
            }
            return await _ended.Task.ConfigureAwait(false);
        }

        /// <summary>Closes the socket without waiting for the bill. The call is still billed; prefer <see cref="EndAsync"/>.</summary>
        public async Task CloseAsync()
        {
            try
            {
                if (_socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                    await _socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "client_closed", timeout.Token).ConfigureAwait(false);
                }
            }
            catch (Exception error) when (error is WebSocketException or OperationCanceledException or ObjectDisposedException)
            {
                // Already closing.
            }
        }

        private async Task ReadLoopAsync()
        {
            var buffer = new byte[64 * 1024];
            using var message = new MemoryStream();
            try
            {
                while (true)
                {
                    var result = await _socket.ReceiveAsync(buffer, CancellationToken.None).ConfigureAwait(false);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Fail(new RealtimeSessionClosedException(Id, (int?)result.CloseStatus, result.CloseStatusDescription ?? ""));
                        if (_socket.State == WebSocketState.CloseReceived) await CloseAsync().ConfigureAwait(false);
                        return;
                    }
                    message.Write(buffer, 0, result.Count);
                    if (!result.EndOfMessage) continue;
                    var bytes = message.ToArray();
                    message.SetLength(0);
                    if (result.MessageType == WebSocketMessageType.Text) Dispatch(bytes);
                }
            }
            catch (Exception error)
            {
                Fail(new RealtimeSessionClosedException(Id, (int?)_socket.CloseStatus, _socket.CloseStatusDescription ?? error.Message));
            }
        }

        private void Dispatch(byte[] bytes)
        {
            JsonElement element;
            try
            {
                using var document = JsonDocument.Parse(bytes);
                element = document.RootElement.Clone();
            }
            catch (JsonException)
            {
                return;
            }
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty("type", out var typeProperty) || typeProperty.ValueKind != JsonValueKind.String) return;
            var type = typeProperty.GetString()!;
            foreach (var key in new[] { type, "*" })
            {
                if (!_listeners.TryGetValue(key, out var list)) continue;
                foreach (var listener in list.Items)
                {
                    try { listener(element); }
                    catch { /* Listener errors must not break the session. */ }
                }
            }
            lock (_gate)
            {
                foreach (var subscriber in _subscribers) subscriber.Writer.TryWrite(element);
            }
            if (type == "relay.connected")
            {
                _connected.TrySetResult();
            }
            else if (type == "session.ended" && _ended.TrySetResult(element))
            {
                CompleteSubscribers();
                _connected.TrySetException(new InvalidOperationException($"Realtime session {Id} ended before connecting: {(element.TryGetProperty("reason", out var reason) ? reason.GetString() : "")}"));
            }
        }

        private void Fail(RealtimeSessionClosedException error)
        {
            if (_ended.TrySetException(error)) CompleteSubscribers();
            _connected.TrySetException(error);
        }

        private void CompleteSubscribers()
        {
            lock (_gate)
            {
                foreach (var subscriber in _subscribers) subscriber.Writer.TryComplete();
            }
        }

        private sealed class ImmutableList
        {
            public readonly Action<JsonElement>[] Items;
            public ImmutableList(params Action<JsonElement>[] items) => Items = items;
            public ImmutableList Add(Action<JsonElement> item) => new([.. Items, item]);
            public ImmutableList Remove(Action<JsonElement> item) => new(Array.FindAll(Items, existing => existing != item));
        }

        private sealed class Unsubscriber : IDisposable
        {
            private Action? _dispose;
            public Unsubscriber(Action dispose) => _dispose = dispose;
            public void Dispose() => Interlocked.Exchange(ref _dispose, null)?.Invoke();
        }
    }
}
