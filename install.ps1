#Requires -Version 5.1
<#
Epoch (ZCode workbench) - Windows installer.

What it does:
  1. Checks the GitHub release for Windows binaries
     (Epoch-<version>-win-<arch>.exe / .msi, or zcode-windows-<arch>.exe).
     When they exist: download + SHA256-verify + launch the installer.
  2. Otherwise (today): bootstraps the app from source -
     Git + Node.js 24 + pnpm 10.33.2, clone the repository,
     install dependencies - then prints the launch commands.

One-liner (PowerShell):
  irm https://raw.githubusercontent.com/payswapdotorg/Epoch-2.0/main/install.ps1 | iex

From a clone / saved copy:
  powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 [options]
  (or double-click install.cmd)

Options:
  -Destination <dir>   Clone/install directory (default: %USERPROFILE%\Epoch-2.0)
  -Version <x.y.z>     Release version (default: latest)
  -Run                 Launch the desktop app after installation
  -SkipInstall         Skip 'pnpm install' (dependencies already present)
  -NoVerify            Skip SHA256 verification of downloaded binaries
  -Help                Show this help

Environment:
  GITHUB_TOKEN         Optional GitHub API token (rate-limit relief)
#>
[CmdletBinding()]
param(
    [string]$Destination = '',
    [string]$Version = '',
    [switch]$Run,
    [switch]$SkipInstall,
    [switch]$NoVerify,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Repo        = 'payswapdotorg/Epoch-2.0'
$ApiBase     = "https://api.github.com/repos/$Repo"
$NodeMajor   = 24
$NodeExact   = '24.14.0'
$PnpmVersion = '10.33.2'

function Write-Step([string]$Message) { Write-Host '[epoch-install]' -ForegroundColor Cyan -NoNewline; Write-Host " $Message" }
function Write-Ok([string]$Message)   { Write-Host '[epoch-install]' -ForegroundColor Green -NoNewline; Write-Host " $Message" }
function Write-Note([string]$Message) { Write-Host "[epoch-install] note: $Message" -ForegroundColor Yellow }
function Fail([string]$Message)       { throw "[epoch-install] ERROR: $Message" }

function Test-Command([string]$Name) { [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Refresh-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

function Invoke-Native {
    param([string]$File, [string[]]$ArgumentList)
    if (-not (Test-Command $File)) {
        throw "[epoch-install] ERROR: command not found: $File"
    }
    # EAP=Continue around the call: PS 5.1 turns redirected native stderr into
    # terminating errors when ErrorActionPreference is Stop; stringify instead.
    $previousEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $File @ArgumentList 2>&1 | ForEach-Object { "$_" }
        if ($LASTEXITCODE -ne 0) {
            throw "[epoch-install] ERROR: $File $($ArgumentList -join ' ') failed with exit code $LASTEXITCODE"
        }
    } finally {
        $ErrorActionPreference = $previousEap
    }
}

if ($Help) {
    Write-Host @'
Usage:
  powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 [options]

Options:
  -Destination <dir>   Clone/install directory (default: %USERPROFILE%\Epoch-2.0)
  -Version <x.y.z>     Release version (default: latest)
  -Run                 Launch the desktop app after installation
  -SkipInstall         Skip 'pnpm install' (dependencies already present)
  -NoVerify            Skip SHA256 verification of downloaded binaries
  -Help                Show this help

One-liner:
  irm https://raw.githubusercontent.com/payswapdotorg/Epoch-2.0/main/install.ps1 | iex
'@
    return
}

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
    # PowerShell 7 negotiates TLS 1.2 by default.
}

$apiHeaders = @{ 'User-Agent' = 'epoch-installer' }
if ($env:GITHUB_TOKEN) { $apiHeaders['Authorization'] = "token $($env:GITHUB_TOKEN)" }

$tag = ''
if ($Version) {
    $tag = 'epoch-v' + ($Version -replace '^(epoch-v|v)', '')
}

$release = $null
try {
    if ($tag) {
        $release = Invoke-RestMethod -Uri "$ApiBase/releases/tags/$tag" -Headers $apiHeaders
    } else {
        $release = Invoke-RestMethod -Uri "$ApiBase/releases/latest" -Headers $apiHeaders
        $tag = $release.tag_name
    }
} catch {
    Write-Note "cannot query the GitHub API ($($_.Exception.Message)); continuing with the source bootstrap"
}

if (-not $tag) { $tag = 'latest' }
$relVersion = $tag -replace '^(epoch-v|v)', ''

# --------------------------------------------------------- binary path ------

$winAsset = $null
if ($release) {
    $winAsset = @($release.assets) | Where-Object {
        ($_.name -match '-win-(x64|arm64)\.(exe|msi)$') -or ($_.name -match '^zcode-windows-(x64|arm64)\.exe$')
    } | Select-Object -First 1
}

if ($winAsset) {
    Write-Step "found a Windows binary in release ${tag}: $($winAsset.name)"
    $tmpFile = Join-Path $env:TEMP $winAsset.name
    Invoke-WebRequest -Uri $winAsset.browser_download_url -OutFile $tmpFile
    if (-not $NoVerify) {
        $sumsAsset = @($release.assets) | Where-Object { $_.name -eq 'SHA256SUMS' } | Select-Object -First 1
        if ($sumsAsset) {
            $sumsFile = Join-Path $env:TEMP 'epoch-install-SHA256SUMS'
            Invoke-WebRequest -Uri $sumsAsset.browser_download_url -OutFile $sumsFile
            $expected = $null
            foreach ($line in (Get-Content $sumsFile)) {
                if ($line -match ('^[0-9a-f]{64}\s+' + [regex]::Escape($winAsset.name) + '\s*$')) {
                    $expected = ($line -replace '^([0-9a-f]{64}).*$', '$1')
                    break
                }
            }
            if ($expected) {
                $actual = (Get-FileHash -Path $tmpFile -Algorithm SHA256).Hash.ToLowerInvariant()
                if ($actual -ne $expected) {
                    Fail "SHA256 mismatch for $($winAsset.name) (expected $expected, got $actual)"
                }
                Write-Step "checksum OK: $($winAsset.name)"
            } else {
                Write-Note "$($winAsset.name) is not listed in SHA256SUMS - skipping verification"
            }
        } else {
            Write-Note 'release has no SHA256SUMS asset - skipping verification'
        }
    }
    Write-Step 'launching the installer (follow its prompts)...'
    Start-Process -FilePath $tmpFile -Wait
    Write-Ok "Epoch ${relVersion} installed."
    return
}

# ------------------------------------------------- source bootstrap path ----

Write-Step "no Windows binary in release ${tag} - bootstrapping Epoch from source"
Write-Step 'the script checks Git, Node.js 24 and pnpm, clones the repo, and installs dependencies'

# --- Git ---
if (-not (Test-Command 'git')) {
    Write-Step 'installing Git...'
    if (Test-Command 'winget') {
        Invoke-Native winget @('install', '--id', 'Git.Git', '-e',
            '--accept-source-agreements', '--accept-package-agreements')
        Refresh-Path
    }
    if (-not (Test-Command 'git')) {
        Fail 'Git is not installed and could not be installed automatically. Install it from https://git-scm.com/download/win, open a NEW terminal, and re-run this script.'
    }
} else {
    Write-Step 'Git found'
}

# --- Node.js ---
$nodeOk = $false
if (Test-Command 'node') {
    $nodeVersion = (Invoke-Native node @('--version') | Select-Object -First 1)
    $nodeVersion = "$nodeVersion".Trim()
    if ($nodeVersion -match '^v(\d+)') {
        if ([int]$Matches[1] -ge $NodeMajor) {
            $nodeOk = $true
            Write-Step "Node.js $nodeVersion found"
        } else {
            Write-Note "Node.js $nodeVersion is older than the required v$NodeMajor - upgrading"
        }
    }
}
if (-not $nodeOk) {
    Write-Step "installing Node.js $NodeExact ..."
    if (Test-Command 'winget') {
        try {
            Invoke-Native winget @('install', '--id', 'OpenJS.NodeJS', '-e', '--version', $NodeExact,
                '--accept-source-agreements', '--accept-package-agreements')
        } catch {
            Write-Note "winget does not carry Node $NodeExact exactly - installing the current release"
            Invoke-Native winget @('install', '--id', 'OpenJS.NodeJS', '-e',
                '--accept-source-agreements', '--accept-package-agreements')
        }
        Refresh-Path
    }
    if (-not (Test-Command 'node')) {
        Write-Step 'downloading the Node.js MSI directly...'
        $msi = Join-Path $env:TEMP "node-v$NodeExact-x64.msi"
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeExact/node-v$NodeExact-x64.msi" -OutFile $msi
        Invoke-Native msiexec @('/i', $msi, '/passive')
        Refresh-Path
    }
    if (-not (Test-Command 'node')) {
        Fail "Node.js could not be installed automatically. Install Node $NodeExact or newer from https://nodejs.org/, open a NEW terminal, and re-run this script."
    }
}

# --- pnpm ---
$pnpmNeeded = $true
if (Test-Command 'pnpm') {
    $pnpmVersionFound = (Invoke-Native pnpm @('--version') | Select-Object -First 1)
    $pnpmVersionFound = "$pnpmVersionFound".Trim()
    if ($pnpmVersionFound -eq $PnpmVersion) {
        $pnpmNeeded = $false
        Write-Step "pnpm $PnpmVersion found"
    } else {
        Write-Note "pnpm $pnpmVersionFound found - switching to the pinned $PnpmVersion"
    }
}
if ($pnpmNeeded) {
    Write-Step "installing pnpm $PnpmVersion ..."
    Invoke-Native npm @('install', '-g', "pnpm@$PnpmVersion")
    Refresh-Path
    if (-not (Test-Command 'pnpm')) {
        Fail "pnpm could not be installed. Run: npm install -g pnpm@$PnpmVersion , then re-run this script."
    }
}

# --- clone ---
if (-not $Destination) { $Destination = Join-Path $HOME 'Epoch-2.0' }
if (Test-Path (Join-Path $Destination '.git')) {
    Write-Step "updating the existing clone: $Destination"
    Invoke-Native git @('-C', $Destination, 'pull', '--ff-only')
} elseif (Test-Path $Destination) {
    Fail "$Destination already exists but is not a git clone. Pass -Destination <dir> to use another location."
} else {
    Write-Step "cloning https://github.com/$Repo.git -> $Destination"
    Invoke-Native git @('clone', "https://github.com/$Repo.git", $Destination)
}

# --- dependencies ---
if (-not $SkipInstall) {
    Write-Step 'installing workspace dependencies (this can take several minutes)...'
    Push-Location $Destination
    try {
        Invoke-Native pnpm @('install', '--frozen-lockfile')
    } catch {
        Write-Note 'pnpm install failed. The usual cause on a fresh Windows machine: missing Visual Studio Build Tools (native modules such as node-pty need the C++ workload).'
        $answer = Read-Host '[epoch-install] install Visual Studio 2022 Build Tools (C++ workload) via winget now? [y/N]'
        if ($answer -match '^[Yy]') {
            Invoke-Native winget @('install', '--id', 'Microsoft.VisualStudio.2022.BuildTools', '-e',
                '--override', '--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended',
                '--accept-source-agreements', '--accept-package-agreements')
            Write-Step 'retrying pnpm install...'
            Invoke-Native pnpm @('install', '--frozen-lockfile')
        } else {
            Fail "dependency installation failed. Install VS Build Tools yourself, then re-run this script (the clone at $Destination is kept; add -SkipInstall to skip the clone step)."
        }
    } finally {
        Pop-Location
    }
}

# --- done ---
Write-Host ''
Write-Ok "Epoch ${relVersion} is ready at: $Destination"
Write-Host ''
Write-Host 'Launch commands (run from the repo directory):'
Write-Host '  desktop app : pnpm dev:desktop'
Write-Host '  web + agent : pnpm dev:web'
Write-Host '  CLI dist    : pnpm build:zcode   (see README - Packaging)'
Write-Host ''
if ($Run) {
    Write-Step 'launching the desktop app...'
    Set-Location $Destination
    Invoke-Native pnpm @('dev:desktop')
}
