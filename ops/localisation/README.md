# Phaseo localisation control plane

This directory runs a private, single-node Weblate control plane with PostgreSQL and Valkey. It is suitable for local evaluation and is the base for a small production deployment. It is not a production ingress, secret-management, monitoring, or backup solution by itself.

Translations leave Weblate only through reviewed Git pull requests. Phaseo applications never read copy from this service at runtime.

## Requirements

- Docker Engine or Docker Desktop with Compose v2
- At least 2 CPU cores and 3 GB RAM for the evaluation stack
- One generated PostgreSQL password stored outside Git

The Weblate container uses the release image `2026.8.1.0`. The PostgreSQL `18-alpine` and Valkey `9.1.1` tags are convenient evaluation defaults, not immutable production pins. Before production, test exact patch releases and pin every image by digest. Review release notes and take a verified backup before changing them.

## Start locally

From this directory:

1. Copy `.env.example` to `.env`.
2. Create `secrets/postgres_password` with one randomly generated value and no surrounding quotes. This path is ignored by Git.
3. Validate and start the stack:

   ```powershell
   docker compose config
   docker compose up -d
   docker compose ps
   ```

4. Read the one-time generated `admin` password from `docker compose logs weblate`, open `http://localhost:8080`, sign in, and immediately set a permanent password or configure the production identity provider. Do not add `WEBLATE_ADMIN_PASSWORD` to the long-running Compose environment: the container reapplies it on every startup.
5. Inspect startup and worker errors with `docker compose logs -f weblate`.

Weblate generates its Django secret at `/app/data/secret`. The `weblate-data` volume persists it, so that volume must be backed up and restored with the database. For admin recovery, use a temporary, untracked Compose override that sets `WEBLATE_ADMIN_PASSWORD`, recreate the Weblate service once, then remove the override before the next normal start.

`docker compose down` stops the stack and preserves data volumes. Do not add `--volumes` unless the instance is intentionally being destroyed after a verified backup.

## Configure Phaseo

Create a private Weblate project and select Weblate's GitHub pull-request workflow, never a direct-push workflow to the protected `main` branch. Configure the Phaseo repository as the source, `main` as the source and pull-request target branch, and a dedicated Weblate-owned translation branch as the push branch.

The recommended least-privilege setup is a dedicated bot with a repository-scoped fine-grained token. Grant only metadata read, contents read/write, and pull requests read/write; do not grant administration, secrets, workflows, or organization permissions. Mount a credentials file from the deployment secret manager and set `WEBLATE_GITHUB_CREDENTIALS_FILE` to its in-container path. Its contents follow this shape:

```text
{ "api.github.com": { "username": "phaseo-weblate-bot", "token": "REDACTED" } }
```

Do not use Weblate's generic GitHub repository webhook with this bot flow because ordinary deliveries are not signature-verified. Let Weblate perform its nightly fetch, schedule the authenticated `weblate updategit --all` management command on the host, or trigger an authenticated Weblate API/client update from Phaseo CI after `main` changes. The native in-app GitHub App is an alternative, but it is a different setup: accept and review its manifest permissions, create the project inside a Weblate workspace, and use its dedicated tokenized, signed App callback rather than the generic webhook.

Keep branch protection and required CI reviews on `main`. In every component, disable `Push on commit`. In the project workflow, enable reviews and suggestions, set `Translation quality filter` to `Only include approved translations`, leave suggestion voting off and automatic acceptance at `0`, give translators translation/suggestion access, and give a language-scoped reviewer team the `Review strings` role. Use machine translation through automatic suggestions; do not write it directly into accepted translations. Restrict repository commit and push permissions to localisation maintainers, then commit and push approved translations manually or on a controlled schedule.

Start with the auth component, which has a real source catalog:

| Setting | Auth component |
| --- | --- |
| Name | `phaseo-web-auth` |
| File mask | `apps/web/messages/*/auth.json` |
| Base file | `apps/web/messages/en-GB/auth.json` |
| Format | Nested JSON |
| Component flag | `icu-message-format` |

Enable the eight tracked full target catalogs—`zh-Hans`, `hi`, `es-ES`,
`fr-FR`, `de-DE`, `pt-BR`, `ja`, and `ar-SA`—and confirm Weblate maps each
language to its existing directory before accepting the first translation pull
request. Do not let the component create additional target languages
implicitly. The sparse `en-US/auth.overrides.json` file is deliberately outside
the full-catalog mask and should be reviewed as a same-language regional diff.
These files back the public authentication locale cohort. Keep the Weblate
approval gate in place for future edits; publication of these auth catalogs
does not imply that unrelated Phaseo pages are translated.

Add `phaseo-web-common` only after
`apps/web/messages/en-GB/common.json` contains the first shared-chrome
messages. Do not create an empty component merely to reserve the name. The
`en-XA` pseudo-locale is generated by Phaseo's validator and is never stored
or translated in Weblate.

Weblate should create or update its dedicated translation branch and open a pull request. Phaseo CI and a native reviewer remain required before merge.

Run the same catalog gate locally from the repository root:

```powershell
pnpm run validate:i18n
```

Before real translation work, prove the loop with a disposable English key:

