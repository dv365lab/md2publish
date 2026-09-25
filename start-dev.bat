@echo off
setlocal
cd /d "%~dp0"
title md2publish

rem ============================================================
rem  md2publish one-click launcher
rem  - If the dev server is already running: just open the browser
rem  - Otherwise: start the dev server (auto-opens the browser,
rem    see server.open in vite.config.ts)
rem ============================================================

rem ---- Already running? Just open the browser ----
powershell -NoProfile -Command "try { $page = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:43187/' -TimeoutSec 2).Content; if ($page -like '*<title>md2publish</title>*') { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
    start "" "http://127.0.0.1:43187/"
    exit /b 0
)

rem ---- Do not open another app when it owns the port ----
powershell -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort 43187 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
    echo [ERROR] Port 43187 is used by another app.
    echo Close that app and run start-dev.bat again.
    pause
    exit /b 1
)

rem ---- Check that npm is available ----
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm was not found in PATH.
    echo Please install Node.js 22 LTS from https://nodejs.org/ first.
    pause
    exit /b 1
)

rem ---- First run: install dependencies ----
if not exist "node_modules\vite" (
    echo First run: installing dependencies, please wait...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

rem ---- Start the dev server in its own window ----
rem The window stays open; press Ctrl+C in it (or close it) to stop the server.
rem Vite will auto-open http://127.0.0.1:43187/ when ready.
start "md2publish dev server" cmd /k "npm run dev"
endlocal
