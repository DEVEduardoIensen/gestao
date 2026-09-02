@echo off
title Eldorado Pesca & Lake
cd /d "%~dp0"

if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
  exit
)

start "" /b "node.exe" local_server.js 2>nul || start "" /b "C:\Program Files\nodejs\node.exe" local_server.js 2>nul
timeout /t 1 /nobreak >nul
start http://localhost:3000
exit
