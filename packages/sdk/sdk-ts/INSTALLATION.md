# AI Stats SDK - Installation Guide

## Interactive Installation

When you install `@ai-stats/sdk`, you'll be prompted to optionally install the devtools viewer.

### What Happens

```bash
npm install @ai-stats/sdk
```

**You'll see:**

```
🎯 AI Stats SDK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The SDK includes built-in telemetry capture for debugging.
Would you like to install the devtools viewer to visualize
your API requests in a beautiful web UI?

Features:
  • Real-time dashboard with live updates
  • Cost tracking and token usage analytics
  • Error debugging with actionable solutions
  • Export data as JSON or CSV

⚠️  You can always install it later with:
   npx @ai-stats/devtools-viewer

? Install devtools viewer? (Y/n)
```

### Installation Outcomes

#### If you choose **Yes** (default):

```
📦 Installing @ai-stats/devtools-viewer...

✅ Devtools viewer installed successfully!

Next steps:

1. Enable devtools in your code:
   const client = new AIStats({
     devtools: createAIStatsDevtools()
   });

2. Make some API calls

3. View your data:
   npx @ai-stats/devtools-viewer

📖 Read more: https://docs.ai-stats.org/devtools
```

#### If you choose **No**:

```
⏭️  Skipped. You can install it anytime with:
   npm install -D @ai-stats/devtools-viewer
```

## What Gets Installed

### Always Installed (with SDK)

- **@ai-stats/devtools-core** (~50KB)
  - Core schemas and telemetry writer
  - Captures API requests to local files
  - Zero dependencies
  - Required for `createAIStatsDevtools()` to work

### Optionally Installed (via prompt)

- **@ai-stats/devtools-viewer** (~5MB)
  - Beautiful web UI for viewing captured data
  - React + Vite + Express server
  - Only needed when you want to view data
  - Can be installed later or run with `npx`

## Environment Variables

Control the installation behavior without interactive prompts:

### Skip the Prompt Entirely

```bash
AI_STATS_SKIP_POSTINSTALL=true npm install @ai-stats/sdk
```

Use this in CI/CD pipelines or automated builds.

### Auto-Install Viewer (No Prompt)

```bash
AI_STATS_INSTALL_VIEWER=true npm install @ai-stats/sdk
```

Automatically installs the viewer without asking.

### Auto-Skip Viewer (No Prompt)

```bash
AI_STATS_INSTALL_VIEWER=false npm install @ai-stats/sdk
```

Automatically skips viewer installation without asking.

## CI/CD Behavior

The post-install prompt is **automatically skipped** in these environments:

- `CI=true` (most CI systems)
- `CONTINUOUS_INTEGRATION=true`
- `GITHUB_ACTIONS=true`
- `GITLAB_CI=true`
- `CIRCLECI=true`

The prompt is also skipped during:
- `npm publish` / `prepublishOnly`
- Global installations (`npm install -g`)

## Manual Installation

### Install Viewer Later

If you skipped the prompt, you can install the viewer anytime:

```bash
# Install as dev dependency
npm install -D @ai-stats/devtools-viewer

# Or run directly with npx (no install needed)
npx @ai-stats/devtools-viewer
```

### Uninstall Viewer

If you no longer need the viewer:

```bash
npm uninstall @ai-stats/devtools-viewer
```

The SDK and telemetry capture will continue to work. You can still view your data with `npx @ai-stats/devtools-viewer` without having it installed.

## Package Manager Support

The post-install script automatically detects your package manager:

- **npm**: `npm install --save-dev @ai-stats/devtools-viewer`
- **pnpm**: `pnpm add -D @ai-stats/devtools-viewer`
- **yarn**: `yarn add -D @ai-stats/devtools-viewer`

## Troubleshooting

### Prompt Not Showing

**Possible reasons:**
- You're in a CI environment (prompt auto-skipped)
- `AI_STATS_SKIP_POSTINSTALL=true` is set
- You're publishing the package
- The viewer is already installed

**Solution:**
Install the viewer manually:
```bash
npm install -D @ai-stats/devtools-viewer
```

### Want to Disable Prompt Permanently

Add to your `.npmrc` or `.yarnrc`:

```
AI_STATS_SKIP_POSTINSTALL=true
```

Or set in your shell profile:

```bash
# .bashrc / .zshrc
export AI_STATS_SKIP_POSTINSTALL=true
```

### Post-Install Script Errors

If the post-install script fails, it **won't block** your installation. The SDK will still install successfully. Install the viewer manually if needed.

## Comparison: Before vs After

### Before This Change

```bash
npm install @ai-stats/sdk
# ❌ Installs viewer automatically (5MB+ added)
# ❌ No choice given
# ❌ Viewer installed even if never used
```

### After This Change

```bash
npm install @ai-stats/sdk
# ✅ Prompts you to install viewer
# ✅ You choose what to install
# ✅ Core capture always available
# ✅ Viewer only if you want it
```

## Related Documentation

- [Getting Started with Devtools](../../devtools/devtools/GETTING_STARTED.md)
- [Devtools Architecture](../../devtools/DEVTOOLS_ARCHITECTURE.md)
- [SDK README](./README.md)
- [Cross-Language Support](../../devtools/devtools/CROSS_LANGUAGE.md)
