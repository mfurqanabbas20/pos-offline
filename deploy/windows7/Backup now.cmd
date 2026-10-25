@echo off
rem Copies the database. To copy straight to a USB drive:  "Backup now.cmd" --dest E:\POS-Backups
"%~dp0app\venv\Scripts\python.exe" "%~dp0pos.py" backup %*
echo.
pause
