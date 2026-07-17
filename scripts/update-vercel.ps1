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
  $DatabaseUrl = Read-Host "Pega DATABASE_URL directa de Neon para migraciones (sin -pooler)"
}

if ($DatabaseUrl -match "-pooler") {
  Write-Host "Aviso: esta URL parece ser pooled (-pooler). Para migraciones usa la URL directa de Neon, sin -pooler." -ForegroundColor Yellow
}

Invoke-Checked "Validando build local..." { npm run build }

Invoke-Checked "Aplicando migraciones en Neon..." {
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = $DatabaseUrl
    npm run db:migrate
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}

Invoke-Checked "Publicando cambios en Vercel..." { npx vercel --prod --yes }
