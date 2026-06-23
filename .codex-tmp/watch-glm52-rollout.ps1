param(
  [string]$Repo = "AI-Stats/AI-Stats"
)

$ErrorActionPreference = "Stop"

function Get-PageText {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 30).Content
  } catch {
    return $null
  }
}

function Find-GitHubIssueSignals {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoName
  )

  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    return @()
  }

  try {
    $json = gh issue list `
      --repo $RepoName `
      --state all `
      --search 'GLM 5.2 in:title,body' `
      --json number,title,url,updatedAt,state

    if (-not $json) {
      return @()
    }

    return ($json | ConvertFrom-Json)
  } catch {
    return @()
  }
}

$pricingUrl = "https://docs.z.ai/guides/overview/pricing"
$releaseNotesUrl = "https://docs.z.ai/release-notes/new-released"
$quickStartUrl = "https://docs.z.ai/devpack/quick-start"
$openRouterUrl = "https://openrouter.ai/z-ai/glm-5.2"

$pricingText = Get-PageText -Url $pricingUrl
$releaseNotesText = Get-PageText -Url $releaseNotesUrl
$quickStartText = Get-PageText -Url $quickStartUrl
$openRouterText = Get-PageText -Url $openRouterUrl
$issueSignals = Find-GitHubIssueSignals -RepoName $Repo

$pricingPublished = $false
if ($pricingText) {
  $pricingPublished = [bool]($pricingText -match 'GLM-5\.2\s*\$')
}

$releaseNotesPublished = $false
if ($releaseNotesText) {
  $releaseNotesPublished = [bool]($releaseNotesText -match '2026-[0-9]{2}-[0-9]{2}[\s\S]{0,400}GLM-5\.2')
}

$generalApiPublished = $false
if ($quickStartText) {
  $generalApiPublished = [bool](($quickStartText -match 'GLM-5\.2') -and ($quickStartText -match 'api\.z\.ai/api/paas/v4'))
}

$openRouterTomorrowSignal = $false
if ($openRouterText) {
  $openRouterTomorrowSignal = [bool](($openRouterText -match 'GLM-5\.2') -and ($openRouterText -match 'API releases on June 16, 2026'))
}

$result = [ordered]@{
  checked_at = (Get-Date).ToString("o")
  repo = $Repo
  pages = [ordered]@{
    pricing = $pricingUrl
    release_notes = $releaseNotesUrl
    quick_start = $quickStartUrl
    openrouter = $openRouterUrl
  }
  signals = [ordered]@{
    pricing_published = $pricingPublished
    release_notes_published = $releaseNotesPublished
    general_api_published = $generalApiPublished
    openrouter_tomorrow_signal = $openRouterTomorrowSignal
    github_issue_count = @($issueSignals).Count
  }
  github_issues = @($issueSignals)
}

$result | ConvertTo-Json -Depth 6
