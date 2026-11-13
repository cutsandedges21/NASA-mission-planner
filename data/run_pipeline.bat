@echo off
REM One-click T-10 for Windows: get latest code, install Python libs, bake the Gale region, check it, push it.
REM Put this file in the NASA-mission-planner folder (next to CLAUDE.md) and double-click it.
REM Everything it prints is also saved to run_pipeline.log in the same folder.
setlocal
cd /d "%~dp0"
if not exist ".git" if exist "..\.git" cd ..
if not exist ".git" (
  echo.
  echo ERROR: this file is not inside the NASA-mission-planner git folder.
  echo It is in: %CD%
  echo Move it next to CLAUDE.md in your NASA-mission-planner folder and double-click it again.
  echo.
  pause
  exit /b 1
)
set LOG=%CD%\run_pipeline.log
echo Running in %CD% > "%LOG%"
echo Running in %CD%
echo A copy of everything below is saved to %LOG%
echo.

call :step "1/5  Getting the latest code" git pull --rebase --autostash || goto fail
if not exist "data\build_region.py" (echo data\build_region.py still missing after git pull >> "%LOG%" & echo data\build_region.py still missing after git pull & goto fail)

REM Find a real Python (the Microsoft Store "python" stub doesn't count), else install one with winget.
set PY=
py -3 -c "import sys" >nul 2>&1 && set PY=py -3
if not defined PY python -c "import sys" >nul 2>&1 && set PY=python
if not defined PY if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not defined PY (
  call :step "2a/5 Python not found: installing Python 3.12 with winget (a few minutes)" winget install --id Python.Python.3.12 -e --scope user --silent --accept-package-agreements --accept-source-agreements
  if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
)
if not defined PY (
  echo Could not install Python automatically. >> "%LOG%"
  echo Could not install Python automatically.
  echo Install it from https://www.python.org/downloads/ and tick "Add Python to PATH", then double-click this file again.
  goto fail
)
echo Using Python: %PY% >> "%LOG%"
echo Using Python: %PY%
call :step "2/5  Installing numpy, rasterio, scipy, pillow" %PY% -m pip install --upgrade rasterio numpy pillow scipy || goto fail
call :step "3/5  Building the Gale region (10-20 min, needs internet)" %PY% data\build_region.py gale
if errorlevel 1 (
  call :step "3b/5 1 m DEM failed, trying the 200 m fallback DEM" %PY% data\build_region.py gale --dem hrsc || goto fail
)
call :step "4/5  Committing the data" git add web/public/data/gale || goto fail
git commit -m "T-10: bake gale region (real NASA/USGS data)" >> "%LOG%" 2>&1
call :step "5/5  Pushing" git pull --rebase --autostash || goto fail
call :step "5/5  Pushing" git push || goto fail
echo.
echo DONE. Tell Claude "pipeline done".
echo DONE >> "%LOG%"
pause
exit /b 0

:fail
echo.
echo ===== SOMETHING FAILED =====
echo Open %LOG% and paste its contents to Claude (or copy this window's text).
echo.
pause
exit /b 1

:step
echo === %~1 ===
echo === %~1 === >> "%LOG%"
shift
set CMDLINE=
:collect
if "%~1"=="" goto run
set CMDLINE=%CMDLINE% %1
shift
goto collect
:run
powershell -NoProfile -Command "& { cmd /c '%CMDLINE% 2>&1' | ForEach-Object { $_; Add-Content -LiteralPath '%LOG%' -Value $_ -Encoding UTF8 }; exit $LASTEXITCODE }"
exit /b %errorlevel%
