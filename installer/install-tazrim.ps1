# Tazrim installer for Windows (run by "Install Tazrim.bat").
# Release builds have the version below filled in at release time (release.yml).
#
# Messages are English: the Windows console does not lay out Hebrew right-to-left, so Hebrew would read backwards.
#
# Testing overrides (environment variables):
#   TAZRIM_INSTALL_DIR       install folder (default ~\tazrim)
#   TAZRIM_COMPOSE_FILE      a local docker-compose.yml to copy instead of downloading
#   TAZRIM_INSTALL_ENV_EXTRA extra lines appended to a new .env (COMPOSE_PROJECT_NAME, ports, TAZRIM_VERSION)
#   TAZRIM_PORT              the port the computer opens (default 3000)
#   TAZRIM_NO_OPEN=1         do not open the browser
#
# Talks only to GitHub (the compose file) and, through Docker, Docker's registry.

$ErrorActionPreference = 'Continue'   # native commands write progress to stderr; failures are checked by exit code
$Version   = '@@TAZRIM_VERSION@@'
$Repo      = 'JordanYefet/Tazrim'
$HelpUrl   = "https://github.com/$Repo#%D7%94%D7%AA%D7%A7%D7%A0%D7%94-%D7%95%D7%94%D7%A4%D7%A2%D7%9C%D7%94"
$IssuesUrl = "https://github.com/$Repo/issues"
$DockerUrl = 'https://www.docker.com/products/docker-desktop/'

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
# Older PowerShell defaults to TLS 1.0/1.1, which GitHub refuses
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

$InstallDir = if ($env:TAZRIM_INSTALL_DIR) { $env:TAZRIM_INSTALL_DIR } else { Join-Path $HOME 'tazrim' }
$Port       = if ($env:TAZRIM_PORT) { $env:TAZRIM_PORT } else { '3000' }

function Finish([int]$code) {
    Write-Host ''
    Read-Host 'Press Enter to close this window' | Out-Null
    exit $code
}

function Fail([string]$what) {
    Write-Host ''
    Write-Host "X $what" -ForegroundColor Red
    Write-Host ''
    Write-Host "Help (Hebrew guide): $HelpUrl"
    Write-Host "Or open an issue:    $IssuesUrl"
    Finish 1
}

function Open-Url([string]$url) {
    if ($env:TAZRIM_NO_OPEN -ne '1') { try { Start-Process $url } catch {} }
}

# The value of KEY in env-style text (last one wins), else the default
function Env-Value([string]$key, [string]$text, [string]$default) {
    $found = $default
    foreach ($line in ($text -split "`r?`n")) {
        if ($line -match "^$key=(.*)$") {
            $v = $Matches[1].Trim().Trim('"')
            if ($v) { $found = $v }
        }
    }
    return $found
}

function Port-Busy([string]$p) {
    $n = [int]$p
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $n -ErrorAction SilentlyContinue)
}

function Docker-Ready {
    & docker info *> $null
    return ($LASTEXITCODE -eq 0)
}

function Wait-Healthy([string]$p) {
    Write-Host 'Waiting for Tazrim to start (up to two minutes)...'
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 -Uri "http://localhost:$p/api/health"
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 2
    }
    return $false
}

function Compose-Up([string]$dir) {
    Push-Location $dir
    try { & docker compose up -d; return ($LASTEXITCODE -eq 0) } finally { Pop-Location }
}

