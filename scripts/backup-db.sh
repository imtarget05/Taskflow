#!/usr/bin/env bash
set -euo pipefail
# TaskFlow PG backup — dùng pg_dump + verify restore + retention
# Usage: DATABASE_URL=postgresql://... ./scripts/backup-db.sh [/backup/dir]
# Cron: 0 3 * * * /opt/taskflow/scripts/backup-db.sh >> /var/log/taskflow-backup.log 2>&1

BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/taskflow-$TIMESTAMP.dump"
mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] DATABASE_URL not set" >&2; exit 1
fi

echo "[backup] dumping to $FILE ..."
pg_dump --format=custom --compress=9 --no-acl --no-owner "$DATABASE_URL" -f "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "[backup] done $FILE ($SIZE)"

# Verify: pg_restore --list phải đọc được
echo "[backup] verifying ..."
pg_restore --list "$FILE" > /dev/null
echo "[backup] verify ok"

# Retention
echo "[backup] pruning >$RETENTION_DAYS days ..."
find "$BACKUP_DIR" -name "taskflow-*.dump" -mtime +"$RETENTION_DAYS" -delete -print || true

echo "[backup] complete — remaining backups:"
ls -lh "$BACKUP_DIR"/taskflow-*.dump 2>/dev/null | tail -n 20 || echo "(none)"
