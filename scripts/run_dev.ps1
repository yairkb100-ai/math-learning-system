# run_dev.ps1 — start backend (uvicorn :8000) and frontend (Vite :5173).
# Windows PowerShell 5.1 compatible. No && chaining.
# Usage (from project root):  ./scripts/run_dev.ps1

$ErrorActionPreference = "Stop"

# Resolve project root (parent of this scripts/ folder).
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent $scriptDir
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

Write-Host "Project root: $root"

# Start the backend in a new PowerShell window so its logs stay visible.
Write-Host "Starting backend (uvicorn on http://localhost:8000) ..."
Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location -LiteralPath '$backend'; py -m uvicorn app.main:app --port 8000"
)

# Give the backend a moment to bind the port.
Start-Sleep -Seconds 2

# Start the frontend in this window (foreground).
Write-Host "Starting frontend (Vite on http://localhost:5173) ..."
Set-Location -LiteralPath $frontend
if (-not (Test-Path (Join-Path $frontend "node_modules"))) {
    Write-Host "node_modules not found — running npm install ..."
    npm install
}
npm run dev
