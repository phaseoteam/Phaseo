using Xunit;

namespace AiStatsSdk.Tests;

public class AsyncJobsTests
{
    [Fact]
    public void AsyncJobsResourceBuildsExpectedUrl()
    {
        var client = new AIStats("test", "https://api.phaseo.app/v1", enableDeprecationWarnings: false);

        var url = client.AsyncJobs.WebSocketUrl("video", "video 123", intervalMs: 1500, closeOnTerminal: false);

        Assert.Equal(
            "wss://api.phaseo.app/v1/async/video/video%20123/ws?interval_ms=1500&close_on_terminal=false",
            url
        );
    }
}
