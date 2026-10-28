@echo off
set "IMMERSE_DATA_DIR=%~dp0.runtime\data"
set "IMMERSE_RUNTIME_DIR=%~dp0.runtime"
start "" "%~dp0release\win-unpacked\Immerse Jam.exe"
