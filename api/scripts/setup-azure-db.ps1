# Stores DATABASE_URL (built from api\.env.azure) in the web app settings. The password is never printed.
# Tables and sample data are created by the web app itself on startup (startup.sh), so no DB access from this PC is needed.
#   powershell -ExecutionPolicy Bypass -File api\scripts\setup-azure-db.ps1
param(
    [string]$ResourceGroup = "rg-001-gen12",
    [string]$WebApp = "app-kyotsuchi-map-api"
)
$ErrorActionPreference = "Stop"
$apiDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $apiDir ".env.azure"
if (-not (Test-Path $envFile)) { throw "Not found: $envFile (copy .env.azure.example to .env.azure and fill in DB_PASSWORD)" }

# Defaults come from .env.azure.example; values in .env.azure override them (it may contain only DB_PASSWORD).
$cfg = @{}
foreach ($file in (Join-Path $apiDir ".env.azure.example"), $envFile) {
    if (-not (Test-Path $file)) { continue }
    foreach ($line in Get-Content $file -Encoding UTF8) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $Matches[2]) { $cfg[$Matches[1]] = $Matches[2] }
    }
}
foreach ($k in "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME") {
    if (-not $cfg[$k]) { throw "$k is empty in .env.azure" }
}

$user = [uri]::EscapeDataString($cfg.DB_USER)
$pass = [uri]::EscapeDataString($cfg.DB_PASSWORD)
$url = "mysql+pymysql://${user}:${pass}@$($cfg.DB_HOST):3306/$($cfg.DB_NAME)"

Write-Host "Saving DATABASE_URL ($($cfg.DB_USER)@$($cfg.DB_HOST)/$($cfg.DB_NAME)) to web app '$WebApp' ..."
# az prints harmless warnings to stderr; with "Stop" Windows PowerShell would treat them as errors
$ErrorActionPreference = "Continue"
az webapp config appsettings set -g $ResourceGroup -n $WebApp --settings "DATABASE_URL=$url" -o none 2>$null
if ($LASTEXITCODE -ne 0) { throw "az webapp config appsettings set failed" }
$ErrorActionPreference = "Stop"
Write-Host "Done. The web app restarts, creates tables and loads sample data (takes 1-2 minutes)."
