@echo off
cd /d C:\dev\minifixwood
docker compose up -d
docker compose logs -f api
