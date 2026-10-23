$ErrorActionPreference = "Continue"

Write-Host "=== Starting Debate Analyzer Services ==="

# 1. Start Docker Desktop if not running
$dockerHealthy = $false
try {
    $out = docker ps 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerHealthy = $true }
} catch {}

if (-not $dockerHealthy) {
    Write-Host "[1/5] Starting Docker Desktop..."
    Remove-Item -Path "$env:LOCALAPPDATA\Docker\*.lock" -Force -ErrorAction SilentlyContinue
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe" -WindowStyle Hidden
    
    $retries = 20
    while ($retries -gt 0) {
        Start-Sleep -Seconds 3
        try {
            $out = docker ps 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  Docker daemon ready!"
                $dockerHealthy = $true
                break
            }
        } catch {}
        $retries--
    }
} else {
    Write-Host "[1/5] Docker daemon already running."
}

# Ensure containers are up
docker compose up -d

# 2. Start Ollama if not running
Write-Host "[2/5] Checking Ollama..."
$ollamaHealthy = $false
try {
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2
    if ($res) { $ollamaHealthy = $true }
} catch {}

if (-not $ollamaHealthy) {
    Write-Host "  Starting Ollama serve..."
    Start-Process "ollama" -ArgumentList "serve" -WindowStyle Hidden
    $retries = 10
    while ($retries -gt 0) {
        Start-Sleep -Seconds 2
        try {
            $res = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 2
            if ($res) {
                Write-Host "  Ollama ready!"
                $ollamaHealthy = $true
                break
            }
        } catch {}
        $retries--
    }
} else {
    Write-Host "  Ollama already running."
}

# 3. Start Whisper if not running
Write-Host "[3/5] Checking Whisper service..."
$whisperHealthy = $false
try {
    $res = Invoke-RestMethod -Uri "http://localhost:5001/health" -TimeoutSec 2
    if ($res.status -eq "ok") { $whisperHealthy = $true }
} catch {}

if (-not $whisperHealthy) {
    Write-Host "  Starting Whisper service on port 5001..."
    Start-Process "python" -ArgumentList "whisper-service/server.py" -WorkingDirectory (Get-Location).Path -WindowStyle Hidden
    $retries = 10
    while ($retries -gt 0) {
        Start-Sleep -Seconds 2
        try {
            $res = Invoke-RestMethod -Uri "http://localhost:5001/health" -TimeoutSec 2
            if ($res.status -eq "ok") {
                Write-Host "  Whisper service ready!"
                $whisperHealthy = $true
                break
            }
        } catch {}
        $retries--
    }
} else {
    Write-Host "  Whisper service already running."
}

# 4. Check port 3000 conflicts and start Next.js
Write-Host "[4/5] Checking Next.js web application..."
$conns = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
foreach ($c in $conns) {
    if ($c.OwningProcess -gt 0) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        # If it's not our app, terminate it
        try {
            $cim = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)"
            if ($cim.CommandLine -notmatch "Debate Ayyan") {
                Write-Host "  Terminating foreign process $($c.OwningProcess) on port 3000"
                Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
            }
        } catch {}
    }
}

$webHealthy = $false
try {
    $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health/ready" -TimeoutSec 3
    if ($res.status -eq "ready") { $webHealthy = $true }
} catch {}

if (-not $webHealthy) {
    Write-Host "  Starting Next.js dev server..."
    Start-Process "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory (Get-Location).Path -WindowStyle Hidden
    $retries = 15
    while ($retries -gt 0) {
        Start-Sleep -Seconds 2
        try {
            $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health/ready" -TimeoutSec 3
            if ($res.status -eq "ready") {
                Write-Host "  Next.js ready!"
                $webHealthy = $true
                break
            }
        } catch {}
        $retries--
    }
} else {
    Write-Host "  Next.js already running and healthy."
}

# 5. Start Analysis Worker if not running
Write-Host "[5/5] Checking Analysis Worker..."
$workerRunning = $false
$allNodes = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'"
foreach ($n in $allNodes) {
    if ($n.CommandLine -match "analysis-worker\.ts") {
        $workerRunning = $true
        break
    }
}

if (-not $workerRunning) {
    Write-Host "  Starting Analysis Worker..."
    Start-Process "cmd.exe" -ArgumentList "/c npm run worker" -WorkingDirectory (Get-Location).Path -WindowStyle Hidden
    Start-Sleep -Seconds 3
    Write-Host "  Analysis Worker launched."
} else {
    Write-Host "  Analysis Worker already running."
}

Write-Host "=== Final Status ==="
try {
    $ready = Invoke-RestMethod -Uri "http://localhost:3000/api/health/ready"
    $ready | ConvertTo-Json
} catch {
    Write-Host "Web app readiness check failed: $_"
}
