$ErrorActionPreference = 'Stop'
Write-Host "Impressoras instaladas no Windows:" -ForegroundColor Cyan
Get-Printer | Sort-Object Name | Select-Object Name, DriverName, PortName, PrinterStatus | Format-Table -AutoSize
Write-Host "`nCopie exatamente o campo Name para bridge/config.json." -ForegroundColor Yellow
