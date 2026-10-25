@echo off
rem Double-click to run. Extra options can be passed after the file name.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\stop.ps1" %*
pause
