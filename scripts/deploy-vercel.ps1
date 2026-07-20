param(
  [string]$ProjectName = "mundiwms",
  [string]$DatabaseUrl = "",
  [string]$SessionSecret = ""
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

function Normalize-DatabaseUrl {
  param([string]$Value)

  $normalized = $Value.Trim()
  if ($normalized -match '^DATABASE_URL\s*=\s*(.+)$') {
    $normalized = $Matches[1].Trim()
  }
  $normalized = $normalized.Trim('"').Trim("'")
  return $normalized
}

if (-not $DatabaseUrl) {
  $DatabaseUrl = Read-Host "Pega DATABASE_URL directa de Neon para migraciones (sin -pooler)"
}

$DatabaseUrl = Normalize-DatabaseUrl $DatabaseUrl

if ($DatabaseUrl -notmatch '^postgres(ql)?://') {
  throw "DATABASE_URL invalida. Debe empezar con postgresql:// o postgres://. No pegues la URL de la consola de Neon ni el texto DATABASE_URL=."
}

if (-not $SessionSecret) {
  $SessionSecret = "mundiwms-production-" + [Guid]::NewGuid().ToString("N")
}

if ($DatabaseUrl -match "-pooler") {
  Write-Host "Aviso: esta URL parece ser pooled (-pooler). Para migraciones usa la URL directa de Neon, sin -pooler." -ForegroundColor Yellow
}

Invoke-Checked "Validando build local..." { npm run build }

Invoke-Checked "Vinculando proyecto en Vercel..." { npx vercel link --yes --project $ProjectName }

Invoke-Checked "Configurando DATABASE_URL en Vercel..." { $DatabaseUrl | npx vercel env add DATABASE_URL production }
Invoke-Checked "Configurando SESSION_SECRET en Vercel..." { $SessionSecret | npx vercel env add SESSION_SECRET production }
Invoke-Checked "Configurando VITE_APP_NAME en Vercel..." { "MundiWMS" | npx vercel env add VITE_APP_NAME production }

Invoke-Checked "Aplicando migraciones en PostgreSQL de nube..." {
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = $DatabaseUrl
    npm run db:migrate
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}

Invoke-Checked "Cargando datos iniciales en PostgreSQL de nube..." {
  $previousDatabaseUrl = $env:DATABASE_URL
  try {
    $env:DATABASE_URL = $DatabaseUrl
    npm run db:seed
  } finally {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}

Invoke-Checked "Publicando en Vercel..." { npx vercel --prod --yes }
