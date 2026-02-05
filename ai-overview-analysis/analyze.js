/**
 * analyze.js - Calculador de metricas de Share of Voice en AI Overviews
 *
 * Lee parsed/parsed_all.json y calcula:
 * - Share of Voice por dominio (basado en keywords y search volume)
 * - Overlap entre dominios
 * - Gap analysis
 * - Keywords exclusivas por dominio
 * - Distribucion por intent, dificultad, volumen
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARSED_PATH = join(__dirname, 'parsed', 'parsed_all.json');
const CONFIG_PATH = join(__dirname, 'config.json');
const RESULTS_DIR = join(__dirname, 'results');

function isDomainMatch(domain, target, aliases = []) {
  if (!domain) return false;
  const d = domain.replace(/^www\./, '');
  const all = [target, ...aliases].map(t => t.replace(/^www\./, ''));
  return all.some(t => d === t || d.endsWith('.' + t));
}

export function analyze() {
  if (!existsSync(PARSED_PATH)) {
    console.error('Error: parsed/parsed_all.json no existe. Ejecuta parse.js primero.');
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(PARSED_PATH, 'utf-8'));
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));

  const { target_domain, target_aliases = [], competitors } = config;
  const allDomains = [target_domain, ...competitors];
  const byDomain = data.by_domain;
  const keywordIndex = data.keyword_index;
  const allKeywords = Object.values(keywordIndex);

  console.log(`Analizando ${allKeywords.length} keywords unicas, ${allDomains.length} dominios...`);

  // === 1. Share of Voice por dominio ===
  // Metrica 1: Conteo simple de keywords donde aparece
  // Metrica 2: Ponderado por search volume (mas realista)
  // Metrica 3: Ponderado por ETV (trafico estimado del AI Overview)

  const sovByCount = {};
  const sovByVolume = {};
  const sovByEtv = {};

  for (const domain of allDomains) {
    const entries = byDomain[domain] || [];
    sovByCount[domain] = entries.length;
    sovByVolume[domain] = entries.reduce((sum, e) => sum + (e.search_volume || 0), 0);
    sovByEtv[domain] = entries.reduce((sum, e) => sum + (e.etv || 0), 0);
  }

  const totalCount = Object.values(sovByCount).reduce((a, b) => a + b, 0);
  const totalVolume = Object.values(sovByVolume).reduce((a, b) => a + b, 0);
  const totalEtv = Object.values(sovByEtv).reduce((a, b) => a + b, 0);

  const shareOfVoice = allDomains.map(domain => ({
    domain,
    is_target: domain === target_domain,
    keywords_count: sovByCount[domain] || 0,
    share_by_count_pct: totalCount > 0 ? round((sovByCount[domain] / totalCount) * 100) : 0,
    total_search_volume: sovByVolume[domain] || 0,
    share_by_volume_pct: totalVolume > 0 ? round((sovByVolume[domain] / totalVolume) * 100) : 0,
    total_etv: sovByEtv[domain] || 0,
    share_by_etv_pct: totalEtv > 0 ? round((sovByEtv[domain] / totalEtv) * 100) : 0,
  }));

  // === 2. Overlap matrix: cuantas keywords comparten cada par de dominios ===
  const overlapMatrix = {};
  for (const d1 of allDomains) {
    overlapMatrix[d1] = {};
    const kws1 = new Set((byDomain[d1] || []).map(e => e.keyword));
    for (const d2 of allDomains) {
      const kws2 = new Set((byDomain[d2] || []).map(e => e.keyword));
      const overlap = [...kws1].filter(k => kws2.has(k)).length;
      overlapMatrix[d1][d2] = overlap;
    }
  }

  // === 3. Keywords exclusivas por dominio (solo ese dominio aparece) ===
  const exclusiveKeywords = {};
  for (const domain of allDomains) {
    const entries = byDomain[domain] || [];
    exclusiveKeywords[domain] = entries
      .filter(e => {
        const kw = keywordIndex[e.keyword];
        return kw && Object.keys(kw.domains_cited).length === 1;
      })
      .map(e => ({
        keyword: e.keyword,
        search_volume: e.search_volume,
        etv: e.etv,
        search_intent: e.search_intent,
      }))
      .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));
  }

  // === 4. Gap analysis: keywords donde competidores aparecen y target NO ===
  const targetKeywords = new Set((byDomain[target_domain] || []).map(e => e.keyword));
  const gaps = [];

  for (const comp of competitors) {
    const compEntries = byDomain[comp] || [];
    for (const entry of compEntries) {
      if (!targetKeywords.has(entry.keyword)) {
        gaps.push({
          keyword: entry.keyword,
          search_volume: entry.search_volume,
          competitor: comp,
          competitor_etv: entry.etv,
          competitor_url: entry.cited_url,
          search_intent: entry.search_intent,
          keyword_difficulty: entry.keyword_difficulty,
          // Cuantos competidores mas aparecen aqui?
          total_competitors_present: competitors.filter(c =>
            keywordIndex[entry.keyword]?.domains_cited[c]
          ).length
        });
      }
    }
  }

  // Deduplicar gaps (misma keyword puede venir de multiples competidores)
  const gapsByKeyword = {};
  for (const gap of gaps) {
    if (!gapsByKeyword[gap.keyword]) {
      gapsByKeyword[gap.keyword] = {
        keyword: gap.keyword,
        search_volume: gap.search_volume,
        search_intent: gap.search_intent,
        keyword_difficulty: gap.keyword_difficulty,
        competitors_present: [],
        total_competitors: 0
      };
    }
    gapsByKeyword[gap.keyword].competitors_present.push({
      domain: gap.competitor,
      etv: gap.competitor_etv,
      url: gap.competitor_url
    });
    gapsByKeyword[gap.keyword].total_competitors = gapsByKeyword[gap.keyword].competitors_present.length;
  }

  const gapList = Object.values(gapsByKeyword)
    .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));

  // === 5. Reverse gaps: keywords donde target aparece pero ningun competidor ===
  const competitorKeywords = new Set();
  for (const comp of competitors) {
    for (const entry of (byDomain[comp] || [])) {
      competitorKeywords.add(entry.keyword);
    }
  }

  const targetExclusive = (byDomain[target_domain] || [])
    .filter(e => !competitorKeywords.has(e.keyword))
    .map(e => ({
      keyword: e.keyword,
      search_volume: e.search_volume,
      etv: e.etv,
      search_intent: e.search_intent,
      cited_url: e.cited_url,
    }))
    .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));

  // === 6. Distribucion por search intent ===
  const intentDistribution = {};
  for (const domain of allDomains) {
    intentDistribution[domain] = {};
    for (const entry of (byDomain[domain] || [])) {
      const intent = entry.search_intent || 'unknown';
      if (!intentDistribution[domain][intent]) {
        intentDistribution[domain][intent] = { count: 0, total_volume: 0 };
      }
      intentDistribution[domain][intent].count++;
      intentDistribution[domain][intent].total_volume += entry.search_volume || 0;
    }
  }

  // === 7. Top keywords por dominio (mayor search volume) ===
  const topKeywords = {};
  for (const domain of allDomains) {
    topKeywords[domain] = (byDomain[domain] || [])
      .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0))
      .slice(0, 25)
      .map(e => ({
        keyword: e.keyword,
        search_volume: e.search_volume,
        etv: e.etv,
        ai_ref_position: e.ai_ref_position,
        search_intent: e.search_intent,
        cited_url: e.cited_url,
      }));
  }

  // === 8. Distribucion por volumen de busqueda (buckets) ===
  const volumeBuckets = { '100k+': 0, '10k-100k': 0, '1k-10k': 0, '100-1k': 0, '<100': 0 };
  function getBucket(vol) {
    if (vol >= 100000) return '100k+';
    if (vol >= 10000) return '10k-100k';
    if (vol >= 1000) return '1k-10k';
    if (vol >= 100) return '100-1k';
    return '<100';
  }

  const volumeDistByDomain = {};
  for (const domain of allDomains) {
    volumeDistByDomain[domain] = { ...volumeBuckets };
    for (const entry of (byDomain[domain] || [])) {
      volumeDistByDomain[domain][getBucket(entry.search_volume || 0)]++;
    }
  }

  // === 9. Top pages: URLs mas citadas por dominio ===
  const topPages = {};
  for (const domain of allDomains) {
    const urlCounts = {};
    for (const entry of (byDomain[domain] || [])) {
      const url = entry.cited_url || 'unknown';
      if (!urlCounts[url]) {
        urlCounts[url] = { url, title: entry.cited_title, count: 0, total_volume: 0, total_etv: 0 };
      }
      urlCounts[url].count++;
      urlCounts[url].total_volume += entry.search_volume || 0;
      urlCounts[url].total_etv += entry.etv || 0;
    }
    topPages[domain] = Object.values(urlCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  }

  // === Compilar resultados ===
  const results = {
    metadata: {
      analyzed_at: new Date().toISOString(),
      unique_keywords: allKeywords.length,
      domains_analyzed: allDomains.length,
      target_domain,
      competitors,
    },
    share_of_voice: shareOfVoice,
    overlap_matrix: overlapMatrix,
    gap_analysis: {
      total_gaps: gapList.length,
      total_gap_volume: gapList.reduce((s, g) => s + (g.search_volume || 0), 0),
      top_gaps: gapList.slice(0, 100),
    },
    target_exclusive: {
      count: targetExclusive.length,
      total_volume: targetExclusive.reduce((s, e) => s + (e.search_volume || 0), 0),
      top: targetExclusive.slice(0, 50),
    },
    exclusive_keywords: Object.fromEntries(
      Object.entries(exclusiveKeywords).map(([d, kws]) => [d, {
        count: kws.length,
        total_volume: kws.reduce((s, e) => s + (e.search_volume || 0), 0),
        top: kws.slice(0, 25),
      }])
    ),
    intent_distribution: intentDistribution,
    volume_distribution: volumeDistByDomain,
    top_keywords: topKeywords,
    top_pages: topPages,
  };

  if (!existsSync(RESULTS_DIR)) {
    mkdirSync(RESULTS_DIR, { recursive: true });
  }

  const outputPath = join(RESULTS_DIR, 'share_of_voice.json');
  writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  // Quick summary
  console.log('\n=== SHARE OF VOICE SUMMARY ===');
  console.log('');
  console.log('Por conteo de keywords:');
  for (const s of shareOfVoice) {
    const bar = '#'.repeat(Math.round(s.share_by_count_pct / 2));
    console.log(`  ${s.domain.padEnd(18)} ${String(s.keywords_count).padStart(5)} kws  ${String(s.share_by_count_pct).padStart(5)}%  ${bar}`);
  }
  console.log('');
  console.log('Por search volume:');
  for (const s of shareOfVoice) {
    const bar = '#'.repeat(Math.round(s.share_by_volume_pct / 2));
    const vol = (s.total_search_volume / 1000).toFixed(0) + 'K';
    console.log(`  ${s.domain.padEnd(18)} ${vol.padStart(8)}  ${String(s.share_by_volume_pct).padStart(5)}%  ${bar}`);
  }
  console.log('');
  console.log(`Gaps (target ausente, competidor presente): ${gapList.length}`);
  console.log(`Keywords exclusivas del target: ${targetExclusive.length}`);
  console.log(`\nResultados: ${outputPath}`);

  return results;
}

function round(n) { return Math.round(n * 100) / 100; }

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  analyze();
}
