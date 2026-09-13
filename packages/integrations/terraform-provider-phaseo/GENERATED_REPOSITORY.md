# Generated repository

The `phaseoteam/terraform-provider-phaseo` repository is generated from `packages/integrations/terraform-provider-phaseo` in the Phaseo monorepo.

Do not commit provider implementation changes directly to the generated repository. Open changes against the monorepo; an hourly workflow tests the exported provider and synchronizes its `main` branch automatically, and maintainers can trigger an immediate manual sync.

The workflow records a lightweight monthly empty commit on the separate `sync-heartbeat` branch. This keeps GitHub from disabling scheduled workflows after 60 days of repository inactivity without polluting or diverging generated `main` history.

Release tags are created in the generated repository because Terraform Registry releases are built there.
