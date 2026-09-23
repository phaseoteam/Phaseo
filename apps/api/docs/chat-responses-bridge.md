# Chat-to-Responses transport safety

The Chat-to-Responses bridge is now pull-driven and uses the shared bounded SSE
reader. It no longer eagerly drains the upstream, swallows read/JSON failures or
manufactures completion at EOF. Chat requires its DONE marker (or an explicit
full compatibility completion); native Responses requires its native terminal.
Later frames are ignored and upstream ownership is released on exit/cancel.

Native Responses passthrough does not accumulate output. The legacy translated
Responses terminal still includes full output, so its compatibility accumulator
is capped at 4 Mi characters of admitted Chat wire JSON, with 128 choice/tool
indexes. Indexes are validated before array allocation. This cap is conservative
and includes metadata overhead, not merely text. It is a bounded compatibility
path, **not** fulfilment of the plan's no-full-output-retention requirement.

Initial tool arguments are no longer repeated in both output-item-added and the
following argument delta. Protocol implementation lives in its own module;
shared provider quirks/event normalization remain shared, with no public export
break. No new external operations or Cloudflare resources are introduced.

## Validation

- 594 source files / 4,596 tests pass, including thirteen new transport cases.
- Typecheck, scoped ESLint and staging dry-run pass.
- Native bridge harness validates both directions: terminal detection, split
  framing, no eager reads, blocked-read cancellation and reader release.
- Full unscoped integration suite is not claimed green. Live staging evidence
  will follow deployment; production is unchanged.
