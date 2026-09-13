# Regional gateway deployment

This runbook deploys the EU and US provider-routing Workers. These Workers use
Cloudflare placement hints; they do not provide guaranteed data residency.

## Deployments

| Region | Worker | Custom domain | Placement hint |
| --- | --- | --- | --- |
| EU | `phaseo-gateway-eu` | `eu.api.phaseo.app` | `gcp:europe-west1` |
| US | `phaseo-gateway-us` | `us.api.phaseo.app` | `aws:us-east-1` |

Wrangler manages both custom domains. Cloudflare creates the DNS records and
certificates during the first deployment. Remove any existing CNAME at either
hostname before deploying because Cloudflare cannot attach a Worker Custom
Domain over an existing CNAME.

## What the regional Workers expose

- `GET /`
- `GET /v1/health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages`

All other paths are blocked at Worker middleware. Generation requests are also
checked for text-only content before provider selection.

The regional configurations intentionally omit cron triggers, R2 buckets,
realtime Durable Objects, data-contribution jobs, and asynchronous workers.

## Prepare secrets in Infisical

Secrets belong to each Worker and are not inherited from `phaseo-gateway`.
Keep the existing production credentials in Infisical as the source of truth.
The same credential value may be installed on the global, EU, and US Workers;
it does not need to be duplicated inside Infisical.

Every regional deployment requires:

- `SUPABASE_SERVICE_ROLE_KEY`
- `KEY_PEPPER_ACTIVE`
- The provider credentials for every regional offer you intend to serve

Common regional provider credentials currently include:

- EU: `MISTRAL_API_KEY`, `OPENAI_API_KEY`, and the credentials used by verified
  EU Google Vertex offers
- US: `ANTHROPIC_API_KEY`, the existing AWS Bedrock credentials, and the
  credentials used by verified US Google Vertex offers

Include BYOK encryption keys only if BYOK is intentionally enabled and tested on
the regional Worker. Do not copy unrelated media, webhook, email, or background
job secrets.

## Validate without deploying

From `apps/api`:

```powershell
./scripts/deploy-regional.ps1 -Region eu
./scripts/deploy-regional.ps1 -Region us
```

The script performs a Wrangler dry-run unless `-Deploy` is explicitly supplied.

## Deploy from Infisical

Inject the production Infisical environment, then let the script copy only its
regional allowlist into the Worker. The temporary JSON file used by Wrangler is
deleted in a `finally` block and its contents are never printed:

```powershell
infisical run --env=prod -- ./scripts/deploy-regional.ps1 -Region eu -SecretsFromEnvironment -Deploy
infisical run --env=prod -- ./scripts/deploy-regional.ps1 -Region us -SecretsFromEnvironment -Deploy
```

The GitHub deployment uses Infisical's OIDC action and the same script. Configure
`INFISICAL_IDENTITY_ID` and `INFISICAL_PROJECT_SLUG` as GitHub repository
variables. The machine identity must have read-only access to the production
gateway secrets. The action reads the production root (`/`), where the current
gateway and provider credentials are stored. No Infisical credential needs to
be stored in GitHub.

The script deliberately ignores unrelated Infisical values. Extend
`$regionalSecretNames` when a new region-qualified provider is enabled. A manual
external secrets file remains available through `-SecretsFile` for recovery.

## Verify the control plane

These checks do not call an AI provider:

```powershell
curl.exe -i https://eu.api.phaseo.app/v1/health
curl.exe -i https://us.api.phaseo.app/v1/health
curl.exe -i https://eu.api.phaseo.app/v1/models -H "Authorization: Bearer $env:PHASEO_API_KEY"
curl.exe -i https://us.api.phaseo.app/v1/models -H "Authorization: Bearer $env:PHASEO_API_KEY"
```

Confirm that:

- `X-Phaseo-Gateway-Region` matches the hostname.
- `/v1/models` returns only the three text endpoints.
- Every returned offer declares matching execution and data regions.
- A blocked path such as `/v1/files` returns
  `regional_endpoint_not_supported`.

Only after these checks pass should a separate, explicitly approved live smoke
test exercise each generation endpoint.

## Upgrade path to residency guarantees

Cloudflare Regional Services must be enabled on each custom domain to constrain
TLS termination and Worker execution to the selected geography. Customer
Metadata Boundary, regional storage, regional observability, Supabase placement,
and provider subrequests require their own controls. Placement hints alone are a
latency and locality optimisation.

## Cloudflare references

- [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Workers placement hints](https://developers.cloudflare.com/workers/configuration/placement/)
- [Wrangler secret management](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Regional Services](https://developers.cloudflare.com/data-localization/regional-services/)
