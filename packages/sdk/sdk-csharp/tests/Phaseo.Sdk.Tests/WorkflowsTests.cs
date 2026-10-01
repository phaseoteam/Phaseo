using PhaseoSdk;
using Xunit;

namespace Phaseo.Sdk.Tests;

public class WorkflowsTests
{
    [Fact]
    public async Task PaginationAndJobHandleAdvanceSafely()
    {
        var offsets = new List<int>();
        var pages = Pagination.Pages<int>((limit, offset, _) => {
            offsets.Add(offset);
            return Task.FromResult(offset == 0 ? new Page<int>([1, 2], true) : new Page<int>([3], false));
        }, limit: 2);
        var collected = new List<int>();
        await foreach (var page in pages) collected.AddRange(page.Data);
        Assert.Equal([1, 2, 3], collected);
        Assert.Equal([0, 2], offsets);

        var statuses = new Queue<string>(["running", "completed"]);
        var handle = new JobHandle<string>("video", "video_1", (_, _) => Task.FromResult(statuses.Dequeue()), value => value);
        Assert.Equal("completed", await handle.WaitAsync(TimeSpan.Zero));
    }
}
