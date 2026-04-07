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
# Por defecto: incremental (últimos 8 días, margen sobre la ventana semanal del cron).
# Si se pasa cualquier argumento (ej. --since, --dry-run, --list-projects), se respeta tal cual.
cd "${SCRIPT_DIR}"
if [ "$#" -eq 0 ]; then
    SINCE=$(date -d '8 days ago' +%Y-%m-%d)
    echo "${LOG_PREFIX} Modo incremental: --since ${SINCE}"
    python3 extract.py --since "${SINCE}"
else
    python3 extract.py "$@"
fi

echo "${LOG_PREFIX} === Fin pipeline BigQuery ==="
