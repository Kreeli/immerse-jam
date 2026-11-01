@echo off
setlocal
cd /d "%~dp0"
for %%F in ("Immerse Jam.exe" "icudtl.dat" "resources.pak" "resources\app.asar") do (
  if not exist "%~dp0release\win-unpacked\%%~F" (
    echo Immerse Jam test build is incomplete: %%~F is missing.
    echo Please rebuild the desktop application. Your music library is unchanged.
    pause
    exit /b 1
  )
)
set "ELECTRON_RUN_AS_NODE="
set "IMMERSE_DATA_DIR=%~dp0.runtime\data"
set "IMMERSE_RUNTIME_DIR=%~dp0.runtime"
start "" "%~dp0release\win-unpacked\Immerse Jam.exe"
