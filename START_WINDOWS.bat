@echo off
setlocal EnableExtensions
title REAPER WAR - Local Fleet Sandbox
cd /d "%~dp0"
echo.
echo ========================================================
echo   REAPER WAR - LOCAL SPACE BATTLE SANDBOX
echo ========================================================
echo.
echo Project folder: %CD%
echo.
where node.exe >nul 2>nul
if errorlevel 1 goto missingNode
where npm.cmd >nul 2>nul
if errorlevel 1 goto missingNode
if not exist "package.json" goto missingProject
echo Node.js version:
node --version
echo.
if not exist "node_modules\vite\package.json" (
  echo Installing dependencies. This needs internet on the first run.
  call npm install --no-audit --no-fund
  if errorlevel 1 goto installFailed
)
echo.
echo Starting simulator at http://localhost:5173/
echo Your browser should open automatically.
echo Leave this window OPEN while you use the simulator.
echo To stop the local server, press Ctrl+C here.
echo.
call npm run dev -- --host 127.0.0.1 --open
echo.
echo The simulator server has stopped.
pause
exit /b 0

:missingNode
echo ERROR: Node.js and npm are required.
echo Install Node.js LTS from https://nodejs.org/
echo Close and reopen this launcher after installing.
pause
exit /b 1

:missingProject
echo ERROR: package.json was not found beside this launcher.
echo Extract the complete ZIP first, then run this file from the project folder.
pause
exit /b 1

:installFailed
echo ERROR: npm install failed. See the message above.
echo Check your internet connection and try again.
pause
exit /b 1
