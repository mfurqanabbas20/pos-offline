@echo off
rem One-time setup of Tasneem POS (safe to run again after updating).
cd /d "%~dp0"
set "PY="
py -3.12 --version >nul 2>nul && set "PY=py -3.12"
if not defined PY python --version >nul 2>nul && set "PY=python"
if not defined PY (
  echo.
  echo Python 3.12 for Windows 7 is not installed yet. See README.txt, step 1.
  echo.
  pause
  exit /b 1
)
%PY% "%~dp0pos.py" setup %*
echo.
pause
