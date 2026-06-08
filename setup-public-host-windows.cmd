@echo off
setlocal
cd /d "%~dp0"
echo [setup] Launching RAZZKINGS Windows setup wizard...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\windows\setup-public-host.ps1"
if errorlevel 1 (
  echo.
  echo [setup] Setup failed. Review messages above and run again.
  pause
  exit /b 1
)
echo.
echo [setup] Setup completed successfully.
pause