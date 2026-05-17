@echo off
setlocal
set PORT=5757
set PAGE=index.html
set DIR=%~dp0

REM Pick a Python launcher
where py >nul 2>&1
if %errorlevel% == 0 goto :have_py
where python >nul 2>&1
if %errorlevel% == 0 goto :have_python
echo Python not found. Install from https://python.org, then re-run.
pause
exit /b 1

:have_py
set PY=py
goto :continue
:have_python
set PY=python
goto :continue

:continue
REM Start the server only if nothing's already listening on the port
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    echo Server already running on port %PORT%.
) else (
    echo Starting server on port %PORT% in background...
    start /min "Dreams server" cmd /c "cd /d %DIR% && %PY% server.py"
    timeout /t 1 /nobreak >nul
)

REM Prefer Chrome in app-mode so it looks like a native window
set CHROME=
for %%P in (
    "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
    "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
    "%LocalAppData%\Google\Chrome\Application\chrome.exe"
) do (
    if exist %%P set CHROME=%%P
)

if defined CHROME (
    start "" %CHROME% --app="http://localhost:%PORT%/%PAGE%" --window-size=480,900
) else (
    start "" "http://localhost:%PORT%/%PAGE%"
)

endlocal
