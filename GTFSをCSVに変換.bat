@echo off
setlocal
cd /d "%~dp0"

if "%~1"=="" (
    set /p "GTFS_ZIP=Enter the path to a GTFS ZIP or a folder containing ZIP files: "
) else (
    set "GTFS_ZIP=%~1"
)

if not exist "%GTFS_ZIP%" (
    echo Input path not found: "%GTFS_ZIP%"
    pause
    exit /b 1
)

if exist "%~dp0routes\index.json" (
    set "ROUTES_OUTPUT=%~dp0routes"
) else (
    set "ROUTES_OUTPUT=%~dp0github\routes"
)

where py >nul 2>nul
if errorlevel 1 (
    python "%~dp0gtfs_to_unchin_csv.py" "%GTFS_ZIP%" --output "%ROUTES_OUTPUT%" --fare 210
) else (
    py -3 "%~dp0gtfs_to_unchin_csv.py" "%GTFS_ZIP%" --output "%ROUTES_OUTPUT%" --fare 210
)

if errorlevel 1 (
    echo Conversion failed. Check that Python 3 is installed and try again.
) else (
    echo Conversion complete. Files are in "%ROUTES_OUTPUT%".
)
pause
