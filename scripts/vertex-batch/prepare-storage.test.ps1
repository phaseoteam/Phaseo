$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'prepare-storage.ps1'
$arguments = @{
    ProjectId = 'test-project'
    ProjectNumber = '123456789'
    GatewayServiceAccount = 'gateway@test-project.iam.gserviceaccount.com'
}
function Assert-True($Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

# Any external invocation in preview must fail the test, even on a logged-in host.
function gcloud { throw 'Preview called gcloud.' }
function Invoke-RestMethod { throw 'Preview called the network.' }
$plan = (& $scriptPath @arguments) | ConvertFrom-Json
Assert-True ($plan.bucket.storageClass -eq 'STANDARD') 'Storage class changed.'
Assert-True ($plan.bucket.location -eq 'us-central1') 'Region changed.'
Assert-True ($plan.bucket.iamConfiguration.publicAccessPrevention -eq 'enforced') 'Bucket must prevent public access.'
Assert-True ($plan.bucket.iamConfiguration.uniformBucketLevelAccess.enabled -eq $true) 'Uniform IAM required.'
Assert-True ($plan.bucket.softDeletePolicy.retentionDurationSeconds -eq '0') 'Soft delete would extend billed retention.'
Assert-True ($plan.bucket.versioning.enabled -eq $false) 'Versioning would retain old objects.'
$rule = $plan.bucket.lifecycle.rule[0]
Assert-True ($rule.action.type -eq 'Delete' -and $rule.condition.age -eq 30) 'Expected 30-day deletion.'
Assert-True (($rule.condition.matchesPrefix -join ',') -eq 'inputs/,outputs/') 'Cleanup must stay scoped to batch prefixes.'
Assert-True ($plan.bucketBindings.Count -eq 3) 'Unexpected permission grant count.'
Assert-True (($plan.bucketBindings | Where-Object { $_.member -match 'allUsers|allAuthenticatedUsers' }).Count -eq 0) 'Public grant found.'
Assert-True ($plan.bucketBindings[1].member -eq 'serviceAccount:service-123456789@gcp-sa-aiplatform.iam.gserviceaccount.com') 'Wrong Vertex service agent.'

$rejected = $false
try { & $scriptPath @arguments -BucketName 'bad/name' | Out-Null } catch { $rejected = $true }
Assert-True $rejected 'Invalid bucket name was accepted.'

# An explicit project/number mismatch must stop Apply before a token or network call.
function gcloud {
    if (($args[0..2] -join ' ') -ne 'projects describe test-project') { throw 'Unexpected gcloud call.' }
    $global:LASTEXITCODE = 0
    return '{"projectNumber":"999"}'
}
$rejected = $false
try { & $scriptPath @arguments -Apply | Out-Null } catch {
    if ($_.Exception.Message -ne 'Project number does not match ProjectId.') { throw }
    $rejected = $true
}
Assert-True $rejected 'Apply accepted a mismatched project number.'

# Exercise Apply with fake cloud boundaries: one private create, three scoped
# grants and readback. There are no real credentials or network requests here.
$testState = @{
    creates = New-Object 'System.Collections.Generic.List[object]'
    grants = New-Object 'System.Collections.Generic.List[object]'
}
function gcloud {
    $global:LASTEXITCODE = 0
    switch ($args[0..2] -join ' ') {
        'projects describe test-project' { return '{"projectNumber":"123456789"}' }
        'auth print-access-token' { return 'test-token' }
        'storage buckets add-iam-policy-binding' {
            $testState.grants.Add(@($args))
            return '{}'
        }
        'storage buckets describe' { return '{}' }
        'storage buckets get-iam-policy' { return '{}' }
        default { throw 'Unexpected gcloud call.' }
    }
}
function Invoke-RestMethod {
    param($Method, $Uri, $Headers, $ContentType, $Body, $TimeoutSec)
    Assert-True ($Method -eq 'Post') 'Only bucket creation is allowed.'
    Assert-True ($Uri -eq 'https://storage.googleapis.com/storage/v1/b?project=test-project') 'Unexpected project or endpoint.'
    Assert-True ($Headers.Authorization -eq 'Bearer test-token') 'Expected operator token.'
    $testState.creates.Add(($Body | ConvertFrom-Json))
    return @{}
}
$applied = (& $scriptPath @arguments -Apply) | ConvertFrom-Json
Assert-True ($testState.creates.Count -eq 1) 'Expected exactly one bucket create.'
Assert-True ($testState.creates[0].iamConfiguration.publicAccessPrevention -eq 'enforced') 'Creation must be private.'
Assert-True ($testState.grants.Count -eq 3) 'Expected three bucket grants.'
foreach ($grant in $testState.grants) {
    Assert-True ($grant[3] -eq $plan.bucketUri -and $grant -contains '--project=test-project') 'IAM grant escaped the selected bucket/project.'
}
Write-Output 'Vertex storage preparation checks passed.'
