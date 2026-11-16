#!/bin/sh
# App Service (Linux) startup command: sh startup.sh
# 1) apply DB migrations  2) load sample data only when the DB is empty  3) start the API
set -e
python -m alembic upgrade head
python -m app.seed
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
