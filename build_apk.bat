@echo off
chcp 65001 >nul
echo [!] Starting Antigravity Mobile Build...
python "%~dp0build_apk.py"
if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================================
    echo  [✓] Build completed successfully!
    echo  [✓] APK created on Desktop: Antigravity-Mobile.apk
    echo ========================================================
) else (
    echo.
    echo  [X] Build failed with error code %ERRORLEVEL%
)
pause
