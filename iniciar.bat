@echo off
chcp 65001 >nul
title SEBI - Sistema de Enajenacion de Bienes Informaticos
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se encontro Node.js. Descargalo e instalalo desde https://nodejs.org (version LTS^) y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)
echo Iniciando SEBI... (deja esta ventana abierta; Ctrl+C para detener)
start "" http://localhost:8080
node --max-old-space-size=2048 server.js
pause
