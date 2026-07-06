# Phaseo Skills

Reusable coding-agent skills that help teams ship against Phaseo faster.

## `skills.sh` compatibility

This repository layout is compatible with [`npx skills add`](https://skills.sh/docs). The current `skills` CLI discovers skills from agent-specific directories including `.agents/skills/`, so these skills can be installed directly from the repository source without being moved into a separate top-level `skills/` folder.

Examples:

```bash
npx skills add owner/repo --list
npx skills add owner/repo --skill phaseo-gateway --agent codex
```

For a clean public `skills.sh` source, publish only the Phaseo skills you want discoverable by default. This local repository also contains some generic helper skills for development use, so the recommended ecosystem shape is a dedicated public skills repo or an isolated publishable subtree that contains only the intended public Phaseo skills.

## Available skills

- `phaseo-gateway`: general gateway integration and migration workflow
- `phaseo-guardrails`: workspace guardrails, API key attachment, previews, and enforcement debugging
- `phaseo-response-healing`: structured-output recovery with workspace, preset, or request-level plugin policy
- `phaseo-web-search-tools`: native search, `gateway:web_search`, `gateway:web_fetch`, and grounding/debug workflows
- `phaseo-async-webhooks`: async video, batch, polling, websocket, and standardized webhook lifecycle workflows
- `phaseo-routing-presets`: preset rollouts, routing diagnostics, and response-cache debugging
- `phaseo-sdk-typescript`: TypeScript and JavaScript usage with `@phaseo/sdk`
- `phaseo-agent-sdk-typescript`: long-running agent loops with `@phaseo/agent-sdk`
- `phaseo-sdk-python`: Python usage with `phaseo`
- `phaseo-product-docs`: product-facing rewrite workflow for docs, cookbook pages, and guides
- `phaseo-release-spotlight`: monthly recap and release spotlight writing workflow
- `phaseo-changelog`: combined, product, SDK, and data changelog writing workflow
- `next-cache-components`: Next.js cache-component guidance
- `openrouter-to-phaseo-migration`: focused migration playbook for existing gateway swaps

Use these skills when you want a coding agent to adopt the repository's preferred Phaseo patterns instead of discovering them from scratch.
