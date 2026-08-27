@echo off
cd /d "%~dp0\.."
if not exist "bridge\config.json" (
  echo ERRO: bridge\config.json nao existe.
  echo Copie bridge\config.example.json para bridge\config.json e configure a PRINT_BRIDGE_KEY e os nomes das impressoras.
  pause
  exit /b 1
)

findstr /C:"basso-pedido-pro.vercel.app" "bridge\config.json" >nul
if %errorlevel%==0 (
  echo AVISO: o config.json usa um alias protegido pela Vercel.
  echo Corrigindo automaticamente para https://basso-seven.vercel.app ...
  powershell -NoProfile -NonInteractive -Command "(Get-Content -Raw 'bridge\config.json').Replace('https://basso-pedido-pro.vercel.app','https://basso-seven.vercel.app') | Set-Content -Encoding UTF8 'bridge\config.json'"
  if errorlevel 1 (
    echo ERRO: nao foi possivel corrigir a URL do Print Bridge.
    pause
    exit /b 1
  )
)

node bridge\print-bridge.mjs bridge/config.json
if errorlevel 1 pause
