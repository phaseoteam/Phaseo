# Kill processes on devtools ports
$ports = @(4984, 4983)

foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $processId = $conn.OwningProcess
            Write-Host "Killing process $processId on port $port" -ForegroundColor Yellow
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
        Write-Host "Cleaned up port $port" -ForegroundColor Green
    } else {
        Write-Host "Port $port is free" -ForegroundColor Green
    }
}

Write-Host "`nAll ports cleaned up!  " -ForegroundColor Green
