param(
  [string]$DbName = "workshop",
  [string]$AdminEmail = "admin@local",
  [string]$AdminPassword = "Admin1234!"
)

Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "== Docker down -v (wipe DB) ==" -ForegroundColor Yellow
docker compose down -v | Out-Host

Write-Host "== Docker up -d --build ==" -ForegroundColor Yellow
docker compose up -d --build | Out-Host

Write-Host "== Apply migrations to DB: $DbName ==" -ForegroundColor Yellow
Get-Content services\api\migrations\001_init.sql -Raw | docker compose exec -T postgres psql -U postgres -d $DbName | Out-Host
Get-Content services\api\migrations\002_inventory.sql -Raw | docker compose exec -T postgres psql -U postgres -d $DbName | Out-Host

Write-Host "== Ensure admin password ==" -ForegroundColor Yellow
$hash = docker compose exec -T api python -c "from app.core.security import hash_password; print(hash_password('$AdminPassword'))"
$hash = $hash.Trim()

$sql = @"
UPDATE users SET password_hash = '$hash' WHERE email = '$AdminEmail';
"@
$sql | docker compose exec -T postgres psql -U postgres -d $DbName | Out-Host

docker compose restart api | Out-Host

Write-Host "== Done. Tables: ==" -ForegroundColor Green
docker compose exec -T postgres psql -U postgres -d $DbName -c "\dt" | Out-Host
Write-Host "Login: $AdminEmail / $AdminPassword" -ForegroundColor Green
