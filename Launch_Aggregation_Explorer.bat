@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  py -3 launch.py
  goto finished
)
if exist "%LocalAppData%\Programs\Python\Python312\python.exe" (
  "%LocalAppData%\Programs\Python\Python312\python.exe" launch.py
  goto finished
)
where python >nul 2>nul
if not errorlevel 1 (
  python launch.py
  goto finished
)
echo Python 3 was not found. No installation is required for the portable HTML.
echo Opening Aggregation_Explorer.html directly. The CPU fallback is available.
start "" "%~dp0Aggregation_Explorer.html"
goto end
:finished
if errorlevel 1 (
  echo.
  echo The launcher stopped with an error. You can open Aggregation_Explorer.html directly.
  pause
)
:end
endlocal
