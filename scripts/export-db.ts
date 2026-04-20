#!/usr/bin/env tsx
/**
 * Export analyses from local SQLite to a JSON file that can be uploaded
 * through the Admin → "Importar análisis" UI.
 *
 * Usage:
 *   npx tsx scripts/export-db.ts                      # writes data/export.json
 *   npx tsx scripts/export-db.ts --out=path.json      # custom output
 *   npx tsx scripts/export-db.ts --db=other.db        # custom input DB
 */
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function all<T = any>(db: sqlite3.Database, sql: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const dbPath = args.db || path.resolve('data', 'analysis.db');
  const outPath = args.out || path.resolve('data', 'export.json');

  if (!fs.existsSync(dbPath)) {
    console.error(`DB no encontrada: ${dbPath}`);
    process.exit(1);
  }

  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

  const projects = await all(db, 'SELECT id, name, description, user_id FROM projects');
  const analyses = await all(
    db,
    `SELECT id, user_id, project_id, timestamp, brand, competitors, template_id,
            questions_count, configuration, results, metadata, created_at
     FROM analysis`
  );
  const aiOverviews = await all(
    db,
    `SELECT id, user_id, project_id, timestamp, target_domain, competitors,
            location_code, language_code, country_code, configuration, results,
            cost_usd, status, created_at
     FROM ai_overview_analyses`
  );

  db.close();

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    source: path.basename(dbPath),
    projects,
    analyses,
    aiOverviews,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log(`Exportado a ${outPath}`);
  console.log(`  Proyectos:    ${projects.length}`);
  console.log(`  Análisis:     ${analyses.length}`);
  console.log(`  AI Overviews: ${aiOverviews.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
