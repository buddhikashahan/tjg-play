@echo off
setlocal
title TSJ Play - TV Kiosk
color 0E
cd /d "%~dp0"

set "PORT=3000"
set "TV_URL=http://localhost:%PORT%/tv"
:: Persistent profile so the microphone permission and settings survive reboots.
set "PROFILE_DIR=%LOCALAPPDATA%\TSJPlay\kiosk-profile"

echo ============================================================
echo                 TSJ PLAY - TV KIOSK LAUNCHER
echo ============================================================
echo.

:: 1. Start the web server unless it is already listening
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Server already running on port %PORT%.
    goto launch_browser
)

if exist ".next\BUILD_ID" (
    echo [*] Starting production server...
    start "TSJ Play Server" /min cmd /c "npm start"
) else (
    echo [*] No production build found - starting the development server.
    echo     Tip: run "npm run build" once for faster, more reliable startup.
    start "TSJ Play Server" /min cmd /c "npm run dev"
)

:: 2. Wait until the TV page responds (up to ~90 seconds)
echo [*] Waiting for the server to respond...
set /a WAITED=0
:wait_loop
curl.exe --silent --output nul --max-time 3 "%TV_URL%" >nul 2>&1
if %ERRORLEVEL% equ 0 goto server_ready
set /a WAITED+=2
if %WAITED% geq 90 (
    echo [!] Server did not respond in time - opening the browser anyway.
    goto launch_browser
)
"%SystemRoot%\System32\timeout.exe" /t 2 /nobreak >nul
goto wait_loop

:server_ready
echo [OK] Server is ready.

:launch_browser
:: 3. Locate Google Chrome or Microsoft Edge (both support voice recognition)
set "BROWSER="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

:: Kiosk flags:
::  --use-fake-ui-for-media-stream  auto-allows the remote's microphone (no permission popup on the TV)
::  --autoplay-policy=...           lets videos start with sound without a click
::  --overscroll-history-navigation=0 / --disable-pinch  stop accidental gestures
set FLAGS=--kiosk "%TV_URL%" --user-data-dir="%PROFILE_DIR%" --no-first-run --no-default-browser-check --disable-infobars --noerrdialogs --disable-session-crashed-bubble --disable-translate --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream --disable-pinch --overscroll-history-navigation=0

if defined BROWSER (
    echo [OK] Browser: "%BROWSER%"
    start "" "%BROWSER%" %FLAGS%
) else (
    echo [!] Chrome/Edge not found in the usual folders - trying "msedge".
    start "" msedge %FLAGS%
)

echo.
echo ============================================================
echo  TV interface : %TV_URL%
echo  Admin portal : http://localhost:%PORT%/admin
echo  Exit kiosk   : Alt + F4
echo ============================================================
"%SystemRoot%\System32\timeout.exe" /t 3 >nul
endlocal
exit /b 0
