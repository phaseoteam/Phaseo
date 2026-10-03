# Phaseo health pilot

Run `node scripts/health-pilot.mjs --http-only` for public HTTP checks, or
`node scripts/health-pilot.mjs` for HTTP plus Chromium model navigation.
The full run requires the existing web dependencies and
`pnpm --filter @phaseo/web exec playwright install chromium`.
Run deterministic tests with `node --test scripts/health-pilot.test.mjs`.

The pilot checks homepage/models/docs content and the gateway root JSON
contract. Chromium additionally checks the rendered model list, opens a
visible model link, and verifies the detail heading. Failures produce a
nonzero exit code. HTTP checks retry once; browser failures do not retry.
Only check identifiers, outcomes, durations and bounded reason codes are
logged. Response bodies and credentials are excluded.

## GitHub's role and cost

GitHub Actions provides external execution, not the production log dashboard
or incident-management service. The workflow runs on pilot pull-request changes
and manual dispatch, uses a standard
Ubuntu runner in the public Phaseo repository, and uploads no artifacts.
It runs no model generations, writes to no database, and creates no incidents.
No new packages or subscriptions are required. Hosting requests still count
towards Phaseo's existing allowances.

GitHub scheduled runs can be delayed/dropped; public-repository schedules
disable after 60 days without activity. A future 15-minute schedule would
therefore not promise detection within 15 minutes. Existing one-minute Axiom
monitors continue independently.

## Optional Axiom delivery

Default runs publish nothing. To enable delivery, set repository variable
`HEALTH_PILOT_PUBLISH_AXIOM=true`, variable `HEALTH_AXIOM_DATASET` to an
existing dataset, and secret `HEALTH_AXIOM_TOKEN` to a token with ingest
access to that dataset. The workflow only exposes it on main in the public
phaseoteam/Phaseo repository during manual dispatch. Pull-request runs never
receive this token or publish telemetry. Local publishing requires the same environment
variables and the explicit `--publish-axiom` option.

Five results every 15 minutes would produce 14,400 small events per 30-day
month. Keep the existing Personal plan and included loading/storage/query
limits. Do not upgrade to obtain custom webhooks or more monitor slots.

## Coverage and rollout gates

Passing checks do not establish database availability, authenticated behavior
or provider generation. Add a cheap uncached read through the application
before describing database coverage as complete. Cached pages cannot prove it.
Browser setup failures and assertion failures share a pilot failure reason;
separate checker faults from product faults before automatically paging.

The proposed free incident path is existing Axiom monitors -> email notifier
-> incident.io email source. External health alerts can later use an
incident.io HTTP source directly. Neither delivery path is enabled here.
Validate firing/recovery parsing, stable deduplication and test-mode incident
creation before attaching production escalation. A resolved alert does not
automatically mean the incident should be closed. Avoid public status-page
announcements for synthetic tests.

The current incident.io default route groups all alerts within 30 minutes
and does not create incidents. Review service/check grouping and use a
separate test route before changing this production behavior. Review Axiom
error-rate queries too: successes and failures have different sampling.

Sources: [GitHub pricing](https://docs.github.com/en/billing/concepts/product-billing/github-actions),
[schedule limits](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[Axiom limits](https://axiom.co/docs/reference/limits),
[incident.io email recovery](https://incident.io/changelog/resolve-deduplicate-email-alerts).
