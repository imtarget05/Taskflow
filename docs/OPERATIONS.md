# TaskFlow — Vận hành Production

## 1. Sao lưu & khôi phục

- **Script:** `scripts/backup-db.sh` — `pg_dump --format=custom` + `pg_restore --list` verify + retention 7 ngày
- **Chạy thủ công:** `DATABASE_URL=postgresql://taskflow:taskflow@localhost:5432/taskflow ./scripts/backup-db.sh ./backups`
- **Cron prod (Render/VM):** `0 3 * * * DATABASE_URL=$DATABASE_URL /opt/taskflow/scripts/backup-db.sh /var/backups >> /var/log/taskflow-backup.log 2>&1`
- **Khôi phục thử (hàng tháng):** `pg_restore -d taskflow_verify ./backups/taskflow-YYYYMMDD-HHMMSS.dump --clean --if-exists` trên DB staging, check `SELECT count(*) FROM users;`
- **Giám sát:** backup job ghi `tf_backup_last_success_timestamp` (TODO) — alert `time() - tf_backup_last_success_timestamp > 90000`

## 2. Xoay secret

| Secret | Nơi lưu | Xoay khi | Cách xoay |
|--------|---------|----------|-----------|
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Render env + `docker-compose.yml` (prod) | 90 ngày hoặc lộ | Đổi cả 2, deploy, tất cả refresh token cũ sẽ fail → user login lại (đã có `SecurityAudit AUTH_TOKEN_INVALID`) |
| `N8N_SIGNING_SECRET` / `N8N_API_KEY` | Render + n8n | 90 ngày | Đổi đồng bộ 2 bên |
| `LANGFUSE_*` | Render | khi đổi Langfuse project | Đổi + restart |
| `REDIS_URL` | Render / docker-compose | không xoay | internal only |
| `GRAFANA_ADMIN_PASSWORD` / `METRICS_BEARER_TOKEN` | `docker-compose.monitoring.yml` env | 90 ngày | Đổi + `docker compose -f docker-compose.monitoring.yml up -d` |

Checklist xoay: 1) tạo secret mới 2) set env 3) deploy 4) verify `/api/health` 200 5) revoke secret cũ 6) ghi `SecurityAudit`.

## 3. Grafana & Prometheus — cost & alert tuning

- **Scrape auth:** `monitoring/prometheus.yml` job `taskflow-server` đã hỗ trợ `authorization: Bearer ${METRICS_BEARER_TOKEN}` qua `envsubst`. Khi bật `/api/metrics` auth, set `METRICS_BEARER_TOKEN` (Render env) và `docker compose` sẽ thay thế.
- **Cost dashboard:** panel `LLM Cost (USD)` = `sum(tf_llm_cost_usd_total)` — reset khi restart (in-memory). Để persist, cần push sang Prometheus remote-write hoặc thay bằng `prom-client` persistent (backlog).
- **Alert tuning sau 1 tuần data thật:** điều chỉnh `HighErrorRate >0.5/s` và `LLMLatency >2s` nếu p50 thực tế cao hơn. Xem `monitoring/alerts.yml` — sửa `expr` rồi `docker compose -f docker-compose.monitoring.yml restart prometheus`.

## 4. Tier2 Redis

- **Không có `REDIS_URL`:** fallback Tier1 — `upsertTaskChunk` inline + cron 02:00 in-process
- **Có `REDIS_URL=redis://redis:6379`:** `rag.queue.ts` tự bật worker + repeatable `reindex-all 0 2 * * *`, task hooks enqueue với `delay 2s` debounce + `attempts 3`
- **Health:** `redis-cli ping` → `PONG`; `docker logs taskflow-redis`; nếu Redis down, hệ thống vẫn chạy (fallback inline, chỉ mất queue)
