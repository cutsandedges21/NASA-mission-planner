@echo off
REM One-click T-10 for Windows: get latest code, install Python libs, bake the Gale region, check it, push it.
REM Put this file in the NASA-mission-planner folder (or data\ inside it) and double-click it.
setlocal
cd /d "%~dp0"
if not exist "data\build_region.py" cd ..
if not exist "data\regions\gale.json" if not exist ".git" (
  echo This file must sit inside the NASA-mission-planner folder. & pause & exit /b 1
)
echo === 1/5  Getting the latest code ===
git pull --rebase --autostash || (echo git pull failed - see above & pause & exit /b 1)
if not exist "data\build_region.py" (echo data\build_region.py not found after pull & pause & exit /b 1)

set PY=
where py >nul 2>nul && set PY=py -3
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY (
  echo Python is not installed. Install it from https://www.python.org/downloads/
  echo and tick "Add Python to PATH", then double-click this file again.
  pause & exit /b 1
)
echo === 2/5  Installing numpy, rasterio, scipy, pillow ===
%PY% -m pip install --upgrade rasterio numpy pillow scipy || (echo pip install failed - see above & pause & exit /b 1)

echo === 3/5  Building the Gale region (10-20 min, needs internet) ===
%PY% data\build_region.py gale
if errorlevel 1 (
  echo.
  echo The 1 m DEM failed or was stopped. Trying the 200 m fallback DEM...
  %PY% data\build_region.py gale --dem hrsc || (echo Build failed - copy this window's text to Claude & pause & exit /b 1)
)

echo === 4/5  Committing the data ===
git add web/public/data/gale
git commit -m "T-10: bake gale region (real NASA/USGS data)"
echo === 5/5  Pushing ===
git pull --rebase --autostash && git push || (echo push failed - see above & pause & exit /b 1)
echo.
echo DONE. Tell Claude "pipeline done".
pause
