# Phaseo plugin

Build on the [Phaseo](https://phaseo.app) AI gateway from Claude Code, Codex and ChatGPT. The plugin connects the Phaseo MCP for live model, pricing and usage data, and adds skills that help your agent integrate with the gateway, move an existing integration to Phaseo, choose models and keep an eye on spend.

## What's included

**Phaseo MCP** (`https://mcp.phaseo.app/mcp`). Sign in with your Phaseo account. The connection is read-only by default. With it your agent can:

- search and filter the live model catalogue in an interactive model explorer, with prices for each provider;
- show third-party benchmark rankings for general, coding and agentic work;
- look up one model's capabilities and estimate the token cost of a workload;
- read your workspace's credit balance, usage analytics, activity and request logs.

If you also grant inference access, the explorer can run one prompt on up to three text models. It shows an estimate first, and nothing runs or spends credits until you choose **Run**.

**Phaseo Docs MCP** (`https://phaseo.app/docs/mcp`). Searches the Phaseo documentation, with no sign-in. Claude Code and Codex installs connect it. The ChatGPT directory package leaves it out, because ChatGPT plugins connect one MCP server.

**Skills** that load when they're relevant:

- integrating with the gateway over REST, the TypeScript and Python SDKs, the Agent SDK or the CLI;
- migrating an existing integration from another provider or gateway;
- choosing and pinning model IDs for a workload;
- monitoring usage and spend;
- presets and routing, guardrails, response healing, web search tools, and async jobs with webhooks.

## Install

Claude Code:

```bash
/plugin marketplace add phaseoteam/skills
/plugin install phaseo@phaseo
```

Codex:

```bash
codex plugin marketplace add phaseoteam/skills
codex plugin add phaseo@phaseo
```

When the Phaseo MCP first asks you to sign in, approve access in the browser window it opens.

## Data and permissions

The Phaseo MCP only reads data that your Phaseo account can already see. It can't create keys, change settings or buy credits. Use the [dashboard](https://phaseo.app), the CLI or the Management API for those. Prompt comparisons go through the gateway like any other request, so your workspace's guardrails and billing apply to them.

## Support

- Documentation: <https://phaseo.app/docs>
- Support: <https://phaseo.app/support>
- Privacy policy: <https://phaseo.app/privacy>
- Terms of service: <https://phaseo.app/terms>

## Licence

MIT. See [LICENSE](./LICENSE).
