Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptRoot
$launcherCmd = Join-Path $repoRoot 'start-public-host.cmd'

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
    if (-not (Confirm-Continue "Install $InstallDisplayName now using winget?")) {
        throw "$InstallDisplayName is required. Setup cancelled by user."
    }

    winget install --id $WingetId --exact --accept-package-agreements --accept-source-agreements --silent

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

Pause-Step

Write-Step 'Checking winget availability.'
Ensure-Winget

Write-Step 'Checking Node.js installation.'
Ensure-Command -CommandName 'node' -WingetId 'OpenJS.NodeJS.LTS' -InstallDisplayName 'Node.js LTS'

Write-Step 'Checking cloudflared installation.'
Ensure-Command -CommandName 'cloudflared' -WingetId 'Cloudflare.cloudflared' -InstallDisplayName 'cloudflared'

if (Confirm-Continue 'Run npm install now?') {
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
Pause-Step