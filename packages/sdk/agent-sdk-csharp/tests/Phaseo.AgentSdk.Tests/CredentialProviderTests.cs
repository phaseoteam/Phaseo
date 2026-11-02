using System.Net;
using System.Net.Sockets;
using System.Text;
using PhaseoAgentSdk;
using Xunit;

namespace Phaseo.AgentSdk.Tests;

public class CredentialProviderTests
{
    [Fact]
    public async Task ApiKeyProviderReachesTheCoreClient()
    {
        var port = FreePort();
        using var listener = new HttpListener();
        listener.Prefixes.Add($"http://localhost:{port}/");
        listener.Start();
        var authorizations = new List<string?>();
        var server = Task.Run(async () =>
        {
            while (listener.IsListening)
            {
                HttpListenerContext context;
                try { context = await listener.GetContextAsync(); }
                catch (Exception error) when (error is HttpListenerException or ObjectDisposedException) { return; }
                lock (authorizations) authorizations.Add(context.Request.Headers["Authorization"]);
                var body = context.Request.Url!.AbsolutePath.EndsWith("/responses", StringComparison.Ordinal)
                    ? "{\"id\":\"resp_1\",\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"hi\"}]}]}"
                    : "{\"data\":[]}";
                var bytes = Encoding.UTF8.GetBytes(body);
                context.Response.ContentType = "application/json";
                context.Response.ContentLength64 = bytes.Length;
                await context.Response.OutputStream.WriteAsync(bytes);
                context.Response.Close();
            }
        });

        try
        {
            var calls = 0;
            Func<CancellationToken, ValueTask<string>> provider = _ => ValueTask.FromResult($"workload-token-{Interlocked.Increment(ref calls)}");
            var client = global::PhaseoAgentSdk.AgentSdk.CreateGatewayAgentClient(new GatewayAgentClientOptions
            {
                Model = "openai/gpt-5.4-nano",
                ClientOptions = new Dictionary<string, object?>
                {
                    ["apiKey"] = provider,
                    ["baseUrl"] = $"http://localhost:{port}/v1",
                },
            });

            await client.Generate(new ModelRequest("agent", new[] { new Message("user", "hello") }, Array.Empty<Tool>()));
        }
        finally
        {
            listener.Stop();
            await server;
        }

        Assert.NotEmpty(authorizations);
        Assert.All(authorizations, value => Assert.StartsWith("Bearer workload-token-", value));
        Assert.Equal(authorizations.Count, authorizations.Distinct().Count());
    }

    private static int FreePort()
    {
        var socket = new TcpListener(IPAddress.Loopback, 0);
        socket.Start();
        var port = ((IPEndPoint)socket.LocalEndpoint).Port;
        socket.Stop();
        return port;
    }
}
