# SDK Rollout Deck: Latest Changes and Features

Date range covered: March 22-23, 2026
Audience: Product, Developer Experience, and Integrations

## Slide 1 - Executive Summary
- We shipped a unified SDK sweep across TypeScript, Python, Go, C#, Java, PHP, and Ruby in one coordinated rollout.
- The headline change is model lifecycle awareness (deprecation/retirement visibility and guardrails) across all functional SDKs.
- We expanded and aligned SDK surfaces to OpenAPI so wrappers map more closely to live Gateway REST behavior.
- We followed up with version-literal auto-sync checks to keep SDK telemetry/version metadata consistent in CI.

## Slide 2 - Rollout Timeline
- March 22, 2026: SDK changelog entry added for the 1.1.0 SDK line (`apps/docs/v1/sdk-changelog.mdx`).
- March 23, 2026: Unified SDK + model-surface release landed (`31a22682`).
- March 23, 2026: Telemetry version literal sync/check automation landed (`68f2d591`).

## Slide 3 - Cross-Language Features Delivered
- Model lifecycle support in SDK clients:
  - `getModelDeprecationInfo(...)` / equivalent per language.
  - `validateModel(...)` / equivalent to gate retired models.
  - Warnings emitted once per model, with optional warnings-as-errors mode.
- API key ergonomics improved:
  - SDKs now read `PHASEO_API_KEY` by default where applicable.
- Model typing future-proofing:
  - Strongly typed known model IDs retained, with string fallback for newly released models before next SDK publish.
- Raw access paths added:
  - Raw generated client + generic request passthrough methods exposed in multiple SDKs for advanced use cases.

## Slide 4 - Surface Expansion and API Alignment
- SDK wrappers were expanded from thin/preview coverage to broader operational coverage (language-dependent but now includes key endpoints such as):
  - `chat.completions`, `responses`, `anthropic.messages`.
  - `embeddings`, `moderations`.
  - `images.generate` and `images.edit`.
  - `audio.speech`, `audio.transcriptions`, `audio.translations`.
  - `video.generate` and related operations where exposed.
  - `batches`, `files`, `models`, `providers`, `analytics`, `credits`, `activity`, `health`.
- OpenAPI model surfaces were synced, including lifecycle metadata and newer model IDs.

## Slide 5 - Language Highlights
- TypeScript (`@phaseo/sdk`):
  - `ModelId` now supports known IDs + string fallback.
  - Added lifecycle warning controls, `models.validate`, and `models.getDeprecationInfo`.
  - Added `rawClient()` and generic `request(...)` helper.
- Python (`@phaseo/py-sdk`):
  - Migrated several methods from "coming soon" stubs to live ops (image, video, speech, transcription, translation, batch/files).
  - Added lifecycle warning/validation path and `raw_client`/`request` access.
  - Added env-based API key defaulting.
- Go/C#/Java/PHP/Ruby:
  - Upgraded from early/preview wrapper posture to fuller high-level Phaseo clients.
  - Added lifecycle handling and expanded smoke/lifecycle/devtools tests.
- PHP-specific:
  - Added bundled CA cert and deterministic TLS fallback chain for cross-environment SSL reliability.

## Slide 6 - Devtools and Reliability Improvements
- Devtools viewer minor release (`@phaseo/devtools-viewer`):
  - URL-persisted generation selection.
  - Better request ID preference/lookup.
  - Improved response detail rendering and usage/cost fallbacks.
- CI/release hardening:
  - Added SDK publish/readiness workflows for additional languages.
  - Added automated script to verify SDK telemetry version literals remain in sync with package versions.

## Slide 7 - Testing and Quality Signals
- Added/expanded lifecycle and devtools tests in C#, Go, Java, PHP, and Ruby.
- Added new smoke routes for SDK-specific response flows in multiple language packages.
- Improved release/process docs for SDK packaging and publishing (`packages/sdk/RELEASING.md`).

## Slide 8 - Suggested Talk Track for Stakeholders
- "We moved from uneven SDK maturity to a coordinated, cross-language baseline with lifecycle-safe model usage."
- "Developers can adopt new models faster without waiting on package updates, while still getting typed ergonomics and deprecation guardrails."
- "The release pipeline now has stronger automation for consistency and publish readiness across language SDKs."

## Appendix - Evidence Anchors
- Commits:
  - `31a22682` - feat: unify SDKs + council + multimodal + docs in one release
  - `68f2d591` - chore(sdk): auto-sync and validate telemetry version literals
- Changesets:
  - `.changeset/sdk-model-surface-minor-bump.md`
  - `.changeset/devtools-viewer-minor-polish.md`
- Docs:
  - `apps/docs/v1/sdk-changelog.mdx`