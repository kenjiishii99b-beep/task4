#!/bin/sh
# App Service (Linux) startup command: sh startup.sh
# 1) apply DB migrations  2) load sample data  3) start the API
#
# Sample data:
#   normal              : load only when the DB is empty
#   RESET_DEMO_DATA=1   : delete ALL rows and reload the sample data (demo reset).
#                         Remove the app setting right after the restart, or every restart resets the DB.
set -e
python -m alembic upgrade head
if [ "${RESET_DEMO_DATA:-}" = "1" ]; then
  echo "RESET_DEMO_DATA=1: resetting all data to the sample data"
  python -m app.seed --reset
else
  python -m app.seed
fi
exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
