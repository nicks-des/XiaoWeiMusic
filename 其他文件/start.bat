@echo off
setlocal
chcp 65001 >nul 2>&1
title Music Player

set "ROOT=%~dp0"

:: ── 1. Packaged Electron App (self-contained) ──
set "PACKAGED=%ROOT%win-unpacked\Music Player.exe"
if exist "%PACKAGED%" (
    echo Starting Music Player (packaged)...
    echo   %PACKAGED%
    start "" "%PACKAGED%"
    exit /b 0
)

:: ── 2. Native C++ Launcher ──
set "LAUNCHER=%ROOT%MusicPlayerLauncher.exe"
if exist "%LAUNCHER%" goto run_native
set "LAUNCHER=%ROOT%MusicPlayerLauncher.exe.bak"
if exist "%LAUNCHER%" goto run_native

set "LAUNCHER=%ROOT%native\build\MusicPlayerLauncher.exe"
if exist "%LAUNCHER%" goto run_native
set "LAUNCHER=%ROOT%native\build\Release\MusicPlayerLauncher.exe"
if exist "%LAUNCHER%" goto run_native
set "LAUNCHER=%ROOT%native\build\Debug\MusicPlayerLauncher.exe"
if exist "%LAUNCHER%" goto run_native

echo No launcher found. Check win-unpacked or native build.
echo.
goto legacy_start

:run_native
echo Starting Music Player with C++ launcher:
echo   %LAUNCHER%
start "" "%LAUNCHER%"
exit /b 0

:legacy_start
echo ===================================================
echo         Music Player - Desktop Client (Legacy)
echo ===================================================
echo.

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

set "NODE_EXE=C:\Program Files\nodejs\node.exe"
set "FRONTEND_DIR=%ROOT%frontend"
set "BACKEND_DIR=%ROOT%backend"

echo [1/3] Starting backend server...
start /b "" "%NODE_EXE%" "%BACKEND_DIR%\server.js"
timeout /t 3 /nobreak >nul

echo [2/3] Starting Vite dev server...
start /b "" "%NODE_EXE%" "%FRONTEND_DIR%\node_modules\vite\bin\vite.js" --mode electron
timeout /t 5 /nobreak >nul

echo [3/3] Starting Electron...
start "" "%FRONTEND_DIR%\node_modules\electron\dist\electron.exe" "%FRONTEND_DIR%"

echo.
echo Music Player started. Close this window to stop all services.
echo ===================================================

:wait_loop
timeout /t 5 /nobreak >nul
tasklist /FI "IMAGENAME eq electron.exe" 2>nul | find /I "electron.exe" >nul
if %ERRORLEVEL%==0 goto wait_loop

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING" 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)
