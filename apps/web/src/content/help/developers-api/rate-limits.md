---
title: Understand Rate Limits
description: What to do when requests are throttled and how to back off safely.
order: 3
updated: 2026-02-06
---

If requests are throttled, implement retries with exponential backoff.

## Recommendations

- Respect rate limit headers from API responses.
- Retry only idempotent requests.
- Queue bursts rather than firing all requests at once.
- Spread traffic across time windows.

## If limits block production traffic

- Reduce concurrency in your client.
- Contact support with request IDs and timestamps.
