#!/bin/bash

# AI Stats Devtools - Development Script
# Quick start script for local development

set -e

echo "🚀 Starting AI Stats Devtools Development Environment"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
    echo ""
fi

# Check if .ai-stats-devtools directory exists
DEVTOOLS_DIR="../../../.ai-stats-devtools"
if [ ! -d "$DEVTOOLS_DIR" ]; then
    echo "⚠️  No devtools data directory found at $DEVTOOLS_DIR"
    echo "📁 Creating sample directory..."
    mkdir -p "$DEVTOOLS_DIR/assets"
    echo '{"session_id":"dev-session","started_at":'$(date +%s000)',"sdk":"development","sdk_version":"0.0.0"}' > "$DEVTOOLS_DIR/metadata.json"
    touch "$DEVTOOLS_DIR/generations.jsonl"
    echo "✅ Created empty devtools directory"
    echo ""
fi

# Check for port conflicts
if lsof -Pi :4984 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 4984 is already in use!"
    echo "   Run: lsof -ti:4984 | xargs kill -9"
    echo ""
fi

if lsof -Pi :4983 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "⚠️  Port 4983 is already in use!"
    echo "   Run: lsof -ti:4983 | xargs kill -9"
    echo ""
fi

echo "🔧 Environment Configuration:"
echo "   API Server: http://localhost:4984"
echo "   UI Dev Server: http://localhost:4983"
echo "   Devtools Dir: $DEVTOOLS_DIR"
echo ""

echo "📝 Development Tips:"
echo "   • Changes to UI components reload instantly"
echo "   • Changes to server code trigger auto-restart"
echo "   • Check browser console (F12) for errors"
echo "   • Check terminal for server logs"
echo ""

echo "Starting dev servers..."
echo ""

# Start development servers
pnpm run dev
