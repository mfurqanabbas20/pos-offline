@echo off
rem Double-click to run. Extra options can be passed after the file name.
ver | find "Version 6." >nul && (
  echo.
  echo  This is the Windows 10/11 version of Tasneem POS. It does not run on Windows 7 or 8.
  echo  Use the Windows 7 package instead: TasneemPOS-Win7.zip
  echo  Extract it to C:\ and double-click Setup.cmd inside C:\TasneemPOS-Win7
  echo  See deploy\windows7\README.md for the full steps.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\start.ps1" %*
