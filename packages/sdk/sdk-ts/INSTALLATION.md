# Phaseo SDK - Installation Guide

## Interactive Installation

When you install `@phaseo/sdk`, you'll be prompted to optionally install the devtools viewer.

### What Happens

```bash
npm install @phaseo/sdk
```

**You'll see:**

```
🎯 Phaseo SDK
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
   npx @phaseo/devtools-viewer

? Install devtools viewer? (Y/n)
```

### Installation Outcomes

#### If you choose **Yes** (default):

```
📦 Installing @phaseo/devtools-viewer...

✅ Devtools viewer installed successfully!

Next steps:

1. Enable devtools in your code:
   const client = new Phaseo({
     devtools: createPhaseoDevtools()
   });

2. Make some API calls

3. View your data:
   npx @phaseo/devtools-viewer

📖 Read more: https://docs.phaseo.org/devtools
```

#### If you choose **No**:

```
⏭️  Skipped. You can install it anytime with:
   npm install -D @phaseo/devtools-viewer
```

## What Gets Installed

### Always Installed (with SDK)

- **Built-in telemetry capture** (bundled with `@phaseo/sdk`)
  - Captures API requests to local files
  - Required for `createPhaseoDevtools()` to work
  - No separate devtools-core package required

### Optionally Installed (via prompt)

- **@phaseo/devtools-viewer** (~5MB)
  - Beautiful web UI for viewing captured data
  - React + Vite + Express server
  - Only needed when you want to view data
  - Can be installed later or run with `npx`

## Environment Variables

Control the installation behavior without interactive prompts:

### Skip the Prompt Entirely

```bash
PHASEO_SKIP_POSTINSTALL=true npm install @phaseo/sdk
```

Use this in CI/CD pipelines or automated builds.

### Auto-Install Viewer (No Prompt)

```bash
PHASEO_INSTALL_VIEWER=true npm install @phaseo/sdk
```

Automatically installs the viewer without asking.

### Auto-Skip Viewer (No Prompt)

```bash
PHASEO_INSTALL_VIEWER=false npm install @phaseo/sdk
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
npm install -D @phaseo/devtools-viewer

# Or run directly with npx (no install needed)
npx @phaseo/devtools-viewer
```

### Uninstall Viewer

If you no longer need the viewer:

```bash
npm uninstall @phaseo/devtools-viewer
```

The SDK and telemetry capture will continue to work. You can still view your data with `npx @phaseo/devtools-viewer` without having it installed.

## Package Manager Support

The post-install script automatically detects your package manager:

- **npm**: `npm install --save-dev @phaseo/devtools-viewer`
- **pnpm**: `pnpm add -D @phaseo/devtools-viewer`
- **yarn**: `yarn add -D @phaseo/devtools-viewer`

## Troubleshooting

### Prompt Not Showing

**Possible reasons:**
- You're in a CI environment (prompt auto-skipped)
- `PHASEO_SKIP_POSTINSTALL=true` is set
- You're publishing the package
- The viewer is already installed

**Solution:**
Install the viewer manually:
```bash
npm install -D @phaseo/devtools-viewer
```

### Want to Disable Prompt Permanently

Add to your `.npmrc` or `.yarnrc`:

```
PHASEO_SKIP_POSTINSTALL=true
```

Or set in your shell profile:

```bash
# .bashrc / .zshrc
export PHASEO_SKIP_POSTINSTALL=true
```

### Post-Install Script Errors

If the post-install script fails, it **won't block** your installation. The SDK will still install successfully. Install the viewer manually if needed.

## Comparison: Before vs After

### Before This Change

```bash
npm install @phaseo/sdk
# ❌ Installs viewer automatically (5MB+ added)
# ❌ No choice given
# ❌ Viewer installed even if never used
```

### After This Change

```bash
npm install @phaseo/sdk
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
