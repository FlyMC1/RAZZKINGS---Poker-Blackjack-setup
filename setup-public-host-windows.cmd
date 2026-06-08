@echo off
setlocal
title RAZZKINGS Windows Public Host Setup
cd /d "%~dp0"

set "SETUP_SCRIPT=%~dp0scripts\windows\setup-public-host.ps1"

echo [setup] Launching RAZZKINGS Windows setup wizard...
echo [setup] Project folder: %CD%
echo.

if not exist "%SETUP_SCRIPT%" (
  echo [setup] Setup script not found:
  echo [setup] %SETUP_SCRIPT%
  echo.
  echo [setup] Make sure you extracted the full RAZZKINGS zip before running this file.
  pause
  exit /b 1
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo [setup] Windows PowerShell was not found on this PC.
  echo [setup] Install or enable Windows PowerShell, then run setup again.
  pause
  exit /b 1
)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SETUP_SCRIPT%" -Auto
if errorlevel 1 (
  echo.
  echo [setup] Setup failed. Review messages above and run again.
  pause
  exit /b 1
)
echo.
echo [setup] Setup completed successfully.
pause