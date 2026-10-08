# Unpacks a release zip next to the live folder and swaps it in; the previous release stays as <Name>.prev.
# Usage (over ssh): C:\srv\bin\swap.ps1 -Project naryad -Name web -Zip C:\srv\naryad\incoming\web.zip
#                   C:\srv\bin\swap.ps1 -Project naryad -Name web -Rollback
param(
  [Parameter(Mandatory)][string]$Project,
  [Parameter(Mandatory)][string]$Name,
  [string]$Zip,
  [switch]$Rollback
)
$ErrorActionPreference = 'Stop'
$base = "C:\srv\$Project"
$cur = Join-Path $base $Name
$prev = Join-Path $base "$Name.prev"

function Move-WithRetry($from, $toName) {
  for ($i = 0; $i -lt 10; $i++) {
    try { Rename-Item -LiteralPath $from -NewName $toName; return } catch { Start-Sleep -Milliseconds 300 }
  }
  throw "Could not rename $from to $toName"
}

if ($Rollback) {
  if (-not (Test-Path $prev)) { throw "No previous release for $Project/$Name" }
  $tmp = "$Name.failed-$(Get-Date -Format yyyyMMddHHmmss)"
  if (Test-Path $cur) { Move-WithRetry $cur $tmp }
  Move-WithRetry $prev $Name
  Write-Output "rolled back $Project/$Name (bad release kept as $tmp)"
  exit 0
}

if (-not $Zip -or -not (Test-Path $Zip)) { throw "Zip not found: $Zip" }
$new = Join-Path $base ("$Name-new-" + (Get-Date -Format 'yyyyMMddHHmmss'))
Expand-Archive -LiteralPath $Zip -DestinationPath $new -Force
if (Test-Path $prev) { Remove-Item -Recurse -Force -LiteralPath $prev }
if (Test-Path $cur) { Move-WithRetry $cur "$Name.prev" }
Move-WithRetry $new $Name
Remove-Item -Force -LiteralPath $Zip
Write-Output "deployed $Project/$Name"
