@echo off
set "SCRIPT_DIR=%~dp0"
echo ============================================================
echo      CRIANDO EXECUTAVEL E ATALHO NA AREA DE TRABALHO
echo ============================================================

copy /y "%SCRIPT_DIR%Eldorado Pesca.exe" "%USERPROFILE%\Desktop\Eldorado Pesca.exe" >nul 2>&1
if exist "%USERPROFILE%\OneDrive\Desktop" (
    copy /y "%SCRIPT_DIR%Eldorado Pesca.exe" "%USERPROFILE%\OneDrive\Desktop\Eldorado Pesca.exe" >nul 2>&1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$WshShell = New-Object -ComObject WScript.Shell; $d = [Environment]::GetFolderPath('Desktop'); $s = $WshShell.CreateShortcut($d + '\Eldorado Pesca.lnk'); $s.TargetPath = '%SCRIPT_DIR%Eldorado Pesca.exe'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.IconLocation = '%SCRIPT_DIR%app_icon.ico'; $s.Save()"

echo.
echo [OK] Novo executavel 'Eldorado Pesca.exe' e atalho oficial atualizados na Area de Trabalho!
echo ============================================================
timeout /t 2 >nul 2>&1
exit

