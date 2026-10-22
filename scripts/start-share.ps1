param([string]$CloudflaredPath = "cloudflared", [switch]$UseExistingTunnel, [string]$PublicOrigin)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
New-Item -ItemType Directory -Force -Path '.cache' | Out-Null
$shareLog = Join-Path (Get-Location) '.cache/cloudflared.stderr.log'
if (-not $UseExistingTunnel -and -not $PublicOrigin) {
  $cloudCommand = (Get-Command $CloudflaredPath -ErrorAction Stop).Source
  $helper = Start-Process -FilePath $cloudCommand -ArgumentList @('tunnel','--url','http://127.0.0.1:3000','--protocol','http2','--edge-ip-version','4','--no-autoupdate') -WindowStyle Hidden -RedirectStandardOutput (Join-Path (Get-Location) '.cache/cloudflared.stdout.log') -RedirectStandardError $shareLog -PassThru
  $helper.Id | Set-Content '.cache/cloudflared.pid'
}
$shareOrigin = $PublicOrigin
for ($attempt = 0; -not $shareOrigin -and $attempt -lt 45; $attempt++) {
  if (Test-Path -LiteralPath $shareLog) {
    $shareOutput = Get-Content -LiteralPath $shareLog -Raw
    $shareMatch = [regex]::Match($shareOutput,'https://[a-z0-9-]+[.]trycloudflare[.]com')
    if ($shareMatch.Success -and $shareOutput.Contains('Registered tunnel connection')) { $shareOrigin = $shareMatch.Value; break }
  }
  Start-Sleep -Seconds 1
}
if (-not $shareOrigin) { throw 'Tunnel did not connect. No Docker or app configuration was changed. Check .cache/cloudflared.stderr.log.' }
$parsedOrigin = [uri]$shareOrigin
if ($parsedOrigin.Scheme -ne 'https' -or $parsedOrigin.AbsolutePath -ne '/' -or $parsedOrigin.UserInfo) { throw 'PublicOrigin must be an HTTPS origin without a path or credentials.' }
try {
  $addresses = [System.Net.Dns]::GetHostAddresses($parsedOrigin.DnsSafeHost)
  if (-not $addresses.Count) { throw 'DNS returned no addresses' }
  $health = Invoke-RestMethod -Uri "$shareOrigin/api/health" -TimeoutSec 12
  if (-not $health.ok -or $health.mode -ne 'tide') { throw 'The public URL does not reach the real Tide app.' }
} catch { throw 'The HTTPS URL is not reachable through DNS/HTTP. No app or Docker configuration was changed. Keep using localhost and retry after changing networks.' }
if (-not (Test-Path -LiteralPath '.env.tide.local')) { throw 'Configure the Docker admin credentials in .env.tide.local first.' }
if (-not (Test-Path -LiteralPath 'data/tidecloak.json')) { throw 'The local public adapter is missing; bootstrap the existing realm first.' }
if ((Test-Path -LiteralPath '.env') -and -not (Test-Path -LiteralPath '.env.before-share.local')) { Copy-Item -LiteralPath '.env' -Destination '.env.before-share.local' }
if (-not (Test-Path -LiteralPath 'data/tidecloak-local.json')) { Copy-Item -LiteralPath 'data/tidecloak.json' -Destination 'data/tidecloak-local.json' }
$activeAdapter = Get-Content -LiteralPath 'data/tidecloak.json' -Raw | ConvertFrom-Json
$activeAdapter.'auth-server-url' = $shareOrigin
$activeAdapter | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath 'data/tidecloak.json' -Encoding utf8
Set-Content -LiteralPath '.env.share.local' -Value "TIDE_PUBLIC_ORIGIN=$shareOrigin" -Encoding utf8
$runtime = @{}
if (Test-Path -LiteralPath '.env') { foreach ($line in Get-Content -LiteralPath '.env') { if ($line -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { $runtime[$Matches[1]]=$Matches[2] } } }
$runtime['PORT']='3000'; $runtime['HOST']='127.0.0.1'; $runtime['APP_ORIGIN']=$shareOrigin
$runtime['APP_ADDITIONAL_ORIGINS']='http://localhost:3000'; $runtime['TIDECLOAK_PROXY']='true'
$runtime['TIDECLOAK_UPSTREAM']='http://127.0.0.1:8080'; $runtime['TIDECLOAK_CONFIG_PATH']='./data/tidecloak.json'
$runtime['CREATORROOM_DATA_PATH']='./data/creatorroom-tide.json'
$runtime.GetEnumerator() | Sort-Object Name | ForEach-Object { "$($_.Key)=$($_.Value)" } | Set-Content -LiteralPath '.env' -Encoding utf8
$dockerBin = Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin'
if (Test-Path -LiteralPath $dockerBin) { $env:Path="$dockerBin;$env:Path" }
docker compose --env-file .env.tide.local --env-file .env.share.local -f docker-compose.tide.yml -f docker-compose.share.yml up -d
if ($LASTEXITCODE -ne 0) { throw 'Docker shared-mode setup failed; review before starting the app.' }
Write-Output "Shared URL: $shareOrigin"
Write-Output 'Build and start one CreatorRoom process: npm run build, then npm start.'
Write-Output 'Host approver: open http://localhost:3000/#/approvals and Enable shared sign-in in Tide.'
Write-Output 'Public /admin and master-realm routes are blocked. Tide admin APIs remain on loopback.'
