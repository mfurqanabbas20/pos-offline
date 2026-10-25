@echo off
if not exist "%~dp0app\venv\Scripts\pythonw.exe" (echo Run Setup.cmd first. & pause & exit /b 1)
start "" "%~dp0app\venv\Scripts\pythonw.exe" "%~dp0pos.py" stop
