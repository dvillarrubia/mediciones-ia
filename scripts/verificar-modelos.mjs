#!/usr/bin/env node
/**
 * Verifica que los modelos configurados sigan existiendo en OpenRouter y que
 * los precios que mostramos coincidan con los reales.
 *
 * Motivación: en agosto de 2026 OpenAI deprecó gpt-4o-search-preview y todos
 * los análisis empezaron a fallar con un 404. El id estaba cableado en 15
 * sitios y nadie se enteró hasta que reventó en producción. Este script
 * convierte esa sorpresa en un chequeo de 5 segundos.
 *
 * Uso:
 *   node scripts/verificar-modelos.mjs
 *   node scripts/verificar-modelos.mjs --json   (salida para CI)
 *
 * Códigos de salida:
 *   0 = todo correcto
 *   1 = hay modelos rotos o caducando (requiere acción)
 *   2 = no se pudo consultar la API de OpenRouter
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONSTANTS = join(RAIZ, 'api/config/constants.ts');
const SERVICIO = join(RAIZ, 'api/services/openaiService.ts');
const API = 'https://openrouter.ai/api/v1/models';
const JSON_OUT = process.argv.includes('--json');

const c = {
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  err: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

/** Extrae los modelos curados de OPENROUTER_MODELS con su precio y contexto. */
function leerModelosConfigurados() {
  const src = readFileSync(CONSTANTS, 'utf8');
  const ini = src.indexOf('export const OPENROUTER_MODELS');
  if (ini === -1) throw new Error('No encuentro OPENROUTER_MODELS en constants.ts');
  const fin = src.indexOf('\n];', ini);
  const bloque = src.slice(ini, fin);

  const modelos = [];
  for (const m of bloque.matchAll(/\{\s*id:\s*'([^']+)'[\s\S]*?pricing:\s*'([^']*)'[\s\S]*?\}/g)) {
    modelos.push({ id: m[1], pricing: m[2] });
  }
  // contextWindow va antes de pricing en cada bloque; se extrae aparte por id
  for (const mo of modelos) {
    const re = new RegExp(`id: '${mo.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*?contextWindow: '([^']*)'`);
    mo.contexto = (bloque.match(re) || [])[1] || '?';
  }
  return modelos;
}

/** Modelos cableados fuera de la lista curada (defaults del servicio). */
function leerModelosCableados() {
  const out = [];
  const cst = readFileSync(CONSTANTS, 'utf8');
  const def = cst.match(/export const DEFAULT_MODEL = '([^']+)'/);
  if (def) out.push({ id: def[1], donde: 'constants.ts · DEFAULT_MODEL' });

  const svc = readFileSync(SERVICIO, 'utf8');
  for (const [, nombre, id] of svc.matchAll(/private readonly (GENERATION_MODEL|ANALYSIS_MODEL|DEFAULT_MODEL) = "([^"]+)"/g)) {
    out.push({ id, donde: `openaiService.ts · ${nombre}` });
  }
  return out;
}

/** '$0.25/M in · $2/M out · $0.01/búsqueda' -> {in:0.25, out:2, busqueda:0.01} */
function parsearPrecio(s) {
  const num = (re) => { const m = s.match(re); return m ? parseFloat(m[1]) : null; };
  return {
    entrada: num(/\$([\d.]+)\/M in/),
    salida: num(/\$([\d.]+)\/M out/),
    busqueda: num(/\$([\d.]+)\/búsqueda/),
  };
}

const casiIgual = (a, b) => a === null || b === null ? a === b : Math.abs(a - b) < 0.0005;

