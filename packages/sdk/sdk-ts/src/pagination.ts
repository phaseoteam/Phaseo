export type Page<T> = {
  data?: T[];
  has_more?: boolean;
};

export type PageOptions = {
  limit?: number;
  offset?: number;
};

export type PageFetcher<T, P extends Page<T> = Page<T>> = (options: Required<PageOptions>) => Promise<P>;

export async function* paginatePages<T, P extends Page<T> = Page<T>>(
  fetchPage: PageFetcher<T, P>,
  options: PageOptions = {},
): AsyncGenerator<P> {
  const limit = Math.max(1, Math.trunc(options.limit ?? 50));
  let offset = Math.max(0, Math.trunc(options.offset ?? 0));

  while (true) {
    const page = await fetchPage({ limit, offset });
    yield page;
    const count = Array.isArray(page.data) ? page.data.length : 0;
    if (!page.has_more || count === 0) return;
    offset += count;
  }
}

export async function* paginateItems<T, P extends Page<T> = Page<T>>(
  fetchPage: PageFetcher<T, P>,
  options: PageOptions = {},
): AsyncGenerator<T> {
  for await (const page of paginatePages(fetchPage, options)) {
    yield* page.data ?? [];
  }
}
