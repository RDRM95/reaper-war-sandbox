@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install current LTS from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules\vite (
  echo Installing project dependencies (first run only)...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your network connection.
    pause
    exit /b 1
  )
)
echo Launching REAPER WAR Spectator Sandbox in your browser...
call npm run dev -- --open
if errorlevel 1 pause