async function main() {
  let catalogo;
  try {
    const r = await fetch(API, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    catalogo = (await r.json()).data;
  } catch (e) {
    console.error(c.err(`✗ No se pudo consultar OpenRouter: ${e.message}`));
    process.exit(2);
  }

  const porId = new Map(catalogo.map((m) => [m.id, m]));
  const problemas = [];
  const avisos = [];
  const filas = [];

  const curados = leerModelosConfigurados();
  const cableados = leerModelosCableados();

  // --- 1. Los modelos cableados deben existir ---
  for (const { id, donde } of cableados) {
    const base = id.replace(/:online$/, '');
    if (!porId.has(base)) {
      problemas.push(`${id} (${donde}) NO existe en OpenRouter — romperá en cuanto se use`);
    }
  }

  // --- 2. Los curados: existencia, expiración y deriva de precio ---
  for (const mo of curados) {
    const base = mo.id.replace(/:online$/, '');
    const real = porId.get(base);
    if (!real) {
      problemas.push(`${mo.id} NO existe en OpenRouter`);
      filas.push([mo.id, c.err('NO EXISTE'), '—']);
      continue;
    }

    const notas = [];
    if (real.expiration_date) {
      const dias = Math.round((new Date(real.expiration_date) - new Date()) / 86400000);
      if (dias < 90) problemas.push(`${mo.id} EXPIRA el ${real.expiration_date} (en ${dias} días)`);
      else avisos.push(`${mo.id} tiene expiración anunciada: ${real.expiration_date}`);
      notas.push(`expira ${real.expiration_date}`);
    }

    const cfg = parsearPrecio(mo.pricing);
    const p = real.pricing;
    const rIn = parseFloat(p.prompt) * 1e6;
    const rOut = parseFloat(p.completion) * 1e6;
    const rWeb = p.web_search ? parseFloat(p.web_search) : null;

    if (!casiIgual(cfg.entrada, rIn)) notas.push(`in: dice $${cfg.entrada} y son $${rIn}`);
    if (!casiIgual(cfg.salida, rOut)) notas.push(`out: dice $${cfg.salida} y son $${rOut}`);
    if (cfg.busqueda !== null && rWeb !== null && !casiIgual(cfg.busqueda, rWeb)) {
      notas.push(`búsqueda: dice $${cfg.busqueda} y son $${rWeb}`);
    }
    notas.filter((n) => n.includes('dice')).forEach((n) => avisos.push(`${mo.id} — ${n}`));

    filas.push([
      mo.id,
      notas.length === 0 ? c.ok('ok') : c.warn('revisar'),
      notas.length ? notas.join('; ') : c.dim(`$${rIn}/M in · $${rOut}/M out${rWeb ? ` · $${rWeb}/búsq.` : ''}`),
    ]);
  }

  if (JSON_OUT) {
    console.log(JSON.stringify({ problemas, avisos, verificados: curados.length }, null, 2));
    process.exit(problemas.length ? 1 : 0);
  }

  console.log(`\nVerificando ${curados.length} modelos curados y ${cableados.length} cableados contra ${API}\n`);
  const ancho = Math.max(...filas.map((f) => f[0].length));
  for (const [id, estado, nota] of filas) {
    console.log(`  ${id.padEnd(ancho)}  ${estado.padEnd(16)} ${nota}`);
  }

  console.log('\nModelos cableados (defaults):');
  for (const { id, donde } of cableados) {
    const existe = porId.has(id.replace(/:online$/, ''));
    console.log(`  ${existe ? c.ok('ok') : c.err('ROTO')}  ${id.padEnd(ancho)}  ${c.dim(donde)}`);
  }

  if (avisos.length) {
    console.log(c.warn(`\n⚠ ${avisos.length} aviso(s) — no rompen, pero desinforman al usuario:`));
    avisos.forEach((a) => console.log(`  · ${a}`));
  }
  if (problemas.length) {
    console.log(c.err(`\n✗ ${problemas.length} problema(s) que ROMPEN los análisis:`));
    problemas.forEach((p) => console.log(`  · ${p}`));
    console.log(c.dim('\n  Ver CONFIGURACION_MODELOS_IA.md para el procedimiento de sustitución.\n'));
    process.exit(1);
  }
  if (avisos.length) {
    console.log(c.ok('\n✓ Ningún modelo roto.') + c.warn(' Revisa los avisos de arriba: los precios mostrados no coinciden.\n'));
  } else {
    console.log(c.ok('\n✓ Todos los modelos configurados existen y los precios coinciden.\n'));
  }
}

main();
