@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\publish-github.ps1"
echo.
if errorlevel 1 (
  echo Publishing was not completed. Review the message above.
) else (
  echo Publishing script finished.
)
pause
