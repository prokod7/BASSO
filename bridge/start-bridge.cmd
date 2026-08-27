@echo off
setlocal
cd /d "%~dp0\.."

echo ==========================================
echo   PedidoPro - Print Bridge Basso
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao esta instalado neste computador.
  echo Instale o Node.js 22 LTS e execute este arquivo novamente.
  pause
  exit /b 1
)

if not exist "bridge\config.json" (
  echo ERRO: bridge\config.json nao existe.
  echo.
  echo 1. Copie bridge\config.example.json para bridge\config.json.
  echo 2. Informe a chave do Print Bridge.
  echo 3. Informe os nomes EXATOS das impressoras do Windows.
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "bridge\list-printers.ps1"
  pause
  exit /b 1
)

findstr /C:"USE-A-MESMA-PRINT_BRIDGE_KEY-DA-VERCEL" "bridge\config.json" >nul
if not errorlevel 1 (
  echo ERRO: a chave do Print Bridge ainda esta com o valor de exemplo.
  echo Configure apiKey em bridge\config.json antes de continuar.
  pause
  exit /b 1
)

findstr /C:"NOME-EXATO-DA-" "bridge\config.json" >nul
if not errorlevel 1 (
  echo ERRO: ainda existem nomes de impressora de exemplo no config.json.
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "bridge\list-printers.ps1"
  echo.
  echo Copie exatamente o campo Name de cada impressora para bridge\config.json.
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

echo Verificando acesso ao servidor...
powershell -NoProfile -NonInteractive -Command "$c=Get-Content -Raw 'bridge\config.json'|ConvertFrom-Json; try { $r=Invoke-WebRequest -UseBasicParsing -Method Post -Uri ($c.baseUrl.TrimEnd('/') + '/api/print/heartbeat') -Headers @{'X-Print-Bridge-Key'=$c.apiKey;'Content-Type'='application/json'} -Body '{\"bridge\":\"PedidoPro Print Bridge - preflight\",\"platform\":\"win32\",\"version\":\"1.2\"}'; if($r.StatusCode -ne 200){exit 2} } catch { Write-Host ('ERRO NO SERVIDOR: ' + $_.Exception.Message) -ForegroundColor Red; exit 2 }"
if errorlevel 1 (
  echo.
  echo O servidor recusou o Print Bridge. Verifique a chave apiKey e a conexao com a internet.
  pause
  exit /b 1
)

echo Servidor OK. Iniciando impressao automatica...
echo NAO FECHE ESTA JANELA durante o funcionamento da pizzaria.
echo.
node bridge\print-bridge.mjs bridge/config.json
if errorlevel 1 pause
