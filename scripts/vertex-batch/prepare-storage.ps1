[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')][string]$ProjectId,
    [Parameter(Mandatory)][ValidatePattern('^[0-9]+$')][string]$ProjectNumber,
    [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9._-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com$')][string]$GatewayServiceAccount,
    [ValidatePattern('^[a-z]+-[a-z]+[0-9]+$')][string]$Region = 'us-central1',
    [ValidatePattern('^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$')][string]$BucketName,
    [switch]$Apply
)

$ErrorActionPreference = 'Stop'
if (-not $BucketName) { $BucketName = "$ProjectId-phaseo-vertex-batch-$Region" }
if ($BucketName.Length -gt 63) { throw 'Choose a BucketName with at most 63 characters.' }
$vertexServiceAgent = "service-$ProjectNumber@gcp-sa-aiplatform.iam.gserviceaccount.com"
$bucketUri = "gs://$BucketName"
$bucket = [ordered]@{
    name = $BucketName
    location = $Region
    storageClass = 'STANDARD'
    iamConfiguration = @{
        uniformBucketLevelAccess = @{ enabled = $true }
        publicAccessPrevention = 'enforced'
    }
    versioning = @{ enabled = $false }
    softDeletePolicy = @{ retentionDurationSeconds = '0' }
    lifecycle = @{
        rule = @(@{
            action = @{ type = 'Delete' }
            condition = @{ age = 30; matchesPrefix = @('inputs/', 'outputs/') }
        })
    }
}
$bindings = @(
    @{ member = "serviceAccount:$GatewayServiceAccount"; role = 'roles/storage.objectUser' },
    @{ member = "serviceAccount:$vertexServiceAgent"; role = 'roles/storage.objectViewer' },
    @{ member = "serviceAccount:$vertexServiceAgent"; role = 'roles/storage.objectCreator' }
)
$plan = [ordered]@{
    projectId = $ProjectId
    projectNumber = $ProjectNumber
    bucketUri = $bucketUri
    bucket = $bucket
    bucketBindings = $bindings
    inputPrefix = "$bucketUri/inputs/"
    outputPrefix = "$bucketUri/outputs/"
    gatewayIntegration = 'Not implemented; Vertex Batch remains blocked.'
}

# Preview is offline and makes no Google API calls.
if (-not $Apply) { $plan | ConvertTo-Json -Depth 10; return }

function Invoke-GcloudJson([string[]]$Arguments) {
    $result = & gcloud @Arguments '--format=json'
    if ($LASTEXITCODE -ne 0) { throw 'gcloud failed; setup stopped.' }
    return ($result | ConvertFrom-Json)
}

# Check the explicit project before creating anything. Never change gcloud defaults.
$project = Invoke-GcloudJson -Arguments @('projects', 'describe', $ProjectId)
if ([string]$project.projectNumber -ne $ProjectNumber) { throw 'Project number does not match ProjectId.' }
$accessToken = & gcloud auth print-access-token
if ($LASTEXITCODE -ne 0 -or -not $accessToken) { throw 'An authenticated gcloud operator is required.' }
try {
    # POST fails if this bucket already exists; never replace another bucket's
    # lifecycle, access or recovery settings. The new bucket starts private.
    $null = Invoke-RestMethod -Method Post `
        -Uri "https://storage.googleapis.com/storage/v1/b?project=$ProjectId" `
        -Headers @{ Authorization = "Bearer $accessToken" } `
        -ContentType 'application/json' -Body ($bucket | ConvertTo-Json -Depth 10) -TimeoutSec 60
} finally {
    $accessToken = $null
}
foreach ($binding in $bindings) {
    $null = Invoke-GcloudJson -Arguments @(
        'storage', 'buckets', 'add-iam-policy-binding', $bucketUri,
        "--member=$($binding.member)", "--role=$($binding.role)",
        '--condition=None', "--project=$ProjectId", '--quiet'
    )
}
$readback = Invoke-GcloudJson -Arguments @('storage', 'buckets', 'describe', $bucketUri, "--project=$ProjectId")
[ordered]@{ bucket = $readback; iam = (Invoke-GcloudJson -Arguments @('storage', 'buckets', 'get-iam-policy', $bucketUri, "--project=$ProjectId")) } | ConvertTo-Json -Depth 15
