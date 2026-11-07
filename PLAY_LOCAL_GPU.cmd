@echo off
setlocal EnableExtensions
title REAPER WAR - Local GPU Edition
echo.
echo ========================================================
echo   REAPER WAR - UPDATE AND PLAY LOCALLY
echo ========================================================
echo.
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo ERROR: Windows PowerShell is required.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\play-local-gpu.ps1"
if errorlevel 1 (
  echo.
  echo Launch failed. The reason is shown above.
  pause
  exit /b 1
)
exit /b 0
