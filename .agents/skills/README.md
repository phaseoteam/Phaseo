# AI Stats Skills

Reusable coding-agent skills that help teams ship against AI Stats faster.

## `skills.sh` compatibility

This repository layout is compatible with [`npx skills add`](https://skills.sh/docs). The current `skills` CLI discovers skills from agent-specific directories including `.agents/skills/`, so these skills can be installed directly from the repository source without being moved into a separate top-level `skills/` folder.

Examples:

```bash
npx skills add owner/repo --list
npx skills add owner/repo --skill ai-stats-gateway --agent codex
```

For a clean public `skills.sh` source, publish only the AI Stats skills you want discoverable by default. This local repository also contains some generic helper skills for development use, so the recommended ecosystem shape is a dedicated public skills repo or an isolated publishable subtree that contains only the intended public AI Stats skills.

## Available skills

- `ai-stats-gateway`: general gateway integration and migration workflow
- `ai-stats-guardrails`: workspace guardrails, API key attachment, previews, and enforcement debugging
- `ai-stats-response-healing`: structured-output recovery with workspace, preset, or request-level plugin policy
- `ai-stats-web-search-tools`: native search, `gateway:web_search`, `gateway:web_fetch`, and grounding/debug workflows
- `ai-stats-async-webhooks`: async video, batch, polling, websocket, and standardized webhook lifecycle workflows
- `ai-stats-routing-presets`: preset rollouts, routing diagnostics, and response-cache debugging
- `ai-stats-sdk-typescript`: TypeScript and JavaScript usage with `@ai-stats/sdk`
- `ai-stats-agent-sdk-typescript`: long-running agent loops with `@ai-stats/agent-sdk`
- `ai-stats-sdk-python`: Python usage with `ai-stats-py-sdk`
- `ai-stats-product-docs`: product-facing rewrite workflow for docs, cookbook pages, and guides
- `next-cache-components`: Next.js cache-component guidance
- `openrouter-to-ai-stats-migration`: focused migration playbook for existing gateway swaps

Use these skills when you want a coding agent to adopt the repository's preferred AI Stats patterns instead of discovering them from scratch.
