---
name: phaseo-issue-artifacts
description: Attaches a self-contained HTML page (plan, root cause, investigation or diagram) to a GitHub issue with `gh issue artifact create`, keeping the issue body short. Use whenever an agent creates or substantially updates an issue in phaseoteam/Phaseo. Not for pull requests, which have no artifacts; not for product UI charts (phaseo-internal-visualizations).
metadata:
  internal: true
---

# Phaseo Issue Artifacts

GitHub issues can carry artifacts: HTML pages, Markdown documents and links
attached to the issue, each with its own URL and version history. Put the
depth in an HTML artifact and keep the issue body short.

This repository is **public**. Anyone can read an issue and its artifacts.

## Workflow

```text
- [ ] 1. Short issue body via the matching .github/ISSUE_TEMPLATE form
- [ ] 2. Write one self-contained HTML page outside the repo
- [ ] 3. Check the page for secrets and private data
- [ ] 4. Attach it with gh issue artifact create
- [ ] 5. Verify with gh issue artifact list and report both URLs
```

### 1. Issue body

Use the matching template in `.github/ISSUE_TEMPLATE/` (bug, feature, chore,
docs, data-request, incorrect-info). Fill the required fields in a sentence or
two each. End with `Details: see the attached artifact.` Leave long plans, logs,
tables and diagrams out of the body.

### 2. Write the page

Write the page by hand as a single `.html` file. Don't use a generator skill or
a build step. Save it outside the repository, for example
`$TMPDIR/phaseo-issues/<slug>.html`, so it never gets committed.

Content, conclusion first:

- **Summary**: the problem and the proposed outcome in two or three sentences.
- **Evidence**: reproduction steps, affected routes or files (`apps/api/...`),
  versions, and short trimmed log excerpts.
- **Cause or design**: what is happening or what will change. Add an inline
  SVG diagram when a flow, sequence or state change is easier to see than to
  read.
- **Plan**: numbered steps, then the tests and validations to run
  (`pnpm typecheck`, `pnpm validate:data`, ...).
- **Risks and open questions.**

Only state facts you checked. Mark estimates as estimates.

Page rules:

- Everything is inline: CSS in `<style>`, diagrams as inline `<svg>`. Don't
  load external scripts, fonts, images or stylesheets, and don't use `fetch`.
  The page renders embedded on GitHub and must work offline.
- Keep JavaScript out unless it adds something real, such as tabs or a
  toggle.
- Support light and dark themes with `prefers-color-scheme`, keep text
  readable at 360 px wide, and use semantic headings so the source view also
  reads well.
- Aim for under 200 KB.

Minimal skeleton:

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Short title</title>
<style>
:root{--bg:#fff;--fg:#1b1f24;--muted:#59636e;--line:#d1d9e0;--accent:#0069a8}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9198a1;--line:#3d444d;--accent:#4cb3f4}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,sans-serif}
main{max-width:860px;margin:auto;padding:24px 16px}
h1{font-size:1.5rem}h2{border-bottom:1px solid var(--line);padding-bottom:4px}
.lead{font-size:1.1rem;color:var(--muted)}code,pre{font-family:ui-monospace,monospace}
pre{overflow:auto;border:1px solid var(--line);padding:12px;border-radius:6px}
</style></head><body><main>
<h1>Short title</h1><p class="lead">Conclusion in one or two sentences.</p>
<h2>Evidence</h2> <h2>Cause</h2> <h2>Plan</h2> <h2>Risks and open questions</h2>
</main></body></html>
```

### 3. Safety check

Read through the whole page before you attach it. Remove API keys, tokens,
`.env` values, Supabase project refs and service keys, internal hostnames,
customer or workspace identifiers, emails and raw production rows. Redact or
summarise instead.

### 4. Attach

```bash
gh issue artifact create <issue> '<path>/<slug>.html#<Readable name>' -R phaseoteam/Phaseo
```

Use a descriptive name, such as `Root cause: credit reservation race`.
Parentheses are stripped from names. Attach long logs as a Markdown artifact
instead of putting them in the page:
`gh issue artifact create <issue> --body-file notes.md --name 'Investigation log'`.

When the work changes later, edit the artifact instead of adding a new one:
`gh issue artifact list <issue>`, then
`gh issue artifact edit <issue> <number> --body-file <slug>.html`.

### 5. Verify

Run `gh issue artifact list <issue>` and report the issue URL and the artifact
URL. If `create` fails, report the error. Possible causes are a `gh` older than
2.103 or the preview not being available. Don't paste the page into the issue
body as a fallback.

## When to skip

Skip the page for trivial issues, such as a typo or a one-line request, and
say that you skipped it.

## Pull requests

PRs have no artifacts. When a PR closes an issue, update that issue's
artifact with the final design or results, and keep the PR body to its
template with a `Closes #<issue>` link.
