@echo off
rem Double-click to run. Extra options can be passed after the file name.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\backup.ps1" %*
pause
