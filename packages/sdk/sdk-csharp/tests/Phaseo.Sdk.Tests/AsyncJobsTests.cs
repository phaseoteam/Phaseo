using Xunit;

namespace PhaseoSdk.Tests;

public class AsyncJobsTests
{
    [Fact]
    public void AsyncJobsResourceBuildsExpectedUrl()
    {
        var client = new Phaseo("test", "https://api.phaseo.ai/v1", enableDeprecationWarnings: false);

        var url = client.AsyncJobs.WebSocketUrl("video", "video 123", intervalMs: 1500, closeOnTerminal: false);

        Assert.Equal(
            "wss://api.phaseo.ai/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
            url
        );
    }
}
