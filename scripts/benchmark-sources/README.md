# Benchmark sources

Public leaderboards we read once a day into `v2_benchmark_results`.

```sh
pnpm data:sync-benchmark-sources                      # every source, dry run
pnpm data:sync-benchmark-sources --only=arc-prize     # one source
pnpm data:sync-benchmark-sources --write --report=report.json
pnpm exec tsx --test scripts/benchmark-sources/core.test.ts
```

The `Benchmark sources sync` workflow runs every source at 05:17 UTC and uploads the matching report.

## How a run works

1. Each source in `sources/index.ts` fetches its board and returns observations: benchmark id, the model label as the board prints it, the value, and optional effort, harness, confidence interval, cost, duration and output tokens.
2. `match.ts` maps every label to a catalogue model. It tries the whole label, then the label without its reasoning effort, each with and without a trailing release date. If several models match, it picks the one active, visible model. Anything still ambiguous is reported and never guessed.
3. `core.ts` keeps one row per benchmark × model × effort × harness (the best score wins), ranks each benchmark and gives every row a stable id.
4. With `--write`, results are upserted in place, results the board no longer lists are deleted, and `v2_benchmark_sources` records the run. A run that returns fewer than the source's `minRows`, or would replace more than half the stored results, is refused, and the stored results stay.
5. The day's observations, matched or not, go to `benchmark-source-archive/<date>.json.gz` in storage. That file is the history: scraped rows have no `effective_to` versions and stay out of `v2_catalogue_row_history`.

## Fixing a model that doesn't match

Look up `unmatched_labels` on the source's `v2_benchmark_sources` row (or the workflow report), then pin the label:

```sql
insert into public.v2_benchmark_source_model_pins (source_id, label, model_slug, effort)
values ('arc-prize', 'gpt-6.2 astra (thinking 32k)', 'openai/gpt-6.2-astra', 'high');
-- source_id null pins the label for every source; ignored = true drops it (human baselines, ensembles).
```

Labels are stored lowercased and trimmed.

## Adding a source

- Add `sources/<id>.ts` exporting a `BenchmarkSource` and register it in `sources/index.ts`.
- Reuse an existing `v2_benchmarks` id when the board is the same benchmark (e.g. `arc-agi-2`).
- Read the board's own data file or API when it has one; parse HTML only as a last resort. `parse.ts` has CSV, number, `__NEXT_DATA__`, Next.js flight payload and HTML table helpers.
- Descriptions say what the model is asked to do, then how it is scored. State only what the publisher states.
- Add a parser test with a small fixture to `core.test.ts`.
- Credit the publisher in `attribution`. The data keeps each publisher's terms.
