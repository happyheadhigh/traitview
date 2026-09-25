@echo off
REM Double-click helper for Windows.
REM Builds data\fast\* from the folder this .bat resides in.
setlocal
cd /d "%~dp0"
python "%~dp0build_fast_start_v2.py"
if %errorlevel% neq 0 (
  echo.
  echo Build failed. Ensure you have Python installed and your /data folder is here.
  pause
) else (
  echo.
  echo Done! Files are in data\fast\
  pause
)
