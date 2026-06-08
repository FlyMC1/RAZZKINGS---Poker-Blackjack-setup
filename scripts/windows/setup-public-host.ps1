param(
    [switch]$Auto
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptRoot
$launcherCmd = Join-Path $repoRoot 'start-public-host.cmd'

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-Step {
    param([string]$Message)
    Write-Host ''
    Write-Host "[setup] $Message" -ForegroundColor Cyan
}

function Pause-Step {
    Read-Host 'Press Enter to continue'
}

function Confirm-Continue {
    param([string]$Question)
    $answer = Read-Host "$Question (Y/N)"
    return $answer -match '^(y|yes)$'
}

function Confirm-Required {
    param([string]$Question)

    if ($Auto) {
        Write-Host "[setup] $Question Yes" -ForegroundColor Cyan
        return $true
    }

    while ($true) {
        $answer = Read-Host "$Question (Y/N)"
        if ($answer -match '^(y|yes)$') {
            return $true
        }

        if ($answer -match '^(n|no)$') {
            return $false
        }

        Write-Host '[setup] Please enter Y or N.' -ForegroundColor Yellow
    }
}

function Ensure-Winget {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        return
    }

    throw 'winget was not found. Install App Installer from Microsoft Store, then re-run setup.'
}

function Ensure-Command {
    param(
        [string]$CommandName,
        [string]$WingetId,
        [string]$InstallDisplayName
    )

    if (Get-Command $CommandName -ErrorAction SilentlyContinue) {
        Write-Host "[setup] $InstallDisplayName already installed."
        return
    }

    Write-Step "$InstallDisplayName is missing."
    if (-not (Confirm-Required "Install $InstallDisplayName now using winget?")) {
        throw "$InstallDisplayName is required. Setup cancelled by user."
    }

    Write-Host "[setup] Installing $InstallDisplayName. This can take a few minutes..." -ForegroundColor Cyan
    winget install --id $WingetId --exact --accept-package-agreements --accept-source-agreements

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')
    }

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "$InstallDisplayName install completed but command '$CommandName' is still unavailable. Restart terminal and run setup again."
    }
}

function Ensure-NpmInstall {
    Push-Location $repoRoot
    try {
        Write-Step 'Installing project dependencies (npm install).'
        npm install
    }
    finally {
        Pop-Location
    }
}

function Create-DesktopShortcut {
    if (-not (Test-Path $launcherCmd)) {
        throw "Launcher not found: $launcherCmd"
    }

    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktopPath 'RAZZKINGS Public Host.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $launcherCmd
    $shortcut.WorkingDirectory = $repoRoot
    $shortcut.IconLocation = 'shell32.dll,220'
    $shortcut.Description = 'Launch RAZZKINGS public host (outside-network join enabled)'
    $shortcut.Save()

    Write-Host "[setup] Desktop shortcut created: $shortcutPath"
}

Write-Host '====================================================='
Write-Host ' RAZZKINGS Windows Public Host Setup'
Write-Host '====================================================='
Write-Host 'This setup will install prerequisites, configure project dependencies,'
Write-Host 'and create a Desktop shortcut for one-click public hosting.'
Write-Host ''
if ($Auto) {
    Write-Host '[setup] Auto mode is enabled. Setup will install/check required pieces now.' -ForegroundColor Yellow
}
else {
    Write-Host '[setup] Keep this window open and respond to prompts as they appear.' -ForegroundColor Yellow
}
if (-not (Test-IsAdmin)) {
    Write-Host '[setup] Tip: if package installs fail, re-run this setup as Administrator.' -ForegroundColor Yellow
}

if (-not (Confirm-Required 'Start setup now?')) {
    throw 'Setup cancelled by user.'
}

Write-Step 'Checking winget availability.'
Ensure-Winget

Write-Step 'Checking Node.js installation.'
Ensure-Command -CommandName 'node' -WingetId 'OpenJS.NodeJS.LTS' -InstallDisplayName 'Node.js LTS'

Write-Step 'Checking cloudflared installation.'
Ensure-Command -CommandName 'cloudflared' -WingetId 'Cloudflare.cloudflared' -InstallDisplayName 'cloudflared'

if (Confirm-Required 'Run npm install now?') {
    Ensure-NpmInstall
}
else {
    throw 'npm install is required for the app to run. Setup cancelled by user.'
}

Write-Step 'Creating Desktop shortcut.'
Create-DesktopShortcut

Write-Host ''
Write-Host '[setup] Setup complete.' -ForegroundColor Green
Write-Host '[setup] Use the Desktop shortcut "RAZZKINGS Public Host" to launch hosting sessions.'
Write-Host '[setup] Keep the launcher terminal open while players are connected.'
Write-Host ''
Read-Host 'Press Enter to close this setup window'