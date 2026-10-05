@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
echo ========================================
echo    Music Player - Starting...
echo ========================================
echo.

:: Set PATH to include Node.js
set "PATH=C:\Program Files\nodejs;%PATH%"
set "NODE_PATH=C:\Program Files\nodejs\node_modules"

:: Kill any existing processes
echo [1/4] Cleaning old processes...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [2/4] Starting backend (port 3000)...
cd /d "%~dp0backend"
start /b "" "C:\Program Files\nodejs\node.exe" server.js > "%~dp0backend\server.log" 2>&1

:: Wait for backend to be ready
echo [3/4] Waiting for backend...
set READY=0
for /l %%i in (1,1,20) do (
    if !READY!==0 (
        "C:\Program Files\nodejs\node.exe" -e "const http=require('http');http.get('http://127.0.0.1:3000/api/songs?page=1&limit=1',r=>{process.exit(0)}).on('error',()=>{process.exit(1)})" >nul 2>&1
        if !errorlevel!==0 (
            set READY=1
        ) else (
            timeout /t 1 /nobreak >nul
        )
    )
)

if !READY!==0 (
    echo Backend did not become ready. See backend\server.log for details.
    exit /b 1
)

echo [4/4] Starting frontend (port 5173)...
cd /d "%~dp0frontend"
start /b "" "C:\Program Files\nodejs\node.exe" "node_modules\vite\bin\vite.js" > "%~dp0frontend\vite.log" 2>&1

timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo    Music Player is ready!
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:3000
echo ========================================
echo.
echo Press Ctrl+C to stop both servers...

:: Keep running until Ctrl+C
:loop
timeout /t 60 /nobreak >nul
goto loop
