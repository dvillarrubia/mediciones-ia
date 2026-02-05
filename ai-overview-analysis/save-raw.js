/**
 * save-raw.js - Helper para guardar JSON crudo de SERP en raw/
 *
 * Uso:
 *   node save-raw.js <keyword-slug> < response.json
 *   node save-raw.js <keyword-slug> <path-to-file.json>
 *   echo '{"tasks":[...]}' | node save-raw.js precio-luz-hoy
 *
 * El keyword-slug se usa como nombre de archivo: raw/serp_<slug>.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, 'raw');

function slugify(text) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Uso: node save-raw.js <keyword-slug> [archivo.json]');
    console.error('  Si no se pasa archivo, lee de stdin');
    process.exit(1);
  }

  const slug = slugify(args[0]);
  const outputPath = join(RAW_DIR, `serp_${slug}.json`);

  if (!existsSync(RAW_DIR)) {
    mkdirSync(RAW_DIR, { recursive: true });
  }

  let jsonData;

  if (args[1]) {
    // Leer de archivo
    const filePath = args[1];
    if (!existsSync(filePath)) {
      console.error(`Archivo no encontrado: ${filePath}`);
      process.exit(1);
    }
    jsonData = readFileSync(filePath, 'utf-8');
  } else {
    // Leer de stdin
    jsonData = readFileSync(0, 'utf-8');
  }

  // Validar que es JSON valido
  try {
    const parsed = JSON.parse(jsonData);
    // Re-serializar con formato bonito
    writeFileSync(outputPath, JSON.stringify(parsed, null, 2), 'utf-8');
    console.log(`Guardado: ${outputPath}`);
    console.log(`  Tamano: ${(Buffer.byteLength(jsonData) / 1024).toFixed(1)} KB`);

    // Info rapida del contenido
    if (parsed.tasks?.[0]?.result?.[0]) {
      const result = parsed.tasks[0].result[0];
      console.log(`  Keyword: ${result.keyword || 'N/A'}`);
      console.log(`  Items: ${result.items?.length || 0}`);
      const types = (result.items || []).map(i => i.type);
      const uniqueTypes = [...new Set(types)];
      console.log(`  Tipos: ${uniqueTypes.join(', ')}`);
    }
  } catch (e) {
    console.error(`Error: JSON invalido - ${e.message}`);
    process.exit(1);
  }
}

main();
