# Interactive Devtools Viewer Installation - Implementation Summary

## What Was Implemented

Successfully implemented Option 2+4 (merged): Keep devtools-core in the SDK, but add an interactive prompt for the viewer during installation.

## Changes Made

### 1. Updated SDK Dependencies

**File**: `packages/sdk/sdk-ts/package.json`

**Before:**
```json
"dependencies": {
  "@ai-stats/devtools-core": "workspace:*",
  "@ai-stats/devtools-viewer": "workspace:*"  // ← Always installed
}
```

**After:**
```json
"dependencies": {
  "@ai-stats/devtools-core": "workspace:*"
  // Viewer removed - now optional via prompt
}
```

### 2. Added Post-Install Script

**File**: `packages/sdk/sdk-ts/scripts/postinstall.js` (NEW)

A beautiful, user-friendly interactive prompt that:
- ✅ Asks users if they want to install the viewer
- ✅ Auto-detects package manager (npm/pnpm/yarn)
- ✅ Skips in CI environments automatically
- ✅ Supports environment variables for automation
- ✅ Non-blocking (never fails the main install)
- ✅ Provides helpful next steps after install

**Environment Variables:**
- `AI_STATS_SKIP_POSTINSTALL=true` - Skip prompt entirely
- `AI_STATS_INSTALL_VIEWER=true` - Auto-install without prompting
- `AI_STATS_INSTALL_VIEWER=false` - Auto-skip without prompting

### 3. Updated Documentation

**Files Updated:**
- `packages/sdk/sdk-ts/README.md` - Added installation note and env vars
- `packages/sdk/sdk-ts/INSTALLATION.md` (NEW) - Complete installation guide
- `packages/devtools/devtools/README.md` - Updated installation section

## User Experience

### Installation Flow

```bash
$ npm install @ai-stats/sdk
```

**User sees:**

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

? Install devtools viewer? (Y/n) _
```

### If User Chooses "Yes"

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

### If User Chooses "No"

```
⏭️  Skipped. You can install it anytime with:
   npm install -D @ai-stats/devtools-viewer
```

## What Gets Installed

### Always Included (with SDK)

✅ **@ai-stats/devtools-core** (~50KB)
- Core schemas and telemetry writer
- Required for `createAIStatsDevtools()` function
- Captures API requests to `.ai-stats-devtools/`
- Zero performance impact

### Optional (via prompt)

📦 **@ai-stats/devtools-viewer** (~5MB)
- Beautiful web UI for viewing captured data
- Only installed if user chooses "Yes"
- Can be installed later or run with `npx`
- Not needed for telemetry capture to work

## Benefits

### For Users

1. **Faster Installs** - Only install what you need
2. **Choice** - You decide if you want the viewer
3. **Flexibility** - Can install viewer later or use `npx`
4. **Clarity** - Clear explanation of what each component does

### For CI/CD

1. **Auto-Skips** - Automatically skips in CI environments
2. **Scriptable** - Environment variables for automation
3. **Non-Blocking** - Never fails the main install

### For Maintainers

1. **Less Bloat** - Viewer only installed when needed
2. **Better UX** - Interactive and educational
3. **Professional** - Matches modern package standards

## Comparison: Before vs After

### Before

```bash
npm install @ai-stats/sdk
# Downloads: SDK + core + viewer (5MB+)
# No choice, viewer always installed
```

### After

```bash
npm install @ai-stats/sdk
# Downloads: SDK + core (~50KB)
# Prompts for viewer (optional 5MB)
# User chooses what they need
```

## Testing

### Manual Test

```bash
# Test the prompt
cd packages/sdk/sdk-ts
npm install

# Should show the interactive prompt
```

### Test with Environment Variables

```bash
# Auto-install
AI_STATS_INSTALL_VIEWER=true npm install

# Auto-skip
AI_STATS_INSTALL_VIEWER=false npm install

# Skip prompt entirely
AI_STATS_SKIP_POSTINSTALL=true npm install
```

### Test in CI (should auto-skip)

```bash
CI=true npm install
# Should not show prompt
```

## Package Sizes

| Package | Size | Always Installed? |
|---------|------|-------------------|
| `@ai-stats/sdk` | ~100KB | ✓ Yes |
| `@ai-stats/devtools-core` | ~50KB | ✓ Yes (with SDK) |
| `@ai-stats/devtools-viewer` | ~5MB | ✗ Optional (prompt) |

**Total download:**
- **Without viewer**: ~150KB
- **With viewer**: ~5.15MB

## Auto-Skip Scenarios

The prompt automatically skips in:

1. **CI Environments**
   - `CI=true`
   - `GITHUB_ACTIONS=true`
   - `GITLAB_CI=true`
   - `CIRCLECI=true`

2. **Publishing**
   - `npm publish`
   - `prepublishOnly`
   - Global installs

3. **Already Installed**
   - Workspace context with viewer present

4. **Environment Variables**
   - `AI_STATS_SKIP_POSTINSTALL=true`
   - `AI_STATS_INSTALL_VIEWER=false`

## Files Created/Modified

### New Files

```
packages/sdk/sdk-ts/
├── scripts/
│   └── postinstall.js          ← Interactive install script
└── INSTALLATION.md             ← Installation guide
```

### Modified Files

```
packages/sdk/sdk-ts/
├── package.json                ← Removed viewer dep, added postinstall
└── README.md                   ← Added installation note + env vars

packages/devtools/devtools/
└── README.md                   ← Updated installation section
```

## Next Steps

### Before Publishing

1. **Test the prompt**
   ```bash
   cd packages/sdk/sdk-ts
   rm -rf node_modules
   npm install
   ```

2. **Test environment variables**
   ```bash
   AI_STATS_INSTALL_VIEWER=true npm install
   AI_STATS_INSTALL_VIEWER=false npm install
   AI_STATS_SKIP_POSTINSTALL=true npm install
   ```

3. **Test in CI**
   ```bash
   CI=true npm install
   # Should not show prompt
   ```

4. **Verify viewer can be installed later**
   ```bash
   npm install -D @ai-stats/devtools-viewer
   npx @ai-stats/devtools-viewer
   ```

### For Other Language SDKs

The same pattern can be implemented for:

**Python:**
```bash
pip install ai-stats
# Post-install: "Install devtools viewer? (Y/n)"
```

**Go:**
```bash
go get github.com/ai-stats/ai-stats-go
# Post-install: "Install devtools viewer? (Y/n)"
```

Each language SDK can use the same viewer (it's language-agnostic), just prompt during installation.

## Summary

✅ Devtools-core stays in SDK (needed for capture)
✅ Devtools-viewer becomes optional (via prompt)
✅ Beautiful interactive prompt with clear benefits
✅ Environment variables for automation
✅ Auto-skips in CI/CD
✅ Non-blocking (never fails install)
✅ Professional user experience
✅ Documentation updated

The SDK now provides a modern, user-friendly installation experience that respects user choice while making devtools easily accessible!
