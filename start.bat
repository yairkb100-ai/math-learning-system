@echo off
REM ============================================================
REM  math-learning-system - one-click start (Windows)
REM  Double-click this file, or run:  start.bat
REM  Installs deps on first run, seeds the DB, then launches
REM  the backend (http://localhost:8000) and frontend
REM  (http://localhost:5173) and opens the browser.
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo === math-learning-system : starting ===
echo Project: %cd%
echo.

REM --- 1. Backend Python dependencies ---
echo [1/4] Installing backend dependencies...
py -m pip install -q -r backend\requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed. Is Python installed? Try:  py --version
    pause
    exit /b 1
)

REM --- 2. Seed the database from courses\*.json ---
echo [2/4] Seeding database from courses\ ...
py backend\seed.py
if errorlevel 1 (
    echo ERROR: database seed failed.
    pause
    exit /b 1
)

REM --- 3. Start the backend API in its own window ---
echo [3/4] Starting backend API (http://localhost:8000) ...
start "math-backend" cmd /k "cd /d "%~dp0backend" && py -m uvicorn app.main:app --port 8000"

REM --- 4. Frontend: install deps first time, then dev server ---
echo [4/4] Starting frontend (http://localhost:5173) ...
if not exist "frontend\node_modules" (
    echo First run: installing frontend packages ^(npm install^)...
    pushd frontend
    call npm install
    popd
)
start "math-frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM Give Vite a few seconds to boot, then open the browser.
timeout /t 8 /nobreak >nul
echo Opening browser at http://localhost:5173 ...
powershell -NoProfile -Command "Start-Process 'http://localhost:5173'" 2>nul
if errorlevel 1 (
    echo Could not open the browser automatically via PowerShell, trying fallback...
    start "" "http://localhost:5173"
)

echo.
echo === Running ===
echo   Backend : http://localhost:8000  (API docs: /docs)
echo   Frontend: http://localhost:5173
echo Two new windows opened (backend + frontend). Close them to stop.
echo If the browser still did not open, go to http://localhost:5173 manually.
echo.
pause
endlocal
