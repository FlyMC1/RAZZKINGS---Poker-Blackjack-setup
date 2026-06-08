@echo off
setlocal
title RAZZKINGS Public Host Launcher
cd /d "%~dp0"

echo [one-click] Starting RAZZKINGS public host launcher...
echo [one-click] Project folder: %CD%
echo.

if not exist "%~dp0package.json" (
	echo [one-click] package.json was not found.
	echo [one-click] Extract the full RAZZKINGS project zip first, then run this file from the extracted folder.
	pause
	exit /b 1
)

if not exist "%~dp0scripts\one-click-public-host.mjs" (
	echo [one-click] Public host script was not found.
	echo [one-click] Extract the full RAZZKINGS project zip first, then run this file from the extracted folder.
	pause
	exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
	echo [one-click] Node.js was not found. Run setup-public-host-windows.cmd first.
	pause
	exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
	echo [one-click] npm was not found. Run setup-public-host-windows.cmd first.
	pause
	exit /b 1
)

npm run host:public:oneclick
if errorlevel 1 (
	echo.
	echo [one-click] Hosting failed. Review messages above and run setup-public-host-windows.cmd if needed.
	pause
	exit /b 1
)

echo.
echo [one-click] Hosting stopped.
pause
