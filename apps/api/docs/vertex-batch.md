# Vertex Batch operations

The managed `google-vertex` Batch adapter submits publisher Gemini models through
`BatchPredictionJob`. Public inline requests become JSONL in Cloud Storage. Job
metadata retains the bucket, input object and output prefix for reconciliation;
the public results route streams normalized rows without exposing GCS downloads.

Configure these bindings on gateway and reconciliation Workers:

| Binding | Production value |
| --- | --- |
| `GOOGLE_VERTEX_PROJECT` | `ai-stats-469110` |
| `GOOGLE_VERTEX_PROJECT_NUMBER` | `916177560808` |
| `GOOGLE_VERTEX_BATCH_LOCATION` | `global` |
| `GOOGLE_VERTEX_BATCH_BUCKET` | `ai-stats-469110-phaseo-vertex-batch-us-central1` |

`GOOGLE_VERTEX_ACCESS_TOKEN` or `GOOGLE_VERTEX_API_KEY` supplies the existing
managed service-account credential. OAuth uses the shared Vertex token resolver.
BYOK is rejected before reservation; the adapter must never run a customer's
credential against the managed bucket. Native job names may use the numeric
project identity, which is why both project bindings are present.

The dedicated bucket is Standard storage in `us-central1`, with uniform access,
public access prevention, no versioning or soft-delete retention, and Delete
lifecycle rules after 30 days for `inputs/` and `outputs/`. Standard Vertex Batch
does not promise EU processing or storage; `google-vertex-eu` remains blocked.

The gateway service account needs bucket-scoped `roles/storage.objectUser`. The
Vertex service agent needs bucket-scoped object viewer and creator roles.
On 2026-10-15, the gateway identity was also granted project custom role
`projects/ai-stats-469110/roles/phaseoVertexBatchJobs`, containing only:

- `aiplatform.batchPredictionJobs.create`
- `aiplatform.batchPredictionJobs.get`
- `aiplatform.batchPredictionJobs.list`
- `aiplatform.batchPredictionJobs.cancel`

Input objects use `inputs/{workspaceId}/{batchId}.jsonl`, and output prefixes use
`outputs/{workspaceId}/{batchId}/`. Input uploads use `ifGenerationMatch=0`.
The job intent is persisted before native creation. A definite rejection deletes
the staged input and finalizes the reservation. Network failures and ambiguous
responses retain the input and hold for manual review; do not retry creation.
Cancellation remains pending until native polling confirms the terminal state.

Gemini preserves the `phaseo_custom_id` column in its output JSONL. A live
one-request Gemini 3.1 Flash Lite job confirmed this on 2026-10-15; do not infer
correlation from row order or assume the generic `instanceConfig.keyField` causes
Gemini to emit a `key` field. Billing rejects duplicate or unknown request IDs,
checks successful output counts, and uses the existing atomic Batch settlement.

Downloads list only the stored workspace prefix using fixed Google API hosts.
They cap output at 100 JSONL files, 10,000 rows, 512 MiB total and 8 MiB per line,
with a 30-second read idle timeout and 10-minute overall deadline. Billing retains
compact usage metadata rather than generated content. Download cancellation
cancels the active object reader. Inputs and results remain subject to the bucket
lifecycle after terminal completion.
