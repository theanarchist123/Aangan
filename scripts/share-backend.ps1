# Starts the Aangan API and opens a public HTTPS tunnel to it, so testers anywhere can use the installed app.
# Needs: uv (already used for the API) and cloudflared  ->  winget install --id Cloudflare.cloudflared
#
# The tunnel URL changes every time this script runs. Testers type it once into the app:
#   sign-in screen -> "Connection settings" -> Server address.
# Keep this window open while people are testing; closing it takes the server offline.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root "services\api"

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "cloudflared is not installed. Install it once with:" -ForegroundColor Yellow
    Write-Host "    winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
    exit 1
}

# Free port 8000 if an older copy of the API is still running.
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "Starting the API on port 8000..." -ForegroundColor Cyan
# --proxy-headers makes per-user rate limits see each tester's real address instead of the tunnel's.
$apiProc = Start-Process -FilePath "uv" -WorkingDirectory $api -PassThru -WindowStyle Minimized `
    -ArgumentList "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"

$ok = $false
foreach ($i in 1..40) {
    Start-Sleep -Milliseconds 500
    try { if ((Invoke-RestMethod "http://localhost:8000/v1/health").ok) { $ok = $true; break } } catch {}
}
if (-not $ok) { Stop-Process -Id $apiProc.Id -Force; throw "The API did not start. Run it by hand to see the error." }
Write-Host "API is up. Opening the tunnel..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Look for a line like  https://something-random.trycloudflare.com  below." -ForegroundColor Green
Write-Host "Give that address to testers (Connection settings -> Server address)." -ForegroundColor Green
Write-Host ""

try { cloudflared tunnel --url http://localhost:8000 }
finally { Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue }
