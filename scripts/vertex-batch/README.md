# Vertex Batch preparation

This prepares Cloud Storage for managed Vertex Gemini batch inference. The gateway
still blocks Vertex Batch. Provisioning a bucket alone does not enable the API.

## Proposed Phaseo bucket

| Setting | Value |
| --- | --- |
| Project | `ai-stats-469110` (`916177560808`) |
| Bucket | `gs://ai-stats-469110-phaseo-vertex-batch-us-central1` |
| Storage | Standard, single region, flat namespace |
| Location | `us-central1` |
| Access | Uniform bucket-level IAM; public access prevention enforced |
| Cleanup | Delete objects under `inputs/` and `outputs/` at age 30 days |
| Recovery | Versioning off; soft delete off for this new temporary-data bucket |

The US bucket is for the standard `google-vertex` provider. It must never back
`google-vertex-eu` or requests requiring EU residency. Confirm the target model's
batch location before provisioning; `global` jobs do not promise US-only processing.

Lifecycle cleanup is asynchronous, so 30 days is an eligibility threshold, not an
exact deletion deadline. Disabling soft delete avoids an additional billed recovery
period, but deleted objects cannot be recovered. Persist job state and billing in
Phaseo independently of these temporary objects. Do not enable Bucket Lock or a
minimum-retention policy for this workflow.

## Preview

From the repository root in PowerShell:

```powershell
./scripts/vertex-batch/prepare-storage.ps1 `
  -ProjectId ai-stats-469110 `
  -ProjectNumber 916177560808 `
  -GatewayServiceAccount vertex-express@ai-stats-469110.iam.gserviceaccount.com
```

This emits the bucket body and three bucket-scoped IAM grants without contacting
Google. Check the account against the deployed gateway credential before applying;
the account above was inspected from local Vertex configuration on October 15, 2026.

Run offline checks with `./scripts/vertex-batch/prepare-storage.test.ps1`. These
exercise preview and provisioning with fake cloud boundaries; they do not create
resources or require Google credentials.

## Provisioning

After reviewing the preview, use the same command with `-Apply` under an operator
identity authorized to create buckets and set their IAM in the explicit project.
The script never selects a default project, creates credentials, grants project-wide
roles, or changes an existing bucket. A name collision stops setup. It creates the
private bucket with cleanup/recovery settings in the initial API request, then adds:

- Gateway service account: `roles/storage.objectUser` on this dedicated bucket.
- Vertex service agent: `roles/storage.objectViewer` and
  `roles/storage.objectCreator` on this dedicated bucket.

The setup operator also needs project read access. The Vertex service agent must
already exist and have the normal Vertex service-agent role. Enable required APIs
through the project's usual administration workflow if absent. The gateway identity
needs appropriate Vertex job permissions as well as bucket access; these storage
grants do not grant job creation rights.

The script uses `gcloud` for operator authentication and IAM, and the Storage JSON
API for atomic bucket configuration. It never prints the access token. Inspect the
returned bucket and IAM readback. If a grant fails after creation, the new bucket
remains private; repair only its missing grants manually. Do not rerun with a
different bucket name to hide a partial failure.

The earlier gateway-identity bucket-list probe returned HTTP 403. That establishes
missing project-level list access, not whether it can access a particular bucket.
Verify named-bucket/object access using the actual gateway identity after setup.

## Gateway implementation

Follow the existing provider-owned batch adapter and persisted async lifecycle:

1. Add Vertex credential resolution to
   `apps/api/src/core/batch-credentials.ts`. Reuse the existing Vertex OAuth/token
   helper; preserve the selected credential source through polling, cancellation,
   results and finalization. Initially support the managed project only. Reject
   unsupported BYOK/project combinations explicitly rather than using Phaseo's
   bucket with a customer's credential or falling back to managed credentials.
2. Add a Vertex-owned GCS/job adapter alongside
   `apps/api/src/core/batch-provider-adapters.ts`. Configure project, batch job
   location and bucket independently from synchronous Vertex location. Proposed
   bindings are `GOOGLE_VERTEX_BATCH_BUCKET` and `GOOGLE_VERTEX_BATCH_LOCATION`;
   they are not runtime bindings yet. Register any bindings in the existing runtime
   types, deployment scripts and all required Worker environments when implemented.
3. Accept inline requests first, applying the existing endpoint translation,
   workspace policy and credit reservation before upload. Write bounded JSONL to
   `inputs/{workspace-id}/{batch-id}/requests.jsonl`. Keep a durable index-to-custom-ID
   mapping: do not assume output order or undocumented passthrough fields. Avoid
   copying arbitrary caller-supplied `gs://` paths or following provider URLs.
4. Submit a `BatchPredictionJob` with a unique recovery label/display name and
   `outputs/{workspace-id}/{batch-id}/` as its destination. Persist the native
   resource name immediately. Treat ambiguous submissions as manual review unless
   a provider lookup proves whether the original job exists; never blindly recreate
   a potentially paid job. Clean up an input object after a confirmed pre-dispatch
   failure. Keep recoverable inputs on an ambiguous submission.
5. Reuse `gateway_async_operations` polling/reconciliation, job metadata and webhook
   delivery. Map success, failure, partial success, cancellation and expiration;
   preserve provider state and counts. Cancel via the native resource. Apply existing
   workspace ownership checks before every status, cancel and results operation.
6. In `batch-results.ts` and finalization, list only the stored output prefix. Bound
   pages, file count, bytes, line size and time; stream JSONL rather than buffering
   the whole output. Treat output content as untrusted. Reconcile each row with the
   persisted input mapping, including failed rows and partial jobs. Settle the batch
   pricing plan exactly once from actual usage, including reasoning/cache meters;
   preserve async batch pricing even if a row reports an interactive traffic type.
7. Keep `batch-capabilities.ts` blocked until deterministic contract tests cover
   create/persist/poll/cancel/results, permission and upload failures, duplicate
   finalization, partial output, ambiguous submission, cancellation charges,
   credential continuity and cross-workspace access. Keep embeddings and EU Vertex
   blocked until their distinct contracts are implemented and verified.

## Acceptance and enablement

After deploying the adapter and verifying bucket access with the deployed identity,
submit one inline `google/gemini-3.1-flash-lite` batch containing `Reply only OK.`,
with a 64-token output cap and no tools. Persist the public/native IDs, then verify
terminal completion, retrievable output, a persisted request row, batch-rate pricing
and wallet reservation settlement. A successful create response is insufficient.
Verify duplicate retrieval/finalization cannot charge twice and remove the test key.

Then update canonical Supabase capability/variant evidence for the tested model,
with explicit scope for shared-adapter evidence on Argon. Enable only confirmed
provider/model/endpoint combinations. Keep the existing Argon Standard/Flex/Priority
routes and AI Studio Batch unchanged. Use the provider onboarding skill for catalogue
writes; do not edit archived catalogue JSON or publish a data-only migration.

## Sources

- [Vertex batch input, submission and polling](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference/new-job-from-cloud-storage)
- [Storage bucket creation API](https://docs.cloud.google.com/storage/docs/json_api/v1/buckets/insert)
- [Storage lifecycle management](https://docs.cloud.google.com/storage/docs/lifecycle)
- [Soft-delete configuration](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/create#--soft-delete-duration)
- [Storage pricing](https://cloud.google.com/storage/pricing?hl=en)

Source and repository review: October 15, 2026. No bucket, IAM, gateway binding or
catalogue enablement was applied as part of this preparation.
