#!/bin/bash
# ===========================================
# Pipeline SQLite → BigQuery
# Ejecutar manualmente o via cron
#
# Cron (cada lunes a las 6:00 AM):
#   0 6 * * 1 /opt/mediciones-ia/pipeline/run.sh >> /var/log/bq-pipeline.log 2>&1
# ===========================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "${LOG_PREFIX} === Inicio pipeline BigQuery ==="

# Activar venv si existe
if [ -f "${SCRIPT_DIR}/venv/bin/activate" ]; then
    source "${SCRIPT_DIR}/venv/bin/activate"
fi

# Ejecutar pipeline
cd "${SCRIPT_DIR}"
python3 extract.py "$@"

echo "${LOG_PREFIX} === Fin pipeline BigQuery ==="
