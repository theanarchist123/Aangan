# Builds the installable Android APK:  apps\mobile\dist\Aangan-<version>.apk
#
#   .\scripts\build-apk.ps1 -ServerUrl https://aangan-api.onrender.com
#
# Needs: Node, JDK 17+ and the Android SDK (Android Studio installs both). First build takes 15-30 minutes.
#
# Why it copies the project to C:\a first: React Native's C++ build creates very deeply nested folders, and Windows
# refuses paths over 260 characters ("ninja: error: mkdir ... failed"). A short build folder keeps every path under it.

param(
    [string]$ServerUrl = "",
    [string]$BuildDir = "C:\a"
)

$ErrorActionPreference = "Stop"
$mobile = Join-Path (Split-Path -Parent $PSScriptRoot) "apps\mobile"

if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
if (-not (Test-Path $env:ANDROID_HOME)) { throw "Android SDK not found at $env:ANDROID_HOME. Install Android Studio first." }
if (-not $env:JAVA_HOME) {
    # Only folders that really contain a JDK (there can be stray entries such as "latest").
    $jdk = Get-ChildItem "C:\Program Files\Java" -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName "bin\java.exe") } | Sort-Object Name -Descending | Select-Object -First 1
    if ($jdk) { $env:JAVA_HOME = $jdk.FullName } else { throw "No JDK found. Install JDK 17 or newer." }
}
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

if (-not (Test-Path (Join-Path $mobile "credentials\keystore.properties"))) {
    throw "apps\mobile\credentials\keystore.properties is missing. Without your signing key the APK cannot be updated in place on testers' phones."
}
if ($ServerUrl) { $env:EXPO_PUBLIC_API_URL = $ServerUrl.TrimEnd("/") }
Write-Host "Server address baked into this build: $(if ($env:EXPO_PUBLIC_API_URL) { $env:EXPO_PUBLIC_API_URL } else { '(from apps\mobile\.env)' })" -ForegroundColor Cyan

# 1. Copy the project (not node_modules / generated folders) to the short path. Never delete $BuildDir\node_modules or
#    \android here so repeat builds stay fast; robocopy only updates changed files.
Write-Host "Copying the project to $BuildDir ..." -ForegroundColor Cyan
robocopy $mobile $BuildDir /MIR /XD node_modules android ios dist .expo c .cxx /XF build-apk.log /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0

Set-Location $BuildDir
# Reinstall whenever package-lock.json changed since the last install (a stale node_modules misses new libraries).
$lockHash = (Get-FileHash "package-lock.json" -Algorithm SHA256).Hash
$stamp = "node_modules\.lock-hash"
if (-not (Test-Path "node_modules") -or -not (Test-Path $stamp) -or ((Get-Content $stamp -Raw).Trim() -ne $lockHash)) {
    Write-Host "Installing packages (dependencies changed)..." -ForegroundColor Cyan
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    Set-Content -Path $stamp -Value $lockHash -Encoding ascii
}

npx expo prebuild --platform android --clean --no-install
# forward slashes: backslashes are escapes in .properties files
Set-Content -Path "android\local.properties" -Value ("sdk.dir=" + ($env:ANDROID_HOME -replace "\\", "/")) -Encoding ascii

# Give Gradle enough memory (the default 512 MB metaspace made the build hang) and skip release lint, which only reports.
Add-Content -Path "android\gradle.properties" -Value "`norg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8"
Push-Location android
.\gradlew.bat --stop | Out-Null
.\gradlew.bat assembleRelease -x lintVitalRelease -x lintVitalAnalyzeRelease -x lintVitalReportRelease --console=plain
$code = $LASTEXITCODE
Pop-Location
if ($code -ne 0) { throw "Gradle build failed (exit $code)" }

$version = (Get-Content app.json -Raw | ConvertFrom-Json).expo.version
$dist = Join-Path $mobile "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$out = Join-Path $dist "Aangan-$version.apk"
Copy-Item "android\app\build\outputs\apk\release\app-release.apk" $out -Force
Write-Host "`nDone: $out  ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)" -ForegroundColor Green
