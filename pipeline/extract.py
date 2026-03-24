#!/usr/bin/env python3
"""
Pipeline SQLite → BigQuery
Extrae análisis de los PROYECTOS configurados, aplana el JSON y sube a BigQuery.

Uso:
  python3 extract.py                    # Procesa proyectos configurados
  python3 extract.py --since 2026-03-01 # Solo análisis desde esa fecha
  python3 extract.py --dry-run          # Solo muestra qué haría, sin subir
  python3 extract.py --list-projects    # Lista todos los proyectos en la DB
"""
import argparse
import json
import logging
import os
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any

from google.cloud import bigquery

from config import (
    BQ_PROJECT_ID,
    BQ_DATASET,
    BQ_KEY_FILE,
    SQLITE_DB_PATH,
    DOCKER_CONTAINER,
    DOCKER_DB_PATH,
    PROJECTS,
    TABLE_ANALYSES,
    TABLE_BRAND_MENTIONS,
    TABLE_SOURCES,
    TABLE_AI_OVERVIEW_SOV,
    TABLE_AI_OVERVIEW_GAPS,
    TABLE_AI_OVERVIEW_TOP_PAGES,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("pipeline")

# ---------------------------------------------------------------------------
# BigQuery schemas — todas las tablas llevan client_name y project_name
# ---------------------------------------------------------------------------

SCHEMA_ANALYSES = [
    bigquery.SchemaField("analysis_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("client_name", "STRING"),
    bigquery.SchemaField("project_name", "STRING"),
    bigquery.SchemaField("project_id", "STRING"),
    bigquery.SchemaField("user_id", "STRING"),
    bigquery.SchemaField("brand", "STRING"),
    bigquery.SchemaField("competitors", "STRING"),
    bigquery.SchemaField("template_id", "STRING"),
    bigquery.SchemaField("questions_count", "INTEGER"),
    bigquery.SchemaField("country_code", "STRING"),
    bigquery.SchemaField("country_name", "STRING"),
    bigquery.SchemaField("industry", "STRING"),
    bigquery.SchemaField("models_used", "STRING"),
    bigquery.SchemaField("overall_confidence", "FLOAT"),
    bigquery.SchemaField("total_sources", "INTEGER"),
    bigquery.SchemaField("priority_sources", "INTEGER"),
    bigquery.SchemaField("duration_ms", "INTEGER"),
    bigquery.SchemaField("analysis_timestamp", "TIMESTAMP"),
    bigquery.SchemaField("created_at", "TIMESTAMP"),
    bigquery.SchemaField("loaded_at", "TIMESTAMP"),
]

SCHEMA_BRAND_MENTIONS = [
    bigquery.SchemaField("analysis_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("client_name", "STRING"),
    bigquery.SchemaField("project_name", "STRING"),
    bigquery.SchemaField("question_id", "STRING"),
    bigquery.SchemaField("question_text", "STRING"),
    bigquery.SchemaField("question_category", "STRING"),
    bigquery.SchemaField("brand_name", "STRING"),
    bigquery.SchemaField("is_target", "BOOLEAN"),
    bigquery.SchemaField("is_discovered", "BOOLEAN"),
    bigquery.SchemaField("mentioned", "BOOLEAN"),
    bigquery.SchemaField("frequency", "INTEGER"),
    bigquery.SchemaField("appearance_order", "INTEGER"),
    bigquery.SchemaField("sentiment", "STRING"),
    bigquery.SchemaField("detailed_sentiment", "STRING"),
    bigquery.SchemaField("competitive_position", "STRING"),
    bigquery.SchemaField("context_type", "STRING"),
    bigquery.SchemaField("confidence_score", "FLOAT"),
    bigquery.SchemaField("evidence", "STRING"),
    bigquery.SchemaField("brand", "STRING"),
    bigquery.SchemaField("analysis_timestamp", "TIMESTAMP"),
    bigquery.SchemaField("loaded_at", "TIMESTAMP"),
]

SCHEMA_SOURCES = [
    bigquery.SchemaField("analysis_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("client_name", "STRING"),
    bigquery.SchemaField("project_name", "STRING"),
    bigquery.SchemaField("question_id", "STRING"),
    bigquery.SchemaField("url", "STRING"),
    bigquery.SchemaField("domain", "STRING"),
    bigquery.SchemaField("title", "STRING"),
    bigquery.SchemaField("is_priority", "BOOLEAN"),
    bigquery.SchemaField("source_type", "STRING"),
    bigquery.SchemaField("credibility", "STRING"),
    bigquery.SchemaField("brand", "STRING"),
    bigquery.SchemaField("analysis_timestamp", "TIMESTAMP"),
    bigquery.SchemaField("loaded_at", "TIMESTAMP"),
]

SCHEMA_AI_OVERVIEW_SOV = [
    bigquery.SchemaField("analysis_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("client_name", "STRING"),
    bigquery.SchemaField("project_name", "STRING"),
    bigquery.SchemaField("domain", "STRING"),
    bigquery.SchemaField("is_target", "BOOLEAN"),
    bigquery.SchemaField("keywords_count", "INTEGER"),
    bigquery.SchemaField("share_of_voice_pct", "FLOAT"),
    bigquery.SchemaField("total_estimated_volume", "INTEGER"),
    bigquery.SchemaField("intent_informational", "INTEGER"),
    bigquery.SchemaField("intent_navigational", "INTEGER"),
    bigquery.SchemaField("intent_commercial", "INTEGER"),
    bigquery.SchemaField("intent_transactional", "INTEGER"),
    bigquery.SchemaField("target_domain", "STRING"),
    bigquery.SchemaField("country_code", "STRING"),
    bigquery.SchemaField("analysis_timestamp", "TIMESTAMP"),
    bigquery.SchemaField("loaded_at", "TIMESTAMP"),
]

SCHEMA_AI_OVERVIEW_GAPS = [
    bigquery.SchemaField("analysis_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("client_name", "STRING"),
    bigquery.SchemaField("project_name", "STRING"),
    bigquery.SchemaField("keyword", "STRING"),
    bigquery.SchemaField("search_volume", "INTEGER"),
    bigquery.SchemaField("competitor_domain", "STRING"),
    bigquery.SchemaField("target_domain", "STRING"),
    bigquery.SchemaField("country_code", "STRING"),
    bigquery.SchemaField("analysis_timestamp", "TIMESTAMP"),
    bigquery.SchemaField("loaded_at", "TIMESTAMP"),
]

SCHEMA_AI_OVERVIEW_TOP_PAGES = [
    bigquery.SchemaField("analysis_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("client_name", "STRING"),
    bigquery.SchemaField("project_name", "STRING"),
    bigquery.SchemaField("domain", "STRING"),
    bigquery.SchemaField("is_target", "BOOLEAN"),
    bigquery.SchemaField("url", "STRING"),
    bigquery.SchemaField("keyword_count", "INTEGER"),
    bigquery.SchemaField("target_domain", "STRING"),
    bigquery.SchemaField("country_code", "STRING"),
    bigquery.SchemaField("analysis_timestamp", "TIMESTAMP"),
    bigquery.SchemaField("loaded_at", "TIMESTAMP"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def safe_json(raw: str | None) -> Any:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def safe_ts(val: str | None) -> str | None:
    if not val:
        return None
    try:
        val = val.replace("Z", "+00:00")
        dt = datetime.fromisoformat(val)
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError):
        return None


def now_ts() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------------
# Copy DB from Docker container
# ---------------------------------------------------------------------------

def copy_db_from_docker() -> str:
    dest = SQLITE_DB_PATH
    log.info("Copiando DB desde container %s:%s → %s", DOCKER_CONTAINER, DOCKER_DB_PATH, dest)
    try:
        subprocess.run(
            ["docker", "cp", f"{DOCKER_CONTAINER}:{DOCKER_DB_PATH}", dest],
            check=True, capture_output=True, text=True,
        )
        size_mb = os.path.getsize(dest) / (1024 * 1024)
        log.info("DB copiada: %.2f MB", size_mb)
    except subprocess.CalledProcessError as e:
        log.error("Error copiando DB: %s", e.stderr)
        sys.exit(1)
    return dest


# ---------------------------------------------------------------------------
# Resolve projects: name → (project_id, client_name)
# ---------------------------------------------------------------------------

def resolve_projects(db_path: str) -> dict[str, dict]:
    """
    Match configured PROJECTS against the DB.
    Returns {project_id: {"name": ..., "client": ...}}
    """
    if not PROJECTS:
        log.error("No hay proyectos configurados en config.py PROJECTS")
        log.error("Usa --list-projects para ver los disponibles")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM projects")
    db_projects = {row["name"]: row["id"] for row in cur.fetchall()}
    conn.close()

    resolved: dict[str, dict] = {}
    for proj_name, proj_config in PROJECTS.items():
        if proj_name in db_projects:
            resolved[db_projects[proj_name]] = {
                "name": proj_name,
                "client": proj_config.get("client", proj_name),
            }
            log.info("✅ Proyecto '%s' → id=%s, client='%s'",
                      proj_name, db_projects[proj_name], proj_config.get("client", proj_name))
        else:
            log.warning("⚠️  Proyecto '%s' no encontrado en la DB. Proyectos disponibles:", proj_name)
            for name in db_projects:
                log.warning("     - %s", name)

    if not resolved:
        log.error("Ningún proyecto configurado existe en la DB")
        sys.exit(1)

    return resolved


def list_projects(db_path: str):
    """List all projects in the DB with their analysis counts."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("""
        SELECT p.id, p.name, p.description, COUNT(a.id) as analysis_count,
               MAX(a.timestamp) as last_analysis
        FROM projects p
        LEFT JOIN analysis a ON a.project_id = p.id
        GROUP BY p.id
        ORDER BY analysis_count DESC
    """)

    rows = cur.fetchall()
    print("\n=== Proyectos en la base de datos ===\n")
    print(f"{'Nombre':<40} {'Análisis':>10} {'Último análisis':<22} {'ID'}")
    print("-" * 100)
    for row in rows:
        print(f"{row['name']:<40} {row['analysis_count']:>10} {row['last_analysis'] or 'N/A':<22} {row['id']}")

    # Also show analyses without project
    cur.execute("SELECT COUNT(*) as cnt FROM analysis WHERE project_id IS NULL")
    orphan = cur.fetchone()["cnt"]
    if orphan:
        print(f"\n⚠️  {orphan} análisis sin proyecto asignado")

    conn.close()
    print("\nPara exportar, añade los nombres a PROJECTS en config.py")


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------

def extract_analyses(
    db_path: str,
    project_map: dict[str, dict],
    since: str | None = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Extract analyses only for configured projects.
    Returns: (analyses, brand_mentions, sources)
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    project_ids = list(project_map.keys())
    placeholders = ", ".join("?" for _ in project_ids)
    query = f"SELECT * FROM analysis WHERE project_id IN ({placeholders})"
    params: list = list(project_ids)

    if since:
        query += " AND timestamp >= ?"
        params.append(since)

    query += " ORDER BY timestamp DESC"

    cur.execute(query, params)
    rows = cur.fetchall()
    log.info("Encontrados %d análisis en los proyectos seleccionados", len(rows))

    analyses_out: list[dict] = []
    mentions_out: list[dict] = []
    sources_out: list[dict] = []
    loaded = now_ts()

    for row in rows:
        analysis_id = row["id"]
        project_id = row["project_id"]
        brand = row["brand"]
        ts = safe_ts(row["timestamp"])
        created = safe_ts(row["created_at"])

        proj_info = project_map.get(project_id, {"name": "Unknown", "client": "Unknown"})
        client_name = proj_info["client"]
        project_name = proj_info["name"]

        config = safe_json(row["configuration"])
        results = safe_json(row["results"])
        metadata = safe_json(row["metadata"])

        # --- analyses ---
        analyses_out.append({
            "analysis_id": analysis_id,
            "client_name": client_name,
            "project_name": project_name,
            "project_id": project_id,
            "user_id": row["user_id"],
            "brand": brand,
            "competitors": ", ".join(safe_json(row["competitors"])) if row["competitors"] else "",
            "template_id": row["template_id"],
            "questions_count": row["questions_count"],
            "country_code": config.get("countryCode", ""),
            "country_name": config.get("countryName", ""),
            "industry": config.get("industry", ""),
            "models_used": ", ".join(metadata.get("modelsUsed", [])),
            "overall_confidence": results.get("overallConfidence"),
            "total_sources": results.get("totalSources", 0),
            "priority_sources": results.get("prioritySources", 0),
            "duration_ms": metadata.get("duration"),
            "analysis_timestamp": ts,
            "created_at": created,
            "loaded_at": loaded,
        })

        # --- brand_mentions (per question) ---
        questions = results.get("questions", [])
        for q in questions:
            q_id = q.get("questionId", "")
            q_text = q.get("question", "")
            q_cat = q.get("category", "")

            for bm in q.get("brandMentions", []):
                ctx_analysis = bm.get("contextualAnalysis", {}) or {}
                mentions_out.append({
                    "analysis_id": analysis_id,
                    "client_name": client_name,
                    "project_name": project_name,
                    "question_id": q_id,
                    "question_text": q_text,
                    "question_category": q_cat,
                    "brand_name": bm.get("brand", ""),
                    "is_target": bm.get("brand", "").lower() == brand.lower() if brand else False,
                    "is_discovered": bm.get("isDiscovered", False),
                    "mentioned": bm.get("mentioned", False),
                    "frequency": bm.get("frequency", 0),
                    "appearance_order": bm.get("appearanceOrder", 0),
                    "sentiment": bm.get("context", ""),
                    "detailed_sentiment": ctx_analysis.get("sentiment", bm.get("detailedSentiment", "")),
                    "competitive_position": ctx_analysis.get("competitivePosition", ""),
                    "context_type": ctx_analysis.get("contextType", ""),
                    "confidence_score": ctx_analysis.get("confidence", q.get("confidenceScore")),
                    "evidence": bm.get("evidence", [""])[0] if bm.get("evidence") else "",
                    "brand": brand,
                    "analysis_timestamp": ts,
                    "loaded_at": loaded,
                })

        # --- sources (per question) ---
        for q in questions:
            q_id = q.get("questionId", "")
            for src in q.get("sources", []):
                sources_out.append({
                    "analysis_id": analysis_id,
                    "client_name": client_name,
                    "project_name": project_name,
                    "question_id": q_id,
                    "url": src.get("url", ""),
                    "domain": src.get("domain", ""),
                    "title": src.get("title", ""),
                    "is_priority": src.get("isPriority", False),
                    "source_type": None,
                    "credibility": None,
                    "brand": brand,
                    "analysis_timestamp": ts,
                    "loaded_at": loaded,
                })
            for src in q.get("sourcesCited", []):
                sources_out.append({
                    "analysis_id": analysis_id,
                    "client_name": client_name,
                    "project_name": project_name,
                    "question_id": q_id,
                    "url": src.get("url", ""),
                    "domain": "",
                    "title": src.get("name", ""),
                    "is_priority": False,
                    "source_type": src.get("type", ""),
                    "credibility": src.get("credibility", ""),
                    "brand": brand,
                    "analysis_timestamp": ts,
                    "loaded_at": loaded,
                })

    conn.close()
    return analyses_out, mentions_out, sources_out


def extract_ai_overviews(
    db_path: str,
    project_map: dict[str, dict],
    since: str | None = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """Extract AI Overview data from analyses in configured projects."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    project_ids = list(project_map.keys())
    placeholders = ", ".join("?" for _ in project_ids)
    query = f"SELECT * FROM analysis WHERE project_id IN ({placeholders})"
    params: list = list(project_ids)

    if since:
        query += " AND timestamp >= ?"
        params.append(since)

    query += " ORDER BY timestamp DESC"
    cur.execute(query, params)
    rows = cur.fetchall()

    sov_out: list[dict] = []
    gap_out: list[dict] = []
    pages_out: list[dict] = []
    loaded = now_ts()

    for row in rows:
        results = safe_json(row["results"])
        analysis_id = row["id"]
        project_id = row["project_id"]
        ts = safe_ts(row["timestamp"])
        config = safe_json(row["configuration"])

        proj_info = project_map.get(project_id, {"name": "Unknown", "client": "Unknown"})
        client_name = proj_info["client"]
        project_name = proj_info["name"]

        sov = results.get("share_of_voice")
        metadata = results.get("metadata", {})
        target_domain = metadata.get("target_domain", config.get("targetDomain", ""))
        country_code = config.get("countryCode", metadata.get("country_code", ""))

        if not sov and not results.get("gap_analysis"):
            continue

        log.info("AI Overview encontrado: %s (proyecto: %s)", analysis_id, project_name)

        for entry in (sov or []):
            domain = entry.get("domain", "")
            intent = entry.get("intent_distribution", {})
            vol = entry.get("volume_distribution", {})
            sov_out.append({
                "analysis_id": analysis_id,
                "client_name": client_name,
                "project_name": project_name,
                "domain": domain,
                "is_target": domain == target_domain,
                "keywords_count": entry.get("keywords_count", entry.get("keyword_count", 0)),
                "share_of_voice_pct": entry.get("share_of_voice_pct", entry.get("share_of_voice", 0)),
                "total_estimated_volume": vol.get("total", 0) if isinstance(vol, dict) else 0,
                "intent_informational": intent.get("informational", 0) if isinstance(intent, dict) else 0,
                "intent_navigational": intent.get("navigational", 0) if isinstance(intent, dict) else 0,
                "intent_commercial": intent.get("commercial", 0) if isinstance(intent, dict) else 0,
                "intent_transactional": intent.get("transactional", 0) if isinstance(intent, dict) else 0,
                "target_domain": target_domain,
                "country_code": country_code,
                "analysis_timestamp": ts,
                "loaded_at": loaded,
            })

        gaps = results.get("gap_analysis", {})
        for gap_entry in gaps.get("top_gaps", []):
            gap_out.append({
                "analysis_id": analysis_id,
                "client_name": client_name,
                "project_name": project_name,
                "keyword": gap_entry.get("keyword", ""),
                "search_volume": gap_entry.get("search_volume", gap_entry.get("volume", 0)),
                "competitor_domain": gap_entry.get("domain", gap_entry.get("competitor", "")),
                "target_domain": target_domain,
                "country_code": country_code,
                "analysis_timestamp": ts,
                "loaded_at": loaded,
            })

        top_pages = results.get("top_pages", {})
        if isinstance(top_pages, dict):
            for domain, pages in top_pages.items():
                if not isinstance(pages, list):
                    continue
                for page in pages:
                    pages_out.append({
                        "analysis_id": analysis_id,
                        "client_name": client_name,
                        "project_name": project_name,
                        "domain": domain,
                        "is_target": domain == target_domain,
                        "url": page.get("url", ""),
                        "keyword_count": page.get("keyword_count", 0),
                        "target_domain": target_domain,
                        "country_code": country_code,
                        "analysis_timestamp": ts,
                        "loaded_at": loaded,
                    })

    conn.close()
    log.info("AI Overview: %d SoV, %d gaps, %d top_pages", len(sov_out), len(gap_out), len(pages_out))
    return sov_out, gap_out, pages_out


# ---------------------------------------------------------------------------
# BigQuery loader
# ---------------------------------------------------------------------------

def get_bq_client() -> bigquery.Client:
    return bigquery.Client.from_service_account_json(BQ_KEY_FILE, project=BQ_PROJECT_ID)


def ensure_table(client: bigquery.Client, table_name: str, schema: list[bigquery.SchemaField]):
    table_ref = f"{BQ_PROJECT_ID}.{BQ_DATASET}.{table_name}"
    try:
        client.get_table(table_ref)
        log.info("Tabla %s ya existe", table_ref)
    except Exception:
        table = bigquery.Table(table_ref, schema=schema)
        table.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.DAY,
            field="analysis_timestamp",
        )
        client.create_table(table)
        log.info("Tabla %s creada", table_ref)


def load_rows(client: bigquery.Client, table_name: str, schema: list, rows: list[dict], dry_run: bool = False):
    if not rows:
        log.info("Sin datos para %s, saltando", table_name)
        return

    table_ref = f"{BQ_PROJECT_ID}.{BQ_DATASET}.{table_name}"

    if dry_run:
        log.info("[DRY RUN] Cargaría %d filas en %s", len(rows), table_ref)
        log.info("[DRY RUN] Ejemplo: %s", json.dumps(rows[0], default=str, ensure_ascii=False)[:500])
        return

    # Delete existing rows for these analysis_ids to avoid duplicates
    analysis_ids = list(set(r["analysis_id"] for r in rows))
    if analysis_ids:
        ids_str = ", ".join(f"'{aid}'" for aid in analysis_ids)
        delete_query = f"DELETE FROM `{table_ref}` WHERE analysis_id IN ({ids_str})"
        try:
            client.query(delete_query).result()
            log.info("Eliminadas filas previas para %d análisis en %s", len(analysis_ids), table_name)
        except Exception as e:
            log.warning("No se pudieron eliminar filas previas (tabla nueva?): %s", e)

    job_config = bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    job = client.load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()
    log.info("Cargadas %d filas en %s", job.output_rows, table_ref)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Pipeline SQLite → BigQuery (por proyectos)")
    parser.add_argument("--since", help="Solo análisis desde esta fecha (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="No subir, solo mostrar")
    parser.add_argument("--skip-copy", action="store_true", help="No copiar DB del container")
    parser.add_argument("--db-path", help="Ruta directa a la DB SQLite")
    parser.add_argument("--list-projects", action="store_true", help="Listar proyectos disponibles y salir")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Pipeline SQLite → BigQuery")
    log.info("=" * 60)

    # Get the database
    if args.db_path:
        db_path = args.db_path
    elif args.skip_copy:
        db_path = SQLITE_DB_PATH
    else:
        db_path = copy_db_from_docker()

    if not os.path.exists(db_path):
        log.error("DB no encontrada: %s", db_path)
        sys.exit(1)

    # List projects mode
    if args.list_projects:
        list_projects(db_path)
        return

    # Resolve configured projects
    project_map = resolve_projects(db_path)
    log.info("Exportando %d proyectos", len(project_map))

    # Extract
    log.info("Extrayendo datos...")
    analyses, mentions, sources = extract_analyses(db_path, project_map, args.since)
    sov, gaps, top_pages = extract_ai_overviews(db_path, project_map, args.since)

    log.info("Resumen extracción:")
    log.info("  Análisis:         %d", len(analyses))
    log.info("  Brand mentions:   %d", len(mentions))
    log.info("  Sources:          %d", len(sources))
    log.info("  AI Overview SoV:  %d", len(sov))
    log.info("  AI Overview Gaps: %d", len(gaps))
    log.info("  AI Overview Pages:%d", len(top_pages))

    if not analyses and not sov:
        log.warning("No hay datos para cargar")
        return

    # Load to BigQuery
    if not args.dry_run:
        client = get_bq_client()
        ensure_table(client, TABLE_ANALYSES, SCHEMA_ANALYSES)
        ensure_table(client, TABLE_BRAND_MENTIONS, SCHEMA_BRAND_MENTIONS)
        ensure_table(client, TABLE_SOURCES, SCHEMA_SOURCES)
        ensure_table(client, TABLE_AI_OVERVIEW_SOV, SCHEMA_AI_OVERVIEW_SOV)
        ensure_table(client, TABLE_AI_OVERVIEW_GAPS, SCHEMA_AI_OVERVIEW_GAPS)
        ensure_table(client, TABLE_AI_OVERVIEW_TOP_PAGES, SCHEMA_AI_OVERVIEW_TOP_PAGES)
    else:
        client = None

    load_rows(client, TABLE_ANALYSES, SCHEMA_ANALYSES, analyses, args.dry_run)
    load_rows(client, TABLE_BRAND_MENTIONS, SCHEMA_BRAND_MENTIONS, mentions, args.dry_run)
    load_rows(client, TABLE_SOURCES, SCHEMA_SOURCES, sources, args.dry_run)
    load_rows(client, TABLE_AI_OVERVIEW_SOV, SCHEMA_AI_OVERVIEW_SOV, sov, args.dry_run)
    load_rows(client, TABLE_AI_OVERVIEW_GAPS, SCHEMA_AI_OVERVIEW_GAPS, gaps, args.dry_run)
    load_rows(client, TABLE_AI_OVERVIEW_TOP_PAGES, SCHEMA_AI_OVERVIEW_TOP_PAGES, top_pages, args.dry_run)

    log.info("=" * 60)
    log.info("Pipeline completado")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
