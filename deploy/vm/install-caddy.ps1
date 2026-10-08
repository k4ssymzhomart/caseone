# One-time on the VM (over ssh): installs the latest Caddy v2 for Windows and runs it as an auto-start service.
# Expects C:\srv\caddy\Caddyfile and C:\srv\caddy\routes\*.caddy to be in place (deploy.sh init copies them).
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$rel = Invoke-RestMethod -UseBasicParsing -Uri 'https://api.github.com/repos/caddyserver/caddy/releases/latest' -Headers @{ 'User-Agent' = 'rota-deploy' }
$asset = $rel.assets | Where-Object { $_.name -match '_windows_amd64\.zip$' } | Select-Object -First 1
if (-not $asset) { throw 'No windows_amd64 zip in the latest Caddy release' }

if (Get-Service caddy -ErrorAction SilentlyContinue) { sc.exe stop caddy | Out-Null; Start-Sleep -Seconds 2 }
$zip = 'C:\srv\caddy\caddy.zip'
Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath 'C:\srv\caddy' -Force
Remove-Item -Force $zip
& 'C:\srv\caddy\caddy.exe' version

& 'C:\srv\caddy\caddy.exe' validate --config 'C:\srv\caddy\Caddyfile'
if ($LASTEXITCODE -ne 0) { throw 'Caddyfile is invalid' }

$busy = Get-NetTCPConnection -State Listen -LocalPort 80, 443 -ErrorAction SilentlyContinue |
  Where-Object { (Get-Process -Id $_.OwningProcess).ProcessName -ne 'caddy' }
if ($busy) { $busy | Format-Table LocalPort, OwningProcess; throw 'Ports 80/443 are taken by another process (IIS?). Stop it first.' }

if (-not (Get-Service caddy -ErrorAction SilentlyContinue)) {
  sc.exe create caddy start= auto binPath= 'C:\srv\caddy\caddy.exe run --config C:\srv\caddy\Caddyfile' | Out-Null
  sc.exe failure caddy reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null
}
sc.exe start caddy | Out-Null
Start-Sleep -Seconds 5
Get-Service caddy | Format-Table Name, Status, StartType
