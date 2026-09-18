param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("eu", "us")]
    [string]$Region,

    [string]$SecretsFile,

    [switch]$SecretsFromEnvironment,

    [switch]$Deploy
)

$ErrorActionPreference = "Stop"
$config = "wrangler.$Region.toml"
$worker = "phaseo-gateway-$Region"
$temporarySecretsFile = $null
$deployApiToken = [Environment]::GetEnvironmentVariable("CLOUDFLARE_DEPLOY_API_TOKEN")
$deployAccountId = [Environment]::GetEnvironmentVariable("CLOUDFLARE_DEPLOY_ACCOUNT_ID")
$previousApiToken = $env:CLOUDFLARE_API_TOKEN
$previousAccountId = $env:CLOUDFLARE_ACCOUNT_ID
$apiTokenOverridden = -not [string]::IsNullOrWhiteSpace($deployApiToken)
$accountIdOverridden = -not [string]::IsNullOrWhiteSpace($deployAccountId)

$regionalSecretNames = @(
    "SUPABASE_SERVICE_ROLE_KEY",
    "KEY_PEPPER_ACTIVE",
    "KEY_PEPPER_PREVIOUS",
    "OPENAI_API_KEY",
    "OPENROUTER_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "DOUBLEWORD_API_KEY",
    "TYPESAFE_API_KEY",
    "MISTRAL_API_KEY",
    "MISTRAL_AI_API_KEY",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AWS_API_KEY",
    "AWS_BEARER_TOKEN_BEDROCK",
    "AMAZON_BEDROCK_API_KEY",
    "AMAZON_BEDROCK_MANTLE_API_KEY",
    "AMAZON_BEDROCK_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_REGION",
    "GOOGLE_VERTEX_API_KEY",
    "GOOGLE_VERTEX_ACCESS_TOKEN",
    "GOOGLE_VERTEX_PROJECT",
    "GOOGLE_VERTEX_LOCATION"
)

if (-not (Test-Path -LiteralPath $config -PathType Leaf)) {
    throw "Missing regional Wrangler config: $config"
}

if (-not $Deploy) {
    Write-Host "Validating $worker without deploying..."
    & pnpm exec wrangler deploy --dry-run --config $config
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "Dry-run passed. Add -Deploy to publish $worker."
    exit 0
}

if ($SecretsFile -and $SecretsFromEnvironment) {
    throw "Use either -SecretsFile or -SecretsFromEnvironment, not both."
}

if ($SecretsFromEnvironment) {
    $secrets = @{}
    foreach ($name in $regionalSecretNames) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            $secrets[$name] = $value
        }
    }

    foreach ($requiredName in @("SUPABASE_SERVICE_ROLE_KEY", "KEY_PEPPER_ACTIVE")) {
        if (-not $secrets.ContainsKey($requiredName)) {
            throw "Missing required regional Worker secret in the environment: $requiredName"
        }
    }

    $temporarySecretsFile = Join-Path ([IO.Path]::GetTempPath()) ("phaseo-$Region-secrets-$([Guid]::NewGuid()).json")
    $secrets | ConvertTo-Json -Compress | Set-Content -LiteralPath $temporarySecretsFile -Encoding utf8NoBOM
    $SecretsFile = $temporarySecretsFile
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
    if ($SecretsFile) {
        $resolvedSecretsFile = Resolve-Path -LiteralPath $SecretsFile -ErrorAction Stop
        $arguments += @("--secrets-file", $resolvedSecretsFile.Path)
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
