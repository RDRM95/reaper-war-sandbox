@echo off
setlocal
cd /d "%~dp0"
where gh >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI not installed. Install it from https://cli.github.com/
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo Git not installed. Install it from https://git-scm.com/
  pause
  exit /b 1
)
echo Checking GitHub login...
gh auth status
if errorlevel 1 (
  echo Please sign into GitHub using the next command.
  gh auth login
  if errorlevel 1 (pause & exit /b 1)
)
if not exist .git (
  git init
  git add .
  git commit -m "Initial Reaper War spectator sandbox v0.2"
  if errorlevel 1 (pause & exit /b 1)
  git branch -M main
)
echo Creating independent repository RDRM95/reaper-war-sandbox...
gh repo create RDRM95/reaper-war-sandbox --public --source . --remote origin --push
if errorlevel 1 (
  echo Unable to create repository. Check whether it already exists or you lack permissions.
  pause
  exit /b 1
)
echo Created and pushed to https://github.com/RDRM95/reaper-war-sandbox
pause
