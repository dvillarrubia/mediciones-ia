"""
Configuración del pipeline SQLite → BigQuery
"""
import os

# === BigQuery ===
BQ_PROJECT_ID = os.getenv("BQ_PROJECT_ID", "iberdrola-spain-367412")
BQ_DATASET = os.getenv("BQ_DATASET", "seo_ias")
BQ_KEY_FILE = os.getenv(
    "BQ_KEY_FILE",
    "/opt/mediciones-ia/pipeline/service-account.json"
)

# === SQLite ===
SQLITE_DB_PATH = os.getenv(
    "SQLITE_DB_PATH",
    "/tmp/analysis.db"
)

# === Docker ===
DOCKER_CONTAINER = os.getenv("DOCKER_CONTAINER", "mediciones-ia-api")
DOCKER_DB_PATH = "/app/data/analysis.db"

# === Tablas BigQuery ===
TABLE_ANALYSES = "analyses"
TABLE_BRAND_MENTIONS = "brand_mentions"
TABLE_SOURCES = "sources"
TABLE_AI_OVERVIEW_SOV = "ai_overview_sov"
TABLE_AI_OVERVIEW_GAPS = "ai_overview_gaps"
TABLE_AI_OVERVIEW_TOP_PAGES = "ai_overview_top_pages"

# ===========================================
# PROYECTOS A EXPORTAR
#
# Solo los proyectos listados aquí viajan a BigQuery.
# Usar el nombre EXACTO del proyecto tal como aparece en la app.
# También puedes usar el project_id directamente.
#
# Ejemplo:
#   PROJECTS = {
#       "Iberdrola Marca": {"client": "Iberdrola"},
#       "Iberdrola Genérico": {"client": "Iberdrola"},
#       "Seobide Marca": {"client": "Seobide"},
#   }
#
# - La key es el nombre del proyecto en la app
# - "client" es la etiqueta que aparecerá en Looker Studio
#   para agrupar proyectos del mismo cliente
# ===========================================
PROJECTS: dict[str, dict] = {
    # Descomentar y configurar con los nombres reales:
    # "Iberdrola Marca": {"client": "Iberdrola"},
    # "Iberdrola Genérico": {"client": "Iberdrola"},
}
