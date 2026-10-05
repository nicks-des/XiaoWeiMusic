@echo off
setlocal

set "ROOT=%~dp0.."
set "BUILD_DIR=%ROOT%\native\build"
set "EXE=%BUILD_DIR%\MusicPlayerLauncher.exe"

where g++ >nul 2>nul
if not errorlevel 1 (
    if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"
    g++ -std=c++17 -DUNICODE -D_UNICODE -Wall -Wextra "%ROOT%\native\MusicPlayerLauncher.cpp" -mwindows -municode -luser32 -lws2_32 -lstdc++fs -o "%EXE%"
    exit /b %errorlevel%
)

where cmake >nul 2>nul
if not errorlevel 1 (
    cmake -S "%ROOT%" -B "%BUILD_DIR%"
    if not errorlevel 1 (
        cmake --build "%BUILD_DIR%" --config Release
        if not errorlevel 1 exit /b 0
    )
    exit /b %errorlevel%
)

echo No C++ compiler found. Install Visual Studio Build Tools, CMake, or MinGW.
exit /b 1
