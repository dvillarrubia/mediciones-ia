#!/bin/bash
# ===========================================
# Setup del pipeline en el VPS
#
# Ejecutar una sola vez:
#   bash /opt/mediciones-ia/pipeline/setup.sh
# ===========================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Setup Pipeline BigQuery ==="
echo "Directorio: ${SCRIPT_DIR}"

# 1. Crear venv Python
echo ""
echo "1. Creando entorno virtual Python..."
if ! command -v python3 &> /dev/null; then
    echo "Instalando Python3..."
    apt-get update && apt-get install -y python3 python3-venv python3-pip
fi

python3 -m venv "${SCRIPT_DIR}/venv"
source "${SCRIPT_DIR}/venv/bin/activate"

# 2. Instalar dependencias
echo ""
echo "2. Instalando dependencias..."
pip install --upgrade pip
pip install -r "${SCRIPT_DIR}/requirements.txt"

# 3. Verificar service account key
echo ""
echo "3. Verificando credenciales..."
SA_KEY="${SCRIPT_DIR}/service-account.json"
if [ ! -f "${SA_KEY}" ]; then
    echo "⚠️  FALTA: ${SA_KEY}"
    echo "   Copia el archivo JSON de service account aquí:"
    echo "   scp tu-service-account.json root@srv817047.hstgr.cloud:${SA_KEY}"
    echo ""
    echo "   El archivo actual está en conexion_bq/:"
    echo "   cp /opt/mediciones-ia/conexion_bq/*.json ${SA_KEY}"
else
    echo "✅ Service account key encontrada"
fi

# 4. Hacer ejecutable run.sh
chmod +x "${SCRIPT_DIR}/run.sh"

# 5. Configurar cron
echo ""
echo "4. Configurando cron (lunes 6:00 AM)..."
CRON_LINE="0 6 * * 1 ${SCRIPT_DIR}/run.sh >> /var/log/bq-pipeline.log 2>&1"

# Verificar si ya existe
if crontab -l 2>/dev/null | grep -q "bq-pipeline"; then
    echo "   Cron ya configurado, actualizando..."
    crontab -l 2>/dev/null | grep -v "bq-pipeline" | { cat; echo "${CRON_LINE}"; } | crontab -
else
    (crontab -l 2>/dev/null; echo "${CRON_LINE}") | crontab -
fi
echo "✅ Cron configurado:"
crontab -l | grep "bq-pipeline"

# 6. Test rápido
echo ""
echo "5. Test rápido (dry-run)..."
cd "${SCRIPT_DIR}"
python3 extract.py --dry-run --skip-copy --db-path /tmp/test-nonexistent.db 2>&1 || true

echo ""
echo "=== Setup completo ==="
echo ""
echo "Próximos pasos:"
echo "  1. Copiar service account key si aún no existe:"
echo "     cp /opt/mediciones-ia/conexion_bq/*.json ${SA_KEY}"
echo ""
echo "  2. Probar manualmente:"
echo "     ${SCRIPT_DIR}/run.sh --dry-run"
echo ""
echo "  3. Ejecutar de verdad:"
echo "     ${SCRIPT_DIR}/run.sh"
echo ""
echo "  4. El cron se ejecutará cada lunes a las 6:00 AM"
echo "     Logs en: /var/log/bq-pipeline.log"
