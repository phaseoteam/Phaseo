# Catalogue and routing status model

Phaseo keeps lifecycle, upstream availability, integration readiness, routing
health, and verification as separate facts. A single `status` field must not
be used to answer all five questions.

## Status axes

### Canonical model lifecycle

Stored as the authored model `status` and normalised into
`v2_models.catalogue_status`.

| Value | Meaning |
| --- | --- |
| `unknown` | The lifecycle has not been verified. |
| `rumoured` | Reported but not officially announced. |
| `announced` | Officially announced but not released. |
| `preview` | Released as a provider or product preview. |
| `available` | Generally released. |
| `limited_access` | Released with an allowlist, region, account, or capacity restriction. |
| `deprecated` | Still present, but clients should migrate away. |
| `retired` | No longer offered. |
| `withheld` | Intentionally hidden or not publicly described. |

This lifecycle describes the model itself. It does not make any provider route
eligible.

### Provider-offer availability

Stored per provider/model route as
`v2_model_provider_routes.provider_availability_status`.

| Value | Meaning |
| --- | --- |
| `unknown` | We have not verified the upstream offer. |
| `coming_soon` | The provider has announced or listed the offer, but it cannot be used yet. |
| `preview` | The provider exposes the offer as a preview. |
| `available` | The provider currently accepts requests for the offer. |
| `limited_access` | The offer exists but access is restricted. |
| `deprecated` | The provider still accepts some requests but recommends migration. |
| `removed` | The provider no longer exposes the offer. |

This is upstream truth. It must not imply that Phaseo implements the endpoint.

### Phaseo integration state

Stored per provider/model route as
`v2_model_provider_routes.phaseo_status`.

| Value | Meaning |
| --- | --- |
| `unsupported` | Phaseo has no compatible integration for this offer. |
| `planned` | Integration work is accepted but has not started. |
| `implementing` | Integration work is in progress. |
| `testing` | Implemented and under contract, staging, or live-canary testing. |
| `enabled` | Supported and eligible for production routing, subject to switches and health. |
| `disabled` | Intentionally switched off by Phaseo. |
| `blocked` | Integration cannot progress because of an external or unresolved dependency. |

Only `enabled` may have `routing_enabled = true`.

### Access scope

Stored per provider/model route as
`v2_model_provider_routes.access_scope`.

| Value | Meaning |
| --- | --- |
| `public` | Eligible for ordinary customer routing when all other gates pass. |
| `internal` | Available only through authenticated gateway testing mode. |

Internal access is an audience policy, not a lifecycle. A route may therefore be
Phaseo `testing` with `access_scope = 'internal'`, or Phaseo `enabled`
while remaining internal-only. Internal routes never set the public
`routing_enabled` switch.

The gateway reuses the existing high-entropy internal token and explicit
testing-mode request. Ordinary requests use the default context-cache segment
and never execute the internal-route lookup; testing requests use a separate
cache segment and query only explicitly internal routes whose provider offer is
usable and whose Phaseo status is `testing` or `enabled`.

### Routing health

The existing route `status` / `routing_status` remains a routing-health and
administrative signal. Active and deranked routes can still be eligible;
disabled routes cannot. Dynamic health observations must not rewrite provider
availability or Phaseo integration state.

### Verification

`verification.status` remains `unverified`, `partial`, or `verified`.
It records evidence quality, not lifecycle or routability.

## Routing eligibility

A route is eligible only when all of the following hold:

1. the model, lab, and provider pass their existing lifecycle and effective-window checks;
2. `provider_availability_status` is `available`, `preview`, or `limited_access`;
3. `phaseo_status = 'enabled'`;
4. `access_scope = 'public'`;
5. provider-, route-, region-, and variant-level routing switches are enabled;
6. the capability and routing-health states permit routing.

Provider availability is therefore necessary but never sufficient.

## Compatibility and migration

The rollout is additive:

- legacy `status`, `routing_status`, `routable`, and
  `is_active_gateway` remain readable;
- the catalog editor and approved database automations write the new explicit
  fields and derive legacy routing switches from `phaseo_status` and
  `access_scope`;
- existing active routes backfill to provider `available` and Phaseo
  `enabled`; inactive routes backfill conservatively;
- missing or unrecognised authored values normalise to `unknown` and do not
  become newly routable;
- API responses add the explicit fields without removing existing fields.

## Current catalogue vocabulary audit

The repository audit on 2026-07-30 found canonical values `Available`,
`Retired`, `Deprecated`, `Rumoured`, `Announced`, and
`Limited Access`, plus null/missing values. Provider capability data also
contains `active`, `inactive`, `coming_soon`, and deranked states.
Deranking belongs to routing health, while `coming_soon` belongs to upstream
or rollout availability depending on its authored context; new entries should
use the explicit fields.