try {
    Write-Host ''
    Write-Host 'Tazrim: install'
    Write-Host ''

    # ---- 1. Docker ----
    $dockerExe = Get-Command docker -ErrorAction SilentlyContinue
    $dockerApp = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not $dockerExe -and -not (Test-Path $dockerApp)) {
        Write-Host 'Docker Desktop is not installed. Opening its download page.'
        Open-Url $DockerUrl
        Fail 'Install Docker Desktop (free, no account needed), open it, then double-click this installer again.'
    }
    if (-not $dockerExe) {
        # Installed, but not on PATH yet (before the first restart)
        $env:Path += ';' + (Join-Path $env:ProgramFiles 'Docker\Docker\resources\bin')
    }

    if (-not (Docker-Ready)) {
        Write-Host 'Docker is not running. Starting it...'
        if (Test-Path $dockerApp) { Start-Process $dockerApp }
        $ready = $false
        for ($i = 0; $i -lt 90; $i++) {
            if (Docker-Ready) { $ready = $true; break }
            Start-Sleep -Seconds 2
        }
        if (-not $ready) {
            Fail 'Docker did not start within three minutes. Open Docker Desktop yourself, wait for "Engine running", then double-click this installer again.'
        }
    }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { Fail 'Docker has no Compose plugin. Update Docker Desktop to the latest version.' }
    Write-Host 'OK Docker is running.'

    # ---- An install that is already there: start it, change nothing ----
    if (Test-Path $InstallDir) {
        if (-not (Test-Path (Join-Path $InstallDir 'docker-compose.yml'))) {
            Fail "The folder $InstallDir already exists but is not a Tazrim install, so it is left alone. Move it away and try again."
        }
        Write-Host "Found an existing install in $InstallDir. Nothing in it is changed and your data is not touched; it is only started."
        $existingEnv = ''
        $envPath = Join-Path $InstallDir '.env'
        if (Test-Path $envPath) { $existingEnv = Get-Content -Raw $envPath }
        $Port = Env-Value 'TAZRIM_PORT' $existingEnv $Port
        if (-not (Compose-Up $InstallDir)) { Fail "Starting failed. Docker's message is above." }
        if (-not (Wait-Healthy $Port)) {
            Fail "Tazrim did not answer within two minutes. To see why, open PowerShell and run: cd `"$InstallDir`"; docker compose logs"
        }
        Write-Host 'OK Tazrim is running. Opening the browser.'
        Open-Url "http://localhost:$Port"
        Write-Host "Address: http://localhost:$Port"
        Finish 0
    }

    # ---- 2. This computer's home-network address ----
    $lanIp = ''
    try {
        $cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
        if ($cfg -and $cfg.IPv4Address) { $lanIp = $cfg.IPv4Address[0].IPAddress }
    } catch {}

    # ---- 3. The .env text first, so the ports it names are the ones checked ----
    $envLines = @(
        '# Tazrim settings. Changing a value here needs: docker compose up -d',
        "# Optional helpers that run with the app. 'updater' lets the app update itself (Settings -> Updates).",
        'COMPOSE_PROFILES=updater'
    )
    if ($lanIp) {
        $envLines += "# This computer's address on your home network. Phones and tablets open http://${lanIp}:3001"
        $envLines += "TAZRIM_LAN_IP=$lanIp"
    } else {
        $envLines += "# This computer's address on your home network (not found automatically). Phones open http://<it>:3001"
        $envLines += '# TAZRIM_LAN_IP=192.168.1.10'
    }
    if ($env:TAZRIM_INSTALL_ENV_EXTRA) { $envLines += '# Extra'; $envLines += $env:TAZRIM_INSTALL_ENV_EXTRA }
    $envText   = ($envLines -join "`n") + "`n"
    $Port      = Env-Value 'TAZRIM_PORT' $envText $Port
    $PhonePort = Env-Value 'TAZRIM_PHONE_PORT' $envText '3001'

    foreach ($p in @($Port, $PhonePort)) {
        if (Port-Busy $p) {
            Fail "Port $p is in use by another program on this computer, so Tazrim cannot start on it. Close that program and try again. (To see which: Get-NetTCPConnection -State Listen -LocalPort $p)"
        }
    }

    # ---- 4. The compose file ----
    $compose = $null
    if ($env:TAZRIM_COMPOSE_FILE) {
        if (-not (Test-Path $env:TAZRIM_COMPOSE_FILE)) { Fail "The compose file $($env:TAZRIM_COMPOSE_FILE) was not found." }
        $compose = [System.IO.File]::ReadAllText((Resolve-Path $env:TAZRIM_COMPOSE_FILE))
    } else {
        $ver = $Version
        if ($ver.StartsWith('@@')) {
            # Not a release build (running from the repo): use the newest release
            try {
                $rel = Invoke-RestMethod -UseBasicParsing -TimeoutSec 20 -Uri "https://api.github.com/repos/$Repo/releases/latest"
                $ver = [string]$rel.tag_name
            } catch { $ver = '' }
        }
        if (-not $ver) { Fail 'Could not reach GitHub. Check your internet connection and try again.' }
        $ver = $ver.TrimStart('v')
        Write-Host "Downloading the settings file for version $ver..."
        try {
            $compose = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 60 -Uri "https://raw.githubusercontent.com/$Repo/v$ver/docker-compose.yml").Content
        } catch {
            Fail 'The download failed. Check your internet connection and try again.'
        }
        if ($compose -is [byte[]]) { $compose = [System.Text.Encoding]::UTF8.GetString($compose) }
        if ($compose -notmatch '(?m)^services:') { Fail 'The downloaded file does not look right. Try again later.' }
    }

    # ---- 5. Create the folder, write the files (UTF-8 without BOM, LF) ----
    try { New-Item -ItemType Directory -Force -ErrorAction Stop -Path $InstallDir | Out-Null } catch { Fail "Could not create the folder $InstallDir." }
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $InstallDir 'docker-compose.yml'), $compose, $utf8)
    [System.IO.File]::WriteAllText((Join-Path $InstallDir '.env'), $envText, $utf8)
    Write-Host "OK Created the folder $InstallDir"

    # ---- 6. Start ----
    Write-Host 'Starting Tazrim. The first time Docker downloads the app, which can take a few minutes...'
    if (-not (Compose-Up $InstallDir)) {
        Fail "Starting failed. Docker's message is above; if it mentions a connection or a download, check your internet. The install stays in $InstallDir, and you can double-click the installer again."
    }
    if (-not (Wait-Healthy $Port)) {
        Fail "Tazrim did not answer within two minutes. To see why, open PowerShell and run: cd `"$InstallDir`"; docker compose logs"
    }

    # ---- 7. Open ----
    Write-Host ''
    Write-Host 'OK Tazrim is running! Opening the browser for first-time setup.'
    Open-Url "http://localhost:$Port/setup"
    Write-Host "If the browser did not open: http://localhost:$Port/setup"
    if ($lanIp) { Write-Host "From a phone on the same Wi-Fi: http://${lanIp}:$PhonePort" }
    Finish 0
} catch {
    Fail "Something unexpected went wrong: $($_.Exception.Message)"
}
