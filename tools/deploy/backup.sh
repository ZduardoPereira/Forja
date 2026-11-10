#!/usr/bin/env bash
# FORJA — backup do banco (pg_dump) e das fotos. Roda todo dia às 4h (cron) e com: npm run server:backup
# Fica em /opt/forja/app/backup.sh no servidor; os arquivos vão para /opt/forja/backups (14 dias).
# Restaurar: docs/HOSPEDAGEM.md → "Backup e restauração".
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")" # pasta do docker-compose.yml
OUT=/opt/forja/backups
KEEP_DAYS=14
stamp=$(date +%F_%H%M)
mkdir -p "$OUT"
trap 'rm -f "$OUT"/*.part' EXIT

docker compose exec -T db pg_dump -U forja -d forja --clean --if-exists | gzip > "$OUT/db-$stamp.sql.gz.part"
mv "$OUT/db-$stamp.sql.gz.part" "$OUT/db-$stamp.sql.gz"
docker compose exec -T forja tar -czf - -C /data . > "$OUT/fotos-$stamp.tgz.part"
mv "$OUT/fotos-$stamp.tgz.part" "$OUT/fotos-$stamp.tgz"

find "$OUT" -maxdepth 1 -type f \( -name 'db-*.sql.gz' -o -name 'fotos-*.tgz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') backup ok: db-$stamp.sql.gz ($(du -h "$OUT/db-$stamp.sql.gz" | cut -f1)), fotos-$stamp.tgz ($(du -h "$OUT/fotos-$stamp.tgz" | cut -f1))"
