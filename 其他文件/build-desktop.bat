@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ============================================================
echo    Music Player - Desktop Build Script
echo ============================================================
echo.

set "ROOT=%~dp0"
set "FRONTEND=%ROOT%frontend"
set "BACKEND=%ROOT%backend"
set "RELEASE=%FRONTEND%\release\win-unpacked"
set "NODE_EXE="

:: ── Find Node.js ──
if exist "C:\Program Files\nodejs\node.exe" set "NODE_EXE=C:\Program Files\nodejs\node.exe"
if exist "C:\Program Files (x86)\nodejs\node.exe" set "NODE_EXE=C:\Program Files (x86)\nodejs\node.exe"
if "%NODE_EXE%"=="" (
    for /f "tokens=*" %%i in ('where node 2^>nul') do ( set "NODE_EXE=%%i" & goto :nodeok )
)
:nodeok
if "%NODE_EXE%"=="" (
    echo [ERROR] Node.js not found! Install from https://nodejs.org/
    pause & exit /b 1
)
echo [OK] Node.js: %NODE_EXE%

:: ── Step 1: Build frontend ──
echo.
echo [1/4] Building frontend (Vite)...
cd /d "%FRONTEND%"
call "%NODE_EXE%" node_modules\vite\bin\vite.js build
if %ERRORLEVEL% NEQ 0 ( echo [ERROR] Frontend build failed! & pause & exit /b 1 )
echo [OK] Frontend built.

:: ── Step 2: Copy frontend build to backend ──
echo.
echo [2/4] Copying frontend to backend/frontend-dist/...
cd /d "%ROOT%"
if exist "%BACKEND%\frontend-dist" rmdir /s /q "%BACKEND%\frontend-dist"
xcopy /E /I /Y "%FRONTEND%\dist" "%BACKEND%\frontend-dist" >nul
echo [OK] Copied.

:: ── Step 3: Package with Electron ──
echo.
echo [3/4] Packaging Electron app...
cd /d "%FRONTEND%"
if exist "release" rmdir /s /q "release"
call "%NODE_EXE%" node_modules\electron-builder\out\cli\cli.js --dir
if %ERRORLEVEL% NEQ 0 ( echo [ERROR] Packaging failed! & pause & exit /b 1 )
echo [OK] Electron app packaged.

:: ── Step 4: Copy backend node_modules ──
echo.
echo [4/4] Copying backend dependencies...
cd /d "%ROOT%"
if exist "%BACKEND%\node_modules" (
    if not exist "%RELEASE%\resources\backend\node_modules" mkdir "%RELEASE%\resources\backend\node_modules"
    xcopy /E /I /Y "%BACKEND%\node_modules" "%RELEASE%\resources\backend\node_modules" >nul
)
echo [OK] Dependencies copied.

:: ── Done ──
echo.
echo ============================================================
echo    BUILD COMPLETE!
echo.
echo    Your app is at:
echo    %RELEASE%\Music Player.exe
echo.
echo    How to use:
echo    1. Copy the "win-unpacked" folder anywhere
echo    2. Double-click "Music Player.exe"
echo    3. The app auto-starts backend and opens the window
echo    4. Click twice = same window (single instance)
echo.
echo    Prerequisites:
echo    - MySQL must be running (localhost:3306)
echo    - Database "musicplayer" must exist
echo ============================================================
pause
