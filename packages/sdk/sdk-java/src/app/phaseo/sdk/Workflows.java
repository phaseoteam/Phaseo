package app.phaseo.sdk;

import java.time.Duration;
import java.util.Iterator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.function.Function;

public final class Workflows {
    private Workflows() {}

    public record Page<T>(List<T> data, boolean hasMore) {}

    @FunctionalInterface
    public interface PageFetcher<T> { Page<T> fetch(int limit, int offset); }

    public static final class PageIterator<T> implements Iterator<Page<T>>, Iterable<Page<T>> {
        private final PageFetcher<T> fetcher;
        private final int limit;
        private int offset;
        private boolean done;

        public PageIterator(int limit, int offset, PageFetcher<T> fetcher) {
            this.limit = Math.max(1, limit);
            this.offset = Math.max(0, offset);
            this.fetcher = fetcher;
        }

        @Override public Iterator<Page<T>> iterator() { return this; }
        @Override public boolean hasNext() { return !done; }
        @Override public Page<T> next() {
            if (done) throw new NoSuchElementException();
            Page<T> page = fetcher.fetch(limit, offset);
            int count = page.data() == null ? 0 : page.data().size();
            offset += count;
            done = !page.hasMore() || count == 0;
            return page;
        }
    }

    public static final class JobHandle<T> {
        private static final Set<String> FAILED = Set.of("failed", "cancelled", "canceled", "expired");
        private final String kind;
        private final String id;
        private final Function<String, T> fetcher;
        private final Function<T, String> status;

        public JobHandle(String kind, String id, Function<String, T> fetcher, Function<T, String> status) {
            if (id == null || id.isBlank()) throw new IllegalArgumentException("Job ID is required");
            this.kind = kind;
            this.id = id;
            this.fetcher = fetcher;
            this.status = status;
        }

        public String kind() { return kind; }
        public String id() { return id; }
        public T refresh() { return fetcher.apply(id); }

        public T waitForCompletion(Duration interval) throws InterruptedException {
            long delay = Math.max(1, interval.toMillis());
            while (true) {
                T value = refresh();
                String current = status.apply(value).toLowerCase();
                if (current.equals("completed")) return value;
                if (FAILED.contains(current)) throw new IllegalStateException(kind + " job " + id + " ended with status " + current);
                Thread.sleep(delay);
            }
        }
    }
}
