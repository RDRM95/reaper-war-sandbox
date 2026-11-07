$ErrorActionPreference = 'Stop'

# Install/update in a dedicated local folder. The extracted ZIP, developer
# branches and existing game folders are never deleted or overwritten.
$source = Join-Path $env:LOCALAPPDATA 'ReaperWarSandbox\source'
$repo = 'https://github.com/RDRM95/reaper-war-sandbox.git'

function Require-Tool([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "$name was not found. Install Git for Windows and Node.js LTS, then try again."
  }
}

Require-Tool 'git.exe'
Require-Tool 'node.exe'
Require-Tool 'npm.cmd'

$env:GIT_TERMINAL_PROMPT = '0'
Write-Host "Local game folder: $source"
if (-not (Test-Path -LiteralPath (Join-Path $source '.git'))) {
  if (Test-Path -LiteralPath $source) {
    throw 'The game destination already exists and is not a Git checkout. Nothing was overwritten.'
  }
  $parent = Split-Path -Parent $source
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  Write-Host 'Installing the latest standalone source...'
  & git.exe clone --depth 1 --branch main $repo $source
  if ($LASTEXITCODE -ne 0) { throw 'Initial download failed. Internet is required for the first install.' }
} else {
  Set-Location -LiteralPath $source
  $dirty = & git.exe status --porcelain --untracked-files=no
  if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect the local source safely.' }
  if ($dirty) {
    Write-Warning 'Local source contains changes. Skipping update to preserve them.'
  } else {
    Write-Host 'Checking for game updates (existing copy remains usable offline)...'
    & git.exe pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'Update unavailable. Keeping the existing local version.'
    }
  }
}

Set-Location -LiteralPath $source
$package = Join-Path $source 'package.json'
if (-not (Test-Path -LiteralPath $package)) { throw 'Incomplete game install: package.json is missing.' }
$stamp = Join-Path $source '.local-dependencies.sha256'
$hash = (Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash
$installedHash = if (Test-Path -LiteralPath $stamp) {
  (Get-Content -LiteralPath $stamp -Raw).Trim()
} else { '' }
if ($hash -ne $installedHash -or -not (Test-Path -LiteralPath (Join-Path $source 'node_modules\vite\package.json'))) {
  Write-Host 'Installing required local engine packages...'
  & npm.cmd install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Reconnect to the internet and retry.' }
  Set-Content -LiteralPath $stamp -Value $hash -Encoding Ascii
}

Write-Host 'Building the optimized production edition...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Production build failed. No source files were changed by this launcher.' }

Write-Host ''
Write-Host 'Starting REAPER WAR on localhost:5173'
Write-Host 'Hardware-accelerated WebGL runs on the PC GPU when enabled in the browser.'
Write-Host 'No cloud server is used to simulate or render the battle.'
Write-Host 'Keep this window open during play. Press Ctrl+C to stop.'
Write-Host ''
# Preserve the existing localhost:5173 browser storage origin for game data.
# The production preview avoids Vite's source-transform/HMR development overhead.
& npm.cmd run preview -- --host localhost --port 5173 --strictPort --open
if ($LASTEXITCODE -ne 0) { throw 'Local game server could not start. Close any other server on port 5173.' }
