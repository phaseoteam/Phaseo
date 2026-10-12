# Phaseo skills

Skills add reusable instructions to Phaseo Chat, Code and Plan. Select a skill
from the composer's Commands picker, or let the model discover available skills
and request activation. Activation shows the full instructions for approval.
Skills do not grant additional tool permissions: Chat has skill tools only,
Plan retains read-only project tools, and Code mutations require approval.

## Definitions

Put each definition in a named folder containing `SKILL.md`:

- Global: `<desktop-user-data>/workspace/skills/<name>/SKILL.md`.
- Project: `<project>/.phaseo/skills/<name>/SKILL.md`.
- Compatible project: `<project>/.agents/skills/<name>/SKILL.md`.

Personal chats discover global skills. Project chats also discover their
registered project's definitions. The picker distinguishes matching names by
scope; model catalog identities are `global:<name>`, `project:<name>` and
`agents:<name>`.

```markdown
---
name: explain
description: Explain decisions with concrete examples
user-invocable: true
disable-model-invocation: false
---
Use concrete examples. State assumptions and unresolved questions.
```

The name must match its folder and contain lowercase letters, digits and
hyphens, up to 64 characters. Description and body are required. Each definition
is UTF-8 text up to 16 KiB. Invalid or inaccessible definitions appear as catalog
warnings. Discovery is bounded to 1,000 directory entries and 200 definitions.

`enabled: false` disables a definition. `user-invocable: false` hides it from
explicit selection. `disable-model-invocation: true` prevents model discovery
and activation. Both invocation policies are independent; neither changes tool
permissions. Other metadata does not configure tool access.

## Activation and recovery

Discovery returns names and descriptions, without loading bodies into model
guidance. `load_skill` requires a full-body approval for its specific call.
Changes made during approval reject that activation. Activated guidance is
refreshed before subsequent requests, and Code's instruction revision checks
block effects prepared against stale guidance.

Unfinished runs persist skill identities and revision metadata in their SDK
checkpoint. Resuming reviews current active definitions again, then reviews any
pending activation. Declining an explicit preflight activation retains queued
input. Completed runs do not automatically inherit previous active skills.

Source and packaged Windows audits verify personal Chat image/history recovery
and Code stale-write rejection across forced process termination. These use
owned loopback model fixtures; signed-in provider behavior and other operating
systems remain separate verification work. Rich plugin configuration, skill
installation and full parity remain unfinished.
