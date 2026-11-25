# Publishes an over-the-air update: every installed Aangan app downloads it the next time it is opened,
# shows "A new version is ready", and one tap restarts into it. No new APK, no reinstall.
#
#   .\scripts\publish-update.ps1 -Message "Fixed document upload"
#
# One-time setup first (see docs\UPDATING_THE_APP.md): npx eas-cli login ; npx eas-cli init
# Only use this for changes to the app's screens/logic. A new native library or permission needs a new APK instead.

param(
    [Parameter(Mandatory = $true)][string]$Message,
    [string]$ServerUrl = "https://aangan-api-zz4a.onrender.com"
)

$ErrorActionPreference = "Stop"
$mobile = Join-Path (Split-Path -Parent $PSScriptRoot) "apps\mobile"
Set-Location $mobile

# The update bundle is built here, so bake the same server address the installed apps use.
$env:EXPO_PUBLIC_API_URL = $ServerUrl.TrimEnd("/")

npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { throw "Type errors: fix them before publishing an update to real users." }

Write-Host "Publishing to the production channel..." -ForegroundColor Cyan
npx eas-cli update --channel production --platform android --message $Message --non-interactive
if ($LASTEXITCODE -ne 0) { throw "eas update failed. Are you logged in? Run: npx eas-cli login" }
Write-Host "`nPublished. Installed apps pick it up the next time they are opened." -ForegroundColor Green
