@echo off
set "SCRIPT_DIR=%~dp0"
echo ============================================================
echo      CRIANDO EXECUTAVEL E ATALHO OFICIAL DO DESKTOP
echo ============================================================

:: 1. Compila a versao mais recente com icone nativo
if exist "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" (
    "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /win32icon:"%SCRIPT_DIR%app_icon.ico" /out:"%SCRIPT_DIR%Eldorado Pesca.exe" "%SCRIPT_DIR%Launcher.cs" >nul 2>&1
)

:: 2. Copia executavel para a Area de Trabalho
copy /y "%SCRIPT_DIR%Eldorado Pesca.exe" "%USERPROFILE%\Desktop\Eldorado Pesca.exe" >nul 2>&1
if exist "%USERPROFILE%\OneDrive\Desktop" (
    copy /y "%SCRIPT_DIR%Eldorado Pesca.exe" "%USERPROFILE%\OneDrive\Desktop\Eldorado Pesca.exe" >nul 2>&1
)

:: 3. Remove atalhos antigos do Google Chrome PWA para eliminar a bolinha/avatar do Google
del /f /q "%USERPROFILE%\Desktop\Eldorado Pesca & Lake.lnk" >nul 2>&1
del /f /q "%USERPROFILE%\OneDrive\Desktop\Eldorado Pesca & Lake.lnk" >nul 2>&1

:: 4. Cria atalhos oficiais na Area de Trabalho apontando para o app nativo Electron
powershell -NoProfile -ExecutionPolicy Bypass -Command "$WshShell = New-Object -ComObject WScript.Shell; $desktops = @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('UserProfile') + '\OneDrive\Desktop'); foreach($d in $desktops){ if(Test-Path $d){ foreach($name in @('\Eldorado Pesca.lnk', '\Eldorado Pesca & Lake.lnk')){ $s = $WshShell.CreateShortcut($d + $name); $s.TargetPath = '%SCRIPT_DIR%Eldorado Pesca.exe'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.IconLocation = '%SCRIPT_DIR%app_icon.ico'; $s.Description = 'Eldorado Pesca & Lake - Gestao Oficial'; $s.Save(); } } }"

echo.
echo [OK] Executavel oficial 'Eldorado Pesca.exe' atualizado!
echo [OK] Atalho nativo (sem icone do Google) criado com sucesso na Area de Trabalho!
echo ============================================================
timeout /t 2 >nul 2>&1
exit

