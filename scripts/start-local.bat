@echo off
REM Starts the KOVAI local runtime, and the interface unless KOVAI_RUNTIME_ONLY=1.

setlocal
cd /d "%~dp0.."

if "%KOVAI_RUNTIME_PORT%"=="" set KOVAI_RUNTIME_PORT=8756

if not exist "runtime\.venv" (
  echo [kovai] Creating the runtime virtual environment ^(first run only^)...
  python -m venv runtime\.venv
)

call runtime\.venv\Scripts\activate.bat

echo [kovai] Installing runtime dependencies...
python -m pip install --quiet --upgrade pip
python -m pip install --quiet -r runtime\requirements.txt

echo [kovai] Starting the local runtime on http://127.0.0.1:%KOVAI_RUNTIME_PORT%
if "%KOVAI_RUNTIME_ONLY%"=="1" (
  cd runtime
  python main.py
  goto :eof
)

start "KOVAI runtime" cmd /c "cd runtime && python main.py"

if not exist "node_modules" (
  echo [kovai] Installing interface dependencies...
  call npm install
)

echo [kovai] Starting KOVAI on http://localhost:3000
call npm run dev
