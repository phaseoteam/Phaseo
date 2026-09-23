# Workspace mutation feedback

Scope: existing authenticated settings screens for BYOK, guardrails, privacy and
private models. Reuse the current Sonner live-region messages and inline autosave
status; no new layout, tokens, navigation, permissions, or responsive behavior.
Server actions preserve the web API's optional `gatewayCacheInvalidated` result.

Acceptance states: loading remains loading until the action settles; committed
writes remain saved even if publication fails; errors from the database remain
errors; compound saves report any publication failure. Do not replay creates or
reorders on publication failure. Keep existing settings-query invalidation and
server cache refresh. No new telemetry, credentials, or third-party calls.

The message says refresh failed, not that a durable retry is scheduled. Source
leases still bound cached data age; full durable publication is separate work.
Older responses without the flag preserve existing success feedback.

Validation: deterministic action/feedback tests, existing settings tests, web
type-check/lint/build where the local environment supports them. No signed-in
staging website is available, so local checks are not a live website proof.

Results (2026-09-23): 100 focused tests pass, including all 14 mutation actions,
compound feedback, missing authentication, committed-write publication failure,
database rejection, and the rendered BYOK fallback event handler. Website
`tsc --noEmit` and production build pass. Targeted lint has zero errors and 13
existing-pattern warnings. Build reports existing help-content glob warnings and
public homepage prerender fetch cancellations, but completes all 297 pages.

The broader settings run is not green: 209 pass, five fail across two suites
(`SettingsUi.contract` and `guardrailPreview`). The failed markup assertions and
preview calculation are unchanged from HEAD; one expects the old multi-section
handler while HEAD already uses `sections.slice(-1)`. They are not silently
updated to make this increment look green. No API deploy is needed for this
client-only feedback increment; the preceding API staging evidence still applies.
