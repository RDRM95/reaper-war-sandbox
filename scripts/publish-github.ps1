$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$repo = 'RDRM95/reaper-war-sandbox'
$repoUrl = "https://github.com/$repo"

function Locate-Tool([string]$name, [string[]]$fallback) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($candidate in $fallback) {
    if (Test-Path $candidate) { return $candidate }
  }
  return $null
}

function Ensure-Tool([string]$name, [string]$wingetId, [string[]]$fallback) {
  $tool = Locate-Tool $name $fallback
  if ($tool) { return $tool }
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "'$name' is not installed, and winget is unavailable. Install $wingetId, then rerun."
  }
  Write-Host "Installing $name using Windows Package Manager..."
  & $winget.Source install --id $wingetId --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "Installation of $name failed." }
  $tool = Locate-Tool $name $fallback
  if (-not $tool) { throw "$name was installed but not found yet. Restart this launcher." }
  return $tool
}

$git = Ensure-Tool 'git' 'Git.Git' @(
  "$env:ProgramFiles\Git\cmd\git.exe",
  "$env:ProgramFiles\Git\bin\git.exe",
  "${env:ProgramFiles(x86)}\Git\cmd\git.exe"
)
$gh = Ensure-Tool 'gh' 'GitHub.cli' @(
  "$env:ProgramFiles\GitHub CLI\gh.exe",
  "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe"
)

Write-Host 'Checking GitHub login...'
& $gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'A GitHub browser sign-in is required once.'
  & $gh auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in was not completed.' }
}
$login = (& $gh api user --jq .login).Trim()
$id = (& $gh api user --jq .id).Trim()
if ($login -ine 'RDRM95') { throw "Signed in as '$login'. Please sign in as RDRM95 to publish to the intended account." }

# Avoid overwriting or pushing into an unexpected existing repository.
& $gh repo view $repo --json name *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Repository already exists: $repoUrl"
  Write-Host 'Nothing was overwritten. Open the repository and check its files.'
  exit 0
}

if (-not (Test-Path '.git')) {
  & $git init -b main
  if ($LASTEXITCODE -ne 0) { throw 'Could not initialise Git.' }
}
& $git config user.name $login
& $git config user.email "$id+$login@users.noreply.github.com"
& $git add -A
if ($LASTEXITCODE -ne 0) { throw 'Unable to stage project files.' }
& $git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & $git commit -m 'Initial spectator sandbox with 2D/3D battles and ship models'
  if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
}
& $git branch -M main
if ($LASTEXITCODE -ne 0) { throw 'Could not select main branch.' }

Write-Host "Creating independent repository $repo ..."
& $gh repo create $repo --public --source . --remote origin --push
if ($LASTEXITCODE -ne 0) { throw 'Repository creation or initial push failed. No existing repository was overwritten.' }
Write-Host "Project uploaded: $repoUrl"

# GitHub Pages config may be auto-created by the workflow; failure here is nonfatal.
Write-Host 'Configuring GitHub Pages...'
& $gh api --method POST "repos/$repo/pages" --field build_type=workflow 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'GitHub Pages could not be enabled automatically. In repository Settings > Pages, select GitHub Actions.'
}
& $gh workflow run pages.yml --repo $repo --ref main
if ($LASTEXITCODE -ne 0) {
  Write-Host 'The Pages workflow can be run manually from the Actions tab.'
}
Write-Host "Repo: $repoUrl"
Write-Host 'After the Pages workflow succeeds, the site should be at:'
Write-Host 'https://rdrm95.github.io/reaper-war-sandbox/'
Write-Host 'Pages is not considered live until GitHub Actions reports a successful deployment.'