1. Merge the English key through a normal Phaseo pull request and confirm the chosen authenticated update path refreshes Weblate.
2. Translate and approve the key in Weblate, then confirm Weblate opens a pull request from its dedicated branch without writing to `main`.
3. Confirm catalog and application CI run on that pull request, merge it through the protected flow, and verify the translated catalog in the checkout.
4. Remove the disposable key through the same flow.

For the docs parser trial, create one component per source file:

| Component | Target file mask | Monolingual base and new-translation template |
| --- | --- | --- |
| FAQ | `apps/docs/*/v1/community/faq.mdx` | `apps/docs/v1/community/faq.mdx` |
| Home | `apps/docs/*/v1/index.mdx` | `apps/docs/v1/index.mdx` |
| Quickstart | `apps/docs/*/v1/quickstart.mdx` | `apps/docs/v1/quickstart.mdx` |

Weblate's MDX support is still under development and translated-file edits cannot be imported reliably. Request corrections in Weblate instead of editing its generated target MDX directly.

The pilot is not published until `apps/docs/docs.json` defines `navigation.languages`, keeps `en` first as the default language, supplies a complete navigation tree and translated navigation labels for every enabled language, and gives translated pages unique language-prefixed paths. Validate localized metadata, canonical URLs, alternate-language links, and every language's internal links before release.

## Machine translation

In Weblate's automatic-suggestions administration, the OpenAI engine can route through Phaseo:

- base URL: `https://api.phaseo.app/v1`
- API key: a restricted Phaseo key owned by the localisation service
- model: an explicitly approved Phaseo model ID
- persona/style: the reviewed Phaseo terminology and product-copy guidance

Require human review. A self-hosted control plane does not make an external model no-egress: the selected Phaseo route may still send source text to its provider. Ollama with a local model keeps model inference local, but Weblate still needs approved Git and mail connectivity. A true no-egress deployment also requires self-hosted Git, identity, and mail services plus an enforced deny-by-default network policy.

Protect these glossary terms from translation unless the product team approves a locale-specific form:

- Phaseo
- Gateway and SSO product terminology
- model and provider names
- API paths, parameters, field names, and identifiers
- commands, flags, environment variables, and code
- pricing units, currency codes, capability IDs, and service-tier IDs

## Production checklist

- Put Weblate behind a TLS reverse proxy and rely on Weblate authentication for the UI; do not expose its container port directly. If an additional proxy login is used with the native GitHub App, exempt only the exact App callback and tokenized signed webhook paths required by Weblate.
- Set the production domain, allowed hosts, HTTPS, and secure proxy header variables. Trust forwarded client-IP headers only from explicitly allowed proxy networks.
- Keep registration closed. Configure GitHub OAuth, SAML, or LDAP and language-scoped reviewer teams.
- Replace the local dummy email backend with SMTP so repository, review, and operational failures reach the owning team.
- Store Compose secrets in the deployment secret manager rather than in the checkout.
- Pin Weblate, PostgreSQL, and Valkey to tested image digests and record the upgrade procedure.
- Restrict the GitHub identity and keep branch protection mandatory.
- Monitor `/healthz/`, `/api/metrics/`, Celery workers, repository errors, PostgreSQL, disk, and backup age.
- Back up PostgreSQL and `/app/data`, including repository credentials, screenshots, translation memory, glossary data, SSH/GPG keys, and Borg configuration.
- Keep the Borg passphrase and SSH private key in a separate recovery system.
- Test a restore before onboarding translators, then on a schedule.
- Upgrade only after a backup and staging validation. Weblate supports direct upgrades only from releases in the current or previous calendar year.

Weblate's built-in Borg backup can include PostgreSQL and the data directory. A database dump alone is not a complete backup.

## Fully self-hosted boundary

This stack self-hosts localisation management. It does not replace:

- Mintlify as the current documentation renderer and publisher;
- GitHub as the repository and review system;
- Resend or another notification delivery provider;
- an external model provider selected by a Phaseo machine-translation route.

Each can be replaced independently if "fully self-hosted" is intended to cover the whole publication and delivery chain rather than the localisation control plane.

## References

- [Weblate Docker installation](https://docs.weblate.org/en/latest/admin/install/docker.html)
- [Weblate backup and restore](https://docs.weblate.org/en/latest/admin/backup.html)
- [Weblate Git integration](https://docs.weblate.org/en/latest/vcs.html)
- [Weblate code-hosting integration](https://docs.weblate.org/en/weblate-2026.8.1/admin/code-hosting.html#github)
- [Weblate translation workflows](https://docs.weblate.org/en/weblate-2026.8.1/workflows.html)
- [Weblate project quality filter](https://docs.weblate.org/en/weblate-2026.8.1/admin/projects.html#translation-quality-filter)
- [Weblate JSON format](https://docs.weblate.org/en/latest/formats/json.html)
- [Weblate MDX caveats](https://docs.weblate.org/en/latest/formats/mdx.html)
- [Weblate ICU checks](https://docs.weblate.org/en/latest/user/checks.html#icu-messageformat)
- [Mintlify internationalisation](https://www.mintlify.com/docs/guides/internationalization)
