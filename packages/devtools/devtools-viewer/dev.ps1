# AI Stats Devtools - Development Script (Windows)
# Quick start script for local development

Write-Host "🚀 Starting AI Stats Devtools Development Environment" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    pnpm install
    Write-Host ""
}

# Check if .ai-stats-devtools directory exists
$devtoolsDir = "..\..\..\\.ai-stats-devtools"
if (-not (Test-Path $devtoolsDir)) {
    Write-Host "⚠️  No devtools data directory found at $devtoolsDir" -ForegroundColor Yellow
    Write-Host "📁 Creating sample directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path "$devtoolsDir\assets" | Out-Null
    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    "{`"session_id`":`"dev-session`",`"started_at`":$timestamp,`"sdk`":`"development`",`"sdk_version`":`"0.0.0`"}" | Out-File -FilePath "$devtoolsDir\metadata.json" -Encoding utf8
    New-Item -ItemType File -Force -Path "$devtoolsDir\generations.jsonl" | Out-Null
    Write-Host "✅ Created empty devtools directory" -ForegroundColor Green
    Write-Host ""
}

# Check for port conflicts
$port4984 = Get-NetTCPConnection -LocalPort 4984 -State Listen -ErrorAction SilentlyContinue
$port4983 = Get-NetTCPConnection -LocalPort 4983 -State Listen -ErrorAction SilentlyContinue

if ($port4984) {
    Write-Host "⚠️  Port 4984 is already in use!" -ForegroundColor Yellow
    $killPort4984 = Read-Host "Kill the process? (y/N)"
    if ($killPort4984 -eq 'y' -or $killPort4984 -eq 'Y') {
        $pid = (Get-NetTCPConnection -LocalPort 4984 -State Listen).OwningProcess
        Stop-Process -Id $pid -Force
        Write-Host "✅ Killed process on port 4984" -ForegroundColor Green
    }
    Write-Host ""
}

if ($port4983) {
    Write-Host "⚠️  Port 4983 is already in use!" -ForegroundColor Yellow
    $killPort4983 = Read-Host "Kill the process? (y/N)"
    if ($killPort4983 -eq 'y' -or $killPort4983 -eq 'Y') {
        $pid = (Get-NetTCPConnection -LocalPort 4983 -State Listen).OwningProcess
        Stop-Process -Id $pid -Force
        Write-Host "✅ Killed process on port 4983" -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host "🔧 Environment Configuration:" -ForegroundColor Cyan
Write-Host "   API Server: http://localhost:4984"
Write-Host "   UI Dev Server: http://localhost:4983"
Write-Host "   Devtools Dir: $devtoolsDir"
Write-Host ""

Write-Host "📝 Development Tips:" -ForegroundColor Cyan
Write-Host "   • Changes to UI components reload instantly"
Write-Host "   • Changes to server code trigger auto-restart"
Write-Host "   • Check browser console (F12) for errors"
Write-Host "   • Check terminal for server logs"
Write-Host ""

Write-Host "Starting dev servers..." -ForegroundColor Green
Write-Host ""

# Start development servers
pnpm run dev
