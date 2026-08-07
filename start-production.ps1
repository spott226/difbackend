$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$nodePath = 'C:\Program Files\nodejs\node.exe'
$logPath = Join-Path $PSScriptRoot 'backend-production.log'

& $nodePath 'dist\src\server.js' *>> $logPath
