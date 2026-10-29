param(
    [switch]$SecretsFromEnvironment,

    [switch]$Deploy,

    # The first deploy creates phaseo-realtime before any call can run on it, so
    # it skips the maintenance and live-call checks.
    [switch]$Initial
)

# Deploys phaseo-realtime, the realtime relay Worker. Deploying it ends every
# call it carries, so outside -Initial it refuses unless the maintenance switch
# is on and no realtime session is still live. Run it through the
# realtime-relay-deploy workflow or the realtime-maintenance skill.

$ErrorActionPreference = "Stop"
$config = "wrangler.realtime.toml"
$worker = "phaseo-realtime"
$maintenanceKey = "realtime:maintenance:v1"
$cacheNamespaceId = "f5e23068fcd94125ad9860c817c543d9"
$temporarySecretsFile = $null
$deployApiToken = [Environment]::GetEnvironmentVariable("CLOUDFLARE_DEPLOY_API_TOKEN")
$deployAccountId = [Environment]::GetEnvironmentVariable("CLOUDFLARE_DEPLOY_ACCOUNT_ID")
$previousApiToken = $env:CLOUDFLARE_API_TOKEN
$previousAccountId = $env:CLOUDFLARE_ACCOUNT_ID
$apiTokenOverridden = -not [string]::IsNullOrWhiteSpace($deployApiToken)
$accountIdOverridden = -not [string]::IsNullOrWhiteSpace($deployAccountId)

# Secrets the relay reads: Supabase (sessions, billing, and the reconciliation
# token, which phaseo-gateway also derives from it) and the realtime providers.
$requiredSecretNames = @(
    "SUPABASE_SERVICE_ROLE_KEY",
    "OPENAI_API_KEY",
    "GOOGLE_AI_STUDIO_API_KEY",
    "X_AI_API_KEY",
    "ELEVENLABS_API_KEY"
)
$optionalSecretNames = @("KEY_PEPPER_ACTIVE", "AXIOM_API_KEY", "AXIOM_DATASET")

if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw "Missing realtime Wrangler config: $config"
}

if (-not $Deploy) {
    Write-Host "Validating $worker without deploying..."
    & pnpm exec wrangler deploy --dry-run --config $config
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Dry-run passed. Add -Deploy to publish $worker (only inside a maintenance window)."
    exit 0
}

try {
    if ($apiTokenOverridden) { $env:CLOUDFLARE_API_TOKEN = $deployApiToken }
    if ($accountIdOverridden) { $env:CLOUDFLARE_ACCOUNT_ID = $deployAccountId }

    if (-not $Initial) {
        $switch = & pnpm exec wrangler kv key get $maintenanceKey --namespace-id $cacheNamespaceId --remote --text 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $switch -or -not (($switch | Out-String) -match '"enabled"\s*:\s*true')) {
            throw "The realtime maintenance switch is off. Turn it on and wait for live calls to end before deploying $worker."
        }
        $supabaseUrl = "https://xansbgjaduxypzsmjwct.supabase.co"
        $serviceKey = [Environment]::GetEnvironmentVariable("SUPABASE_SERVICE_ROLE_KEY")
        if ([string]::IsNullOrWhiteSpace($serviceKey)) { throw "SUPABASE_SERVICE_ROLE_KEY is needed to count live realtime sessions." }
        $response = Invoke-WebRequest -Method Head -UseBasicParsing `
            -Uri "$supabaseUrl/rest/v1/gateway_realtime_sessions?select=session_id&status=in.(created,connecting,connected,ending)" `
            -Headers @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey"; Prefer = "count=exact" }
        $live = [int](($response.Headers["Content-Range"] | Select-Object -First 1) -split "/")[-1]
        if ($live -gt 0) {
            throw "$live realtime session(s) are still live. Wait for them to end before deploying $worker."
        }
        Write-Host "Maintenance switch is on and no realtime session is live."
    }

    if ($SecretsFromEnvironment) {
        $secrets = @{}
        foreach ($name in ($requiredSecretNames + $optionalSecretNames)) {
            $value = [Environment]::GetEnvironmentVariable($name)
            if (-not [string]::IsNullOrWhiteSpace($value)) { $secrets[$name] = $value }
        }
        foreach ($requiredName in $requiredSecretNames) {
            if (-not $secrets.ContainsKey($requiredName)) {
                throw "Missing required realtime Worker secret in the environment: $requiredName"
            }
        }
        $temporarySecretsFile = Join-Path ([IO.Path]::GetTempPath()) ("phaseo-realtime-secrets-$([Guid]::NewGuid()).json")
        $secrets | ConvertTo-Json -Compress | Set-Content -LiteralPath $temporarySecretsFile -Encoding utf8NoBOM
    }

    $arguments = @("exec", "wrangler", "deploy", "--config", $config)
    if ($temporarySecretsFile) { $arguments += @("--secrets-file", $temporarySecretsFile) }

    Write-Host "Deploying $worker..."
    & pnpm @arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    if ($apiTokenOverridden) {
        if ($null -eq $previousApiToken) { Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue }
        else { $env:CLOUDFLARE_API_TOKEN = $previousApiToken }
    }
    if ($accountIdOverridden) {
        if ($null -eq $previousAccountId) { Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue }
        else { $env:CLOUDFLARE_ACCOUNT_ID = $previousAccountId }
    }
    if ($temporarySecretsFile -and (Test-Path -LiteralPath $temporarySecretsFile)) {
        Remove-Item -LiteralPath $temporarySecretsFile -Force
    }
}

Write-Host "Deployed $worker. Turn the maintenance switch off once a test call connects."
