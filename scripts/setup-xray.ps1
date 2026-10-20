# setup-xray.ps1: Automates fetching Xray-core binary and geo assets on Windows
param (
    [string]$TargetDir = "$PSScriptRoot\..\resources\bin"
)

$ErrorActionPreference = "Stop"

Write-Host "Setting up Xray-core binary assets in: $TargetDir" -ForegroundColor Cyan

if (-not (Test-Path $TargetDir)) {
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$ZipUrl = "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-windows-64.zip"
$ZipPath = Join-Path $env:TEMP "Xray-windows-64.zip"
$ExtractTemp = Join-Path $env:TEMP "xray-extracted"

Write-Host "Downloading latest Xray-windows-64 release from GitHub..." -ForegroundColor Yellow
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13
Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing

Write-Host "Extracting assets..." -ForegroundColor Yellow
if (Test-Path $ExtractTemp) { Remove-Item -Path $ExtractTemp -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath $ExtractTemp -Force

Copy-Item -Path (Join-Path $ExtractTemp "xray.exe") -Destination (Join-Path $TargetDir "xray.exe") -Force
Copy-Item -Path (Join-Path $ExtractTemp "geoip.dat") -Destination (Join-Path $TargetDir "geoip.dat") -Force
Copy-Item -Path (Join-Path $ExtractTemp "geosite.dat") -Destination (Join-Path $TargetDir "geosite.dat") -Force

# Also deploy to AppData\Roaming\v2raydp-desktop\ if needed
$AppDataDir = "$env:APPDATA\v2raydp-desktop\bin"
if (-not (Test-Path $AppDataDir)) {
    New-Item -ItemType Directory -Path $AppDataDir -Force | Out-Null
}
Copy-Item -Path (Join-Path $TargetDir "xray.exe") -Destination (Join-Path $AppDataDir "xray.exe") -Force
Copy-Item -Path (Join-Path $TargetDir "geoip.dat") -Destination (Join-Path $AppDataDir "geoip.dat") -Force
Copy-Item -Path (Join-Path $TargetDir "geosite.dat") -Destination (Join-Path $AppDataDir "geosite.dat") -Force

Remove-Item -Path $ZipPath -Force -ErrorAction SilentlyContinue
Remove-Item -Path $ExtractTemp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "✓ Xray assets successfully deployed to:" -ForegroundColor Green
Write-Host "  1. $TargetDir"
Write-Host "  2. $AppDataDir"
