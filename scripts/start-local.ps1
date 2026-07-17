$ErrorActionPreference = "Stop"

Write-Host "Starting MundiWMS local services..."
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
