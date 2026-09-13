# Terraform Provider for Phaseo

Manage Phaseo infrastructure with Terraform. The provider currently supports Gateway API keys, guardrails, BYOK provider credentials, SCIM group mappings, and observability destinations through Phaseo's management API. Read-only data sources expose models, providers, and credits.

## Supported surface

Resources:

- `phaseo_api_key`
- `phaseo_guardrail`
- `phaseo_provider_credential`
- `phaseo_scim_group_mapping`
- `phaseo_observability_destination`

Data sources:

- `phaseo_models`
- `phaseo_providers`
- `phaseo_credits`

The catalogue data sources currently return canonical API output through a computed `json` attribute. Typed catalogue fields can be added without changing the underlying API.

## Requirements

- Terraform 1.5 or later
- Go 1.25 or later (to build or test the provider)
- A Phaseo management API key

## Example

```hcl
terraform {
  required_providers {
    phaseo = {
      source = "phaseoteam/phaseo"
    }
  }
}

provider "phaseo" {}

resource "phaseo_api_key" "application" {
  name         = "Production application"
  limit        = 250
  limit_reset  = "monthly"
}

output "application_api_key" {
  value     = phaseo_api_key.application.key
  sensitive = true
}
```

Set `PHASEO_API_KEY` rather than putting a management key in Terraform configuration. `PHASEO_BASE_URL` can override the default `https://api.phaseo.app/v1` endpoint; an explicit provider `base_url` takes precedence.

The plaintext value of a `phaseo_api_key` is returned only when the key is created. It is marked sensitive, but Terraform still stores it in state. Use an encrypted remote state backend and tightly control state access.

## Development

```shell
go test ./...
go build .
```

This directory is the source of truth. Merges to the Phaseo monorepo are tested and mirrored with provider-only history to the public `phaseoteam/terraform-provider-phaseo` repository. See [RELEASING.md](RELEASING.md) for repository setup and release instructions.

Both resources support import by UUID:

```shell
terraform import phaseo_api_key.application 11111111-1111-4111-8111-111111111111
```
