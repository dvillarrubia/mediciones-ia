/**
 * Comprobación de la detección de blog de marca (isBrandBlog) contra datos reales.
 *
 * Uso:  npx tsx scripts/test-blog-classification.ts <fixture.json>
 *
 * El fixture es un volcado por proyecto con esta forma, extraído de la BD:
 *   { "<clave>": { "brandDomain": "saunierduval.es", "questions": [ ... ] } }
 * donde cada `question` lleva al menos `question`, `sources[{url,domain}]` y
 * `brandMentions`. Se saca de la columna `results` de la tabla `analysis`
 * filtrando por `project_id`. El script no toca red ni base de datos.
 */
import fs from 'fs';
import {
  classifyQuestionForBrand,
  isBrandBlog,
  sourceBelongsToBrand,
  type AnalysisSource,
  type QuestionAnalysis,
} from '../src/components/intelligence/sharedMetrics';

type Fixture = Record<string, { brandDomain: string; questions: QuestionAnalysis[] }>;

const fixture: Fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf-8'));

/** Regla anterior: substring '/blog' sobre la URL completa. */
const reglaVieja = (s: AnalysisSource) => (s.url || '').toLowerCase().includes('/blog');

const casos: Array<{ key: string; brand: string; pattern?: string }> = [
  { key: 'saunier', brand: 'Saunier Duval', pattern: 're-magazine' },
  { key: 'saunier', brand: 'Saunier Duval', pattern: undefined },
  { key: 'uoc', brand: 'UOC', pattern: undefined },
];

for (const { key, brand, pattern } of casos) {
  const data = fixture[key];
  if (!data) continue;
  const bd = data.brandDomain;

  const brandSources = data.questions.flatMap(q =>
    (q.sources || []).filter(s => sourceBelongsToBrand(s, bd))
  );
  const vieja = brandSources.filter(reglaVieja).length;
  const nueva = brandSources.filter(s => isBrandBlog(s, bd, pattern)).length;

  const tipos: Record<string, number> = {};
  for (const q of data.questions) {
    const cls = classifyQuestionForBrand(q, brand, bd, undefined, pattern);
    tipos[cls.type] = (tipos[cls.type] || 0) + 1;
  }

  console.log(`\n=== ${key} (${bd}) · patrón: ${pattern ?? '(heurística)'} ===`);
  console.log(`  fuentes de marca: ${brandSources.length}`);
  console.log(`  blog — regla vieja: ${vieja}   regla nueva: ${nueva}`);
  console.log(`  clasificación por pregunta:`, tipos);

  const hosts: Record<string, number> = {};
  for (const s of brandSources.filter(s => isBrandBlog(s, bd, pattern))) {
    let h = s.domain || '';
    try { h = new URL(s.url).hostname; } catch { /* url malformada: se queda el domain */ }
    hosts[h] = (hosts[h] || 0) + 1;
  }
  console.log('  hosts detectados como blog:', hosts);
}
