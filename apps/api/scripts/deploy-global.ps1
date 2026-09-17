param(
    [switch]$SecretsFromEnvironment,

    [switch]$Deploy
)

$ErrorActionPreference = "Stop"
$config = "wrangler.toml"
$worker = "phaseo-gateway"
$globalSecretNames = @(
    "DOUBLEWORD_API_KEY",
    "OPENROUTER_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID"
)
$temporarySecretsFile = $null
$deployApiToken = [Environment]::GetEnvironmentVariable("CLOUDFLARE_DEPLOY_API_TOKEN")
$deployAccountId = [Environment]::GetEnvironmentVariable("CLOUDFLARE_DEPLOY_ACCOUNT_ID")
$previousApiToken = $env:CLOUDFLARE_API_TOKEN
$previousAccountId = $env:CLOUDFLARE_ACCOUNT_ID
$apiTokenOverridden = -not [string]::IsNullOrWhiteSpace($deployApiToken)
$accountIdOverridden = -not [string]::IsNullOrWhiteSpace($deployAccountId)

if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw "Missing global Wrangler config: $config"
}

if (-not $Deploy) {
    Write-Host "Validating $worker without deploying..."
    & pnpm exec wrangler deploy --dry-run --config $config
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Dry-run passed. Add -Deploy to publish $worker."
    exit 0
}

if ($SecretsFromEnvironment) {
    $secrets = @{}
    foreach ($name in $globalSecretNames) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $secrets[$name] = $value
        }
    }

    foreach ($requiredName in $globalSecretNames) {
        if (-not $secrets.ContainsKey($requiredName)) {
            throw "Missing required global Worker secret in the environment: $requiredName"
        }
    }

    $temporarySecretsFile = Join-Path ([IO.Path]::GetTempPath()) ("phaseo-global-secrets-$([Guid]::NewGuid()).json")
    $secrets | ConvertTo-Json -Compress | Set-Content -LiteralPath $temporarySecretsFile -Encoding utf8NoBOM
}

try {
    # Keep the Wrangler deployment credential separate from provider credentials
    # loaded from Infisical into the Worker secret file.
    if ($apiTokenOverridden) {
        $env:CLOUDFLARE_API_TOKEN = $deployApiToken
    }
    if ($accountIdOverridden) {
        $env:CLOUDFLARE_ACCOUNT_ID = $deployAccountId
    }

    $arguments = @("exec", "wrangler", "deploy", "--config", $config)
    if ($temporarySecretsFile) {
        $arguments += @("--secrets-file", $temporarySecretsFile)
    }

    Write-Host "Deploying $worker..."
    & pnpm @arguments
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    if ($apiTokenOverridden) {
        if ($null -eq $previousApiToken) {
            Remove-Item Env:CLOUDFLARE_API_TOKEN -ErrorAction SilentlyContinue
        } else {
            $env:CLOUDFLARE_API_TOKEN = $previousApiToken
        }
    }
    if ($accountIdOverridden) {
        if ($null -eq $previousAccountId) {
            Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
        } else {
            $env:CLOUDFLARE_ACCOUNT_ID = $previousAccountId
        }
    }
    if ($temporarySecretsFile -and (Test-Path -LiteralPath $temporarySecretsFile)) {
        Remove-Item -LiteralPath $temporarySecretsFile -Force
    }
}

Write-Host "Deployment completed. Verify the health and model endpoints before enabling customer traffic."
