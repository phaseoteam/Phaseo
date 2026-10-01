# Benchmark source IDs

Model mappings live in `v2_models.metadata.external_ids` in Supabase:

```json
{
  "external_ids": {
    "artificial_analysis": "042e8a37-fcd0-40f4-8f41-99215fb68eda",
    "epoch_ai": "Claude Sonnet 5.5"
  }
}
```

AA uses a UUID from its API/matching report. Epoch uses the exact `Model` value from [eci_scores.csv](https://epoch.ai/data/eci_scores.csv), including any date or configuration suffix. The example illustrates the shape; verify both source identities before assigning them to a canonical model.

An ID overrides automatic name matching. An absent key allows automatic matching; JSON `null` disables updates for that source while retaining existing scores. Empty strings are invalid. Preserve other metadata and external IDs when editing.

Attach an AA ID without replacing the rest of a model's metadata:

```sql
update public.v2_models
set metadata = coalesce(metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'external_ids',
      coalesce(metadata->'external_ids', '{}'::jsonb) ||
      jsonb_build_object('artificial_analysis', '092a3b0e-c5c8-45dc-bf1b-53673c8ff352')
    ),
    updated_at = now()
where model_slug = 'openai/gpt-6.1-sol';
```

Use `epoch_ai` in the same update for an Epoch mapping. Read back the row, then run a dry import to confirm it matches the intended source:

```sh
pnpm data:sync-artificial-analysis --report=artificial-analysis-report.json
pnpm data:sync-epoch-eci --report=epoch-eci-report.json
```

Both importers reject invalid, duplicate, or stale explicit mappings before writing results. AA expands an anchor ID to its reasoning family. Epoch attaches the exact mapped CSV row and excludes that model from fallback matching to other configurations. Unmatched and disabled models retain their previous scores and provenance.

After reviewing the report, add `--write` to publish scores immediately, or let the next scheduled run import them. Public caches expire under their normal TTLs. No schema migration or per-model code PR is required.
