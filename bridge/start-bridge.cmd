@echo off
cd /d "%~dp0\.."
if not exist "bridge\config.json" (
  echo ERRO: bridge\config.json nao existe.
  echo Copie bridge\config.example.json para bridge\config.json e configure a PRINT_BRIDGE_KEY e os nomes das impressoras.
  pause
  exit /b 1
)
node bridge\print-bridge.mjs bridge/config.json
if errorlevel 1 pause
