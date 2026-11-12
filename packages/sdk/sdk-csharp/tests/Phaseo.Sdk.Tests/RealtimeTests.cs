using System.Net;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class RealtimeTests
{
    private const string Ended = "{\"type\":\"session.ended\",\"session_id\":\"rt_test\",\"reason\":\"client_requested\",\"initiated_by\":\"client\",\"duration_seconds\":12.5,\"usage\":{\"output_audio_tokens\":200},\"cost\":{\"total_usd\":0.01,\"total_nanos\":10000000,\"estimated\":false,\"estimate_basis\":null,\"debt_nanos\":0,\"uncollected_nanos\":0,\"currency\":\"USD\"},\"billing_status\":\"settled\"}";

    /// <summary>Plays the relay on a local TCP port using the BCL server-side WebSocket.</summary>
    private sealed class FakeRelay : IAsyncDisposable
    {
        private readonly TcpListener _listener = new(IPAddress.Loopback, 0);
        private readonly Task _run;
        public readonly List<JsonElement> Received = new();
        public string? Protocols;
        public string? Path;
        public JsonElement Created;

        public FakeRelay(Func<FakeRelay, WebSocket, Task> behaviour, bool sendConnected = true)
        {
            _listener.Start();
            _run = Task.Run(async () =>
            {
                using var client = await _listener.AcceptTcpClientAsync();
                var stream = client.GetStream();
                var head = new StringBuilder();
                while (!head.ToString().EndsWith("\r\n\r\n")) head.Append((char)stream.ReadByte());
                var lines = head.ToString().Split("\r\n");
                Path = lines[0].Split(' ')[1];
                string? key = null;
                foreach (var line in lines)
                {
                    var colon = line.IndexOf(':');
                    if (colon < 0) continue;
                    var name = line[..colon].Trim().ToLowerInvariant();
                    if (name == "sec-websocket-key") key = line[(colon + 1)..].Trim();
                    if (name == "sec-websocket-protocol") Protocols = line[(colon + 1)..].Trim();
                }
                var accept = Convert.ToBase64String(SHA1.HashData(Encoding.ASCII.GetBytes(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")));
                var response = $"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\nSec-WebSocket-Protocol: statsync-realtime\r\n\r\n";
                await stream.WriteAsync(Encoding.ASCII.GetBytes(response));
                using var socket = WebSocket.CreateFromStream(stream, isServer: true, subProtocol: "statsync-realtime", keepAliveInterval: TimeSpan.Zero);
                if (sendConnected) await SendAsync(socket, "{\"type\":\"relay.connected\",\"session_id\":\"rt_test\"}");
                await behaviour(this, socket);
                await Task.Delay(100);
            });
        }

        public int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;

        public static Task SendAsync(WebSocket socket, string text) =>
            socket.SendAsync(Encoding.UTF8.GetBytes(text), WebSocketMessageType.Text, true, CancellationToken.None);

        public async Task<bool> ReceiveUntilAsync(WebSocket socket, string type)
        {
            var buffer = new byte[64 * 1024];
            while (true)
            {
                var result = await socket.ReceiveAsync(buffer, CancellationToken.None);
                if (result.MessageType == WebSocketMessageType.Close) return false;
                var element = JsonDocument.Parse(buffer.AsMemory(0, result.Count)).RootElement.Clone();
                lock (Received) Received.Add(element);
                if (element.GetProperty("type").GetString() == type) return true;
            }
        }

        public PhaseoSdk.Phaseo Client()
        {
            var handler = new StubHttpHandler(request =>
            {
                Created = JsonDocument.Parse(request.Content!.ReadAsStringAsync().Result).RootElement.Clone();
                var json = "{\"id\":\"rt_test\",\"session_id\":\"rt_test\",\"client_secret\":\"rtsec_secret\",\"connect\":{\"transport\":\"websocket\",\"url\":\"ws://127.0.0.1:" + Port + "/v1/realtime/sessions/rt_test/relay\"},\"max_duration_seconds\":3600}";
                return new HttpResponseMessage(HttpStatusCode.Created) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
            });
            return new PhaseoSdk.Phaseo(apiKey: "sk_test_123", basePath: "http://localhost/v1", enableDeprecationWarnings: false, httpClient: new HttpClient(handler));
        }

        public async ValueTask DisposeAsync()
        {
            _listener.Stop();
            try { await _run.WaitAsync(TimeSpan.FromSeconds(5)); } catch { }
        }
    }

    [Fact]
    public async Task ConnectStreamsEventsAndEndReturnsTheBill()
    {
        await using var relay = new FakeRelay(async (self, socket) =>
        {
            await self.ReceiveUntilAsync(socket, "client.audio");
            await FakeRelay.SendAsync(socket, "{\"type\":\"response.output_audio.delta\",\"delta\":\"AAA=\"}");
            await FakeRelay.SendAsync(socket, "{\"type\":\"session.warning\",\"code\":\"max_duration_approaching\",\"seconds_remaining\":120}");
            await self.ReceiveUntilAsync(socket, "session.end");
            await FakeRelay.SendAsync(socket, Ended);
            await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        });
        var session = await relay.Client().Realtime.ConnectAsync(new RealtimeConnectOptions { Model = "openai/gpt-realtime-2", Voice = "marin" });
        Assert.Equal("rt_test", session.Id);
        Assert.False(session.Info.TryGetProperty("client_secret", out _));
        Assert.Equal("marin", relay.Created.GetProperty("voice").GetString());
        Assert.Equal("statsync-realtime,rtsec.rtsec_secret", relay.Protocols!.Replace(" ", ""));
        Assert.Equal("/v1/realtime/sessions/rt_test/relay", relay.Path);

        var warnings = new List<JsonElement>();
        using var warningSubscription = session.OnWarning(warnings.Add);
        var types = new List<string>();
        var reading = Task.Run(async () =>
        {
            await foreach (var item in session.EventsAsync())
            {
                types.Add(item.GetProperty("type").GetString()!);
                if (types.Count == 2) break;
            }
        });
        await Task.Delay(50);
        await session.SendAudioAsync(new byte[] { 0, 1, 2, 255 });
        await reading.WaitAsync(TimeSpan.FromSeconds(5));
        Assert.Equal(new[] { "response.output_audio.delta", "session.warning" }, types);
        Assert.Equal(120, warnings[0].GetProperty("seconds_remaining").GetInt32());

        var ended = await session.EndAsync("caller hung up", cancelResponse: false, timeout: TimeSpan.FromSeconds(5));
        Assert.Equal("client_requested", ended.GetProperty("reason").GetString());
        Assert.Equal(0.01, ended.GetProperty("cost").GetProperty("total_usd").GetDouble());
        Assert.Equal("AAEC/w==", relay.Received[0].GetProperty("audio").GetString());
        var end = relay.Received[^1];
        Assert.Equal("session.end", end.GetProperty("type").GetString());
        Assert.Equal("caller hung up", end.GetProperty("reason").GetString());
        Assert.False(end.GetProperty("cancel_response").GetBoolean());
    }

    [Fact]
    public async Task EndThrowsWithFinalBillWhenSocketClosesWithoutSessionEnded()
    {
        await using var relay = new FakeRelay(async (self, socket) =>
        {
            await self.ReceiveUntilAsync(socket, "session.end");
            await socket.CloseOutputAsync(WebSocketCloseStatus.InternalServerError, "realtime_client_socket_error", CancellationToken.None);
        });
        var session = await relay.Client().Realtime.ConnectAsync(new RealtimeConnectOptions { Model = "openai/gpt-realtime-2" });
        var error = await Assert.ThrowsAsync<RealtimeSessionClosedException>(() => session.EndAsync());
        Assert.Equal(1011, error.CloseCode);
        Assert.Equal("/v1/generations?id=realtime%3Art_test", error.FinalBillPath);
        Assert.Contains("GET /v1/generations?id=realtime%3Art_test", error.Message);
    }

    [Fact]
    public async Task EndTimesOut()
    {
        await using var relay = new FakeRelay(async (self, socket) => await self.ReceiveUntilAsync(socket, "never"));
        var session = await relay.Client().Realtime.ConnectAsync(new RealtimeConnectOptions { Model = "openai/gpt-realtime-2" });
        var error = await Assert.ThrowsAsync<RealtimeSessionClosedException>(() => session.EndAsync(timeout: TimeSpan.FromMilliseconds(100)));
        Assert.Contains("timed out after 100 ms", error.Message);
    }

    [Fact]
    public async Task CancellingConnectBeforeRelayConnectedClosesTheSocket()
    {
        var clientClosed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var relay = new FakeRelay(async (self, socket) =>
        {
            var sawEvent = await self.ReceiveUntilAsync(socket, "never");
            clientClosed.TrySetResult(!sawEvent);
        }, sendConnected: false);
        using var cancel = new CancellationTokenSource(TimeSpan.FromMilliseconds(300));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            relay.Client().Realtime.ConnectAsync(new RealtimeConnectOptions { Model = "openai/gpt-realtime-2" }, cancel.Token));
        Assert.True(await clientClosed.Task.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public void RelayUrlResolvesRelativeConnectUrls()
    {
        Assert.Equal("wss://api.phaseo.app/v1/realtime/sessions/rt_x/relay", RealtimeResource.RelayUrl("https://api.phaseo.app/v1", "/v1/realtime/sessions/rt_x/relay"));
        Assert.Equal("ws://localhost:8787/v1/realtime/sessions/rt_x/relay", RealtimeResource.RelayUrl("http://localhost:8787/v1", "/v1/realtime/sessions/rt_x/relay"));
    }

    private sealed class StubHttpHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, HttpResponseMessage> _handler;
        public StubHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> handler) => _handler = handler;
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => Task.FromResult(_handler(request));
    }
}
