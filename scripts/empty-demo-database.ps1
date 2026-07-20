param(
  [string]$DatabaseUrl = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Checked {
  param(
    [string]$Description,
    [scriptblock]$Command
  )

  Write-Host $Description
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Description fallo con codigo $LASTEXITCODE"
  }
}

if (-not $DatabaseUrl) {
  $DatabaseUrl = Read-Host "Pega DATABASE_URL directa de Neon para vaciar demo (sin -pooler)"
}

if ($DatabaseUrl -match "-pooler") {
  Write-Host "Aviso: esta URL parece pooled (-pooler). Para vaciar o migrar usa la URL directa de Neon, sin -pooler." -ForegroundColor Yellow
}

Invoke-Checked "Vaciando datos operativos y dejando usuarios, roles y empresas base..." {
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = $DatabaseUrl
    npm run db:empty
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}

Write-Host "Demo lista: inventario, bodegas, ubicaciones, productos, pedidos, recepciones y despachos quedaron vacios." -ForegroundColor Green
