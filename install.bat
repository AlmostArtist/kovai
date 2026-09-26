@echo off
REM ---------------------------------------------------------------
REM  KOVAI - one-command install for Windows.
REM
REM    install.bat
REM
REM  Double-click it, or run it from a terminal. Checks for Node,
REM  installs dependencies, walks you through your API keys, and
REM  offers to start the workspace. Safe to run again at any point.
REM ---------------------------------------------------------------
setlocal
cd /d "%~dp0"

echo.
echo   KOVAI - the creative intelligence workspace
echo.

REM -- Node ------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo   [x] Node.js is not installed.
  echo.
  echo       Install it, then run this again:
  echo         winget install OpenJS.NodeJS.LTS
  echo         ...or https://nodejs.org  ^(version 20 or newer^)
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 (
  echo   [x] Node is too old - KOVAI needs version 20 or newer.
  echo       https://nodejs.org
  echo.
  pause
  exit /b 1
)

REM -- Setup -----------------------------------------------------
REM  The real work lives in one Node script, shared with macOS and
REM  Linux, so the three platforms cannot drift apart.
call node scripts\setup.mjs %*
if errorlevel 1 (
  echo.
  echo   Setup did not finish. The output above says why.
  pause
  exit /b 1
)

REM -- Start -----------------------------------------------------
set /p REPLY="Start KOVAI now? [Y/n] "
if /i "%REPLY%"=="n" (
  echo.
  echo   When you are ready:  npm run dev
  echo.
  pause
  exit /b 0
)

echo.
call npm run dev
