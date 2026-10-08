# Rota VM bootstrap. Run ONCE on the VM (RDP → PowerShell "Run as administrator" → paste → Enter).
# Installs OpenSSH Server with key-only login for Administrator, opens ports 22/80/443, creates C:\srv.
# The deploy agent replaces __PUBKEY__ with the contents of ~/.ssh/rota_vm_ed25519.pub before you paste it.

$ErrorActionPreference = 'Stop'
$PubKey = '__PUBKEY__'
if ($PubKey -like '__*') { throw 'Public key placeholder was not replaced' }

# 1. OpenSSH Server, started automatically, PowerShell as the default shell
if (-not (Get-WindowsCapability -Online -Name 'OpenSSH.Server*' | Where-Object State -eq 'Installed')) {
  Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null
}
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell `
  -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null

# 2. Key login for the Administrators group (Windows reads this file, not ~/.ssh, for admins)
$ak = 'C:\ProgramData\ssh\administrators_authorized_keys'
if (-not (Test-Path $ak) -or -not (Select-String -Path $ak -SimpleMatch $PubKey -Quiet)) { Add-Content -Path $ak -Value $PubKey }
icacls.exe $ak /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F' | Out-Null

# 3. Key-only SSH (password login off)
$cfg = 'C:\ProgramData\ssh\sshd_config'
(Get-Content $cfg) -replace '^#?\s*PasswordAuthentication\s+.*$', 'PasswordAuthentication no' | Set-Content $cfg
if (-not (Select-String -Path $cfg -Pattern '^PasswordAuthentication no' -Quiet)) { Add-Content $cfg 'PasswordAuthentication no' }
Restart-Service sshd

# 4. Firewall
foreach ($p in @(@{n='rota-ssh';p=22}, @{n='rota-http';p=80}, @{n='rota-https';p=443})) {
  if (-not (Get-NetFirewallRule -Name $p.n -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name $p.n -DisplayName $p.n -Protocol TCP -LocalPort $p.p -Direction Inbound -Action Allow | Out-Null
  }
}

# 5. Folders (one folder per project under C:\srv)
New-Item -ItemType Directory -Force -Path `
  'C:\srv\bin', 'C:\srv\caddy\routes', 'C:\srv\caddy\data', 'C:\srv\caddy\logs', `
  'C:\srv\naryad\incoming', 'C:\srv\naryad\web', 'C:\srv\naryad\app', 'C:\srv\naryad\downloads' | Out-Null

Write-Host ''
Write-Host 'OK: sshd is running (key only), ports 22/80/443 are open, C:\srv is ready.' -ForegroundColor Green
Write-Host 'Now change the Administrator password (it was shared in chat): net user Administrator *' -ForegroundColor Yellow
