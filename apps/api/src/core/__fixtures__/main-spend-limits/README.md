# main's spend-limit coordinator and isolate

Copied unchanged from `origin/main` at 024e98034b (only the import of `spend-limits.shared` points here),
so `spend-limit-rollout.test.ts` can run the deployed protocol against this branch's in both directions:
the SpendLimit object is hosted by one Worker and called from others deployed separately.
