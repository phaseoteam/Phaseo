using System.Runtime.CompilerServices;

namespace PhaseoSdk;

public sealed record Page<T>(IReadOnlyList<T> Data, bool HasMore);

public static class Pagination
{
    public static async IAsyncEnumerable<Page<T>> Pages<T>(
        Func<int, int, CancellationToken, Task<Page<T>>> fetch,
        int limit = 50,
        int offset = 0,
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        limit = Math.Max(1, limit);
        offset = Math.Max(0, offset);
        while (true)
        {
            var page = await fetch(limit, offset, cancellationToken).ConfigureAwait(false);
            yield return page;
            if (!page.HasMore || page.Data.Count == 0) yield break;
            offset += page.Data.Count;
        }
    }
}

public sealed class JobHandle<T>
{
    private static readonly HashSet<string> Failed = new(StringComparer.OrdinalIgnoreCase)
        { "failed", "cancelled", "canceled", "expired" };
    private readonly Func<string, CancellationToken, Task<T>> _fetch;
    private readonly Func<T, string> _status;

    public string Kind { get; }
    public string Id { get; }

    public JobHandle(string kind, string id, Func<string, CancellationToken, Task<T>> fetch, Func<T, string> status)
    {
        Kind = kind;
        Id = string.IsNullOrWhiteSpace(id) ? throw new ArgumentException("Job ID is required", nameof(id)) : id;
        _fetch = fetch;
        _status = status;
    }

    public Task<T> RefreshAsync(CancellationToken cancellationToken = default) => _fetch(Id, cancellationToken);

    public async Task<T> WaitAsync(TimeSpan? interval = null, CancellationToken cancellationToken = default)
    {
        var delay = interval.GetValueOrDefault(TimeSpan.FromSeconds(1));
        while (true)
        {
            var value = await RefreshAsync(cancellationToken).ConfigureAwait(false);
            var status = _status(value);
            if (string.Equals(status, "completed", StringComparison.OrdinalIgnoreCase)) return value;
            if (Failed.Contains(status)) throw new InvalidOperationException($"{Kind} job {Id} ended with status {status}.");
            await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
        }
    }
}
