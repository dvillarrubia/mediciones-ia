/**
 * Exportación a Excel de un análisis AI Overview.
 *
 * Genera un workbook con:
 *  - Pestaña "Resumen" con todos los datos calculados que aparecen en el dashboard
 *    (Share of Voice, Gap Analysis, Overlap Matrix, Target Exclusive, Intent
 *    Distribution, Volume Distribution, Top Pages por dominio).
 *  - Una pestaña por cada dominio (target + competidores) con TODAS las
 *    keywords crudas devueltas por DataForSEO.
 *
 * Para análisis ejecutados antes de añadir la columna `raw_data`, los datos
 * crudos por dominio no están disponibles: en ese caso se exporta sólo lo
 * que hay en el resultado procesado (top_keywords).
 */

import * as XLSX from 'xlsx';

// ==================== TIPOS ====================
// Réplica de los tipos del backend (api/services/aiOverviewService.ts).
// No los importamos directamente para no acoplar el bundle al server.

interface ParsedEntry {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition: number;
  competition_level: string | null;
  keyword_difficulty: number | null;
  search_intent: string | null;
  cited_domain: string;
  cited_url: string | null;
  cited_title: string | null;
  cited_page_domain: string;
  ai_ref_position: number | null;
  etv: number;
  estimated_paid_traffic_cost: number;
  serp_item_types: string[];
  se_results_count: number;
  monthly_searches: Record<string, number>;
  search_volume_trend: Record<string, number>;
  page_rank: number | null;
  domain_rank: number | null;
  referring_domains: number;
}

interface AIOverviewRawResponse {
  id: string;
  timestamp: string;
  targetDomain: string;
  competitors: string[];
  countryCode: string;
  costUsd: number | null;
  configuration: any;
  results: any;
  byDomain: Record<string, ParsedEntry[]> | null;
}

// ==================== HELPERS ====================

/** Sanea un nombre de pestaña para Excel (max 31, sin `[]:*?/\`). */
function sanitizeSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31);
  let candidate = cleaned || 'Sheet';
  let suffix = 1;
  while (used.has(candidate.toLowerCase())) {
    const tail = `_${suffix++}`;
    candidate = (cleaned.slice(0, 31 - tail.length) + tail);
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString('es-ES'); } catch { return iso; }
}

/** Convierte una fila de objeto plano a array según un orden de columnas. */
function rowFromObject(obj: any, columns: string[]): any[] {
  return columns.map(col => {
    const v = obj?.[col];
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

// ==================== HOJAS ====================

const RAW_COLUMNS: Array<{ key: keyof ParsedEntry; header: string }> = [
  { key: 'keyword', header: 'Keyword' },
  { key: 'search_volume', header: 'Search volume' },
  { key: 'cpc', header: 'CPC' },
  { key: 'competition', header: 'Competition' },
  { key: 'competition_level', header: 'Competition level' },
  { key: 'keyword_difficulty', header: 'Keyword difficulty' },
  { key: 'search_intent', header: 'Search intent' },
  { key: 'cited_url', header: 'Cited URL' },
  { key: 'cited_title', header: 'Cited title' },
  { key: 'cited_page_domain', header: 'Cited page domain' },
  { key: 'ai_ref_position', header: 'AI ref position' },
  { key: 'etv', header: 'ETV' },
  { key: 'estimated_paid_traffic_cost', header: 'Est. paid traffic cost' },
  { key: 'serp_item_types', header: 'SERP item types' },
  { key: 'se_results_count', header: 'SE results count' },
  { key: 'page_rank', header: 'Page rank' },
  { key: 'domain_rank', header: 'Domain rank' },
  { key: 'referring_domains', header: 'Referring domains' },
];

function buildDomainSheet(entries: ParsedEntry[]): XLSX.WorkSheet {
  const headers = RAW_COLUMNS.map(c => c.header);
  const sorted = [...entries].sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0));
  const rows = sorted.map(e =>
    RAW_COLUMNS.map(c => {
      const v = e[c.key] as any;
      if (v === null || v === undefined) return '';
      if (Array.isArray(v)) return v.join(', ');
      return v;
    })
  );
  return XLSX.utils.aoa_to_sheet([headers, ...rows]);
}

/**
 * Pestaña usada como fallback para análisis sin `byDomain`. Volcamos los
 * `top_keywords` del resultado procesado, advirtiendo del límite (top 25).
 */
function buildDomainFallbackSheet(domain: string, results: any): XLSX.WorkSheet {
  const top: any[] = results?.top_keywords?.[domain] || [];
  const headers = ['Keyword', 'Search volume', 'ETV', 'AI ref position', 'Search intent', 'Cited URL'];
  const rows = top.map(t => [
    t.keyword, t.search_volume, t.etv, t.ai_ref_position, t.search_intent, t.cited_url
  ]);
  const aoa: any[][] = [
    [`Datos crudos no disponibles para análisis anteriores. Mostrando top ${top.length} keywords del resumen.`],
    [],
    headers,
    ...rows,
  ];
  return XLSX.utils.aoa_to_sheet(aoa);
}

function buildSummarySheet(data: AIOverviewRawResponse): XLSX.WorkSheet {
  const r = data.results;
  const meta = r?.metadata || {};
  const aoa: any[][] = [];

  // === Cabecera ===
  aoa.push(['INFORME AI OVERVIEW']);
  aoa.push(['Dominio target', data.targetDomain]);
  aoa.push(['Competidores', data.competitors.join(', ')]);
  aoa.push(['País', data.countryCode]);
  aoa.push(['Location code', meta.location_code]);
  aoa.push(['Language code', meta.language_code]);
  aoa.push(['Fecha análisis', fmtDate(data.timestamp)]);
  aoa.push(['Keywords únicas', meta.unique_keywords]);
  aoa.push(['Dominios analizados', meta.domains_analyzed]);
  aoa.push(['Coste total (USD)', meta.total_cost_usd ?? data.costUsd ?? '']);
  aoa.push([]);

  // === Entradas por dominio ===
  aoa.push(['ENTRADAS POR DOMINIO']);
  aoa.push(['Dominio', 'Citaciones']);
  for (const [domain, count] of Object.entries(meta.entries_per_domain || {})) {
    aoa.push([domain, count as number]);
  }
  aoa.push([]);

  // === Share of Voice ===
  aoa.push(['SHARE OF VOICE']);
  const sovCols = ['domain', 'is_target', 'keywords_count', 'share_by_count_pct', 'total_search_volume', 'share_by_volume_pct', 'total_etv', 'share_by_etv_pct'];
  const sovHeaders = ['Dominio', 'Target', 'Keywords', 'SoV count (%)', 'Volumen total', 'SoV volumen (%)', 'ETV total', 'SoV ETV (%)'];
  aoa.push(sovHeaders);
  for (const e of (r?.share_of_voice || [])) {
    aoa.push(rowFromObject(e, sovCols));
  }
  aoa.push([]);

  // === Overlap Matrix ===
  const allDomains = [data.targetDomain, ...data.competitors];
  aoa.push(['OVERLAP MATRIX (keywords compartidas entre dominios)']);
  aoa.push(['', ...allDomains]);
  for (const d1 of allDomains) {
    const row: any[] = [d1];
    for (const d2 of allDomains) {
      row.push(r?.overlap_matrix?.[d1]?.[d2] ?? 0);
    }
    aoa.push(row);
  }
  aoa.push([]);

  // === Gap Analysis ===
  const ga = r?.gap_analysis || {};
  aoa.push(['GAP ANALYSIS']);
  aoa.push(['Total gaps', ga.total_gaps ?? 0]);
  aoa.push(['Volumen total gaps', ga.total_gap_volume ?? 0]);
  aoa.push([]);
  aoa.push(['Top gaps (keywords donde el target no aparece)']);
  aoa.push(['Keyword', 'Search volume', 'Search intent', 'Keyword difficulty', 'Total competidores', 'Competidores presentes']);
  for (const g of (ga.top_gaps || [])) {
    const compsTxt = (g.competitors_present || [])
      .map((c: any) => `${c.domain} (ETV ${c.etv})`).join(' | ');
    aoa.push([g.keyword, g.search_volume, g.search_intent, g.keyword_difficulty, g.total_competitors, compsTxt]);
  }
  aoa.push([]);

  // === Target Exclusive ===
  const te = r?.target_exclusive || {};
  aoa.push(['TARGET EXCLUSIVE (keywords donde sólo aparece el target)']);
  aoa.push(['Total', te.count ?? 0]);
  aoa.push(['Volumen total', te.total_volume ?? 0]);
  aoa.push([]);
  aoa.push(['Keyword', 'Search volume', 'ETV', 'Search intent', 'Cited URL']);
  for (const e of (te.top || [])) {
    aoa.push([e.keyword, e.search_volume, e.etv, e.search_intent, e.cited_url]);
  }
  aoa.push([]);

  // === Exclusive keywords por dominio ===
  aoa.push(['EXCLUSIVE KEYWORDS POR DOMINIO']);
  for (const domain of allDomains) {
    const ex = r?.exclusive_keywords?.[domain];
    if (!ex) continue;
    aoa.push([]);
    aoa.push([`Dominio: ${domain}`, `Total: ${ex.count}`, `Volumen: ${ex.total_volume}`]);
    aoa.push(['Keyword', 'Search volume', 'ETV', 'Search intent']);
    for (const e of (ex.top || [])) {
      aoa.push([e.keyword, e.search_volume, e.etv, e.search_intent]);
    }
  }
  aoa.push([]);

  // === Intent Distribution ===
  aoa.push(['INTENT DISTRIBUTION']);
  const intents = new Set<string>();
  for (const domain of allDomains) {
    Object.keys(r?.intent_distribution?.[domain] || {}).forEach(k => intents.add(k));
  }
  const intentList = Array.from(intents);
  aoa.push(['Dominio', ...intentList.flatMap(i => [`${i} (count)`, `${i} (volumen)`])]);
  for (const domain of allDomains) {
    const row: any[] = [domain];
    for (const intent of intentList) {
      const cell = r?.intent_distribution?.[domain]?.[intent] || { count: 0, total_volume: 0 };
      row.push(cell.count, cell.total_volume);
    }
    aoa.push(row);
  }
  aoa.push([]);

  // === Volume Distribution ===
  aoa.push(['VOLUME DISTRIBUTION (rangos de volumen de búsqueda)']);
  const buckets = ['100k+', '10k-100k', '1k-10k', '100-1k', '<100'];
  aoa.push(['Dominio', ...buckets]);
  for (const domain of allDomains) {
    const row: any[] = [domain];
    for (const b of buckets) {
      row.push(r?.volume_distribution?.[domain]?.[b] ?? 0);
    }
    aoa.push(row);
  }
  aoa.push([]);

  // === Top pages por dominio ===
  aoa.push(['TOP PAGES POR DOMINIO']);
  for (const domain of allDomains) {
    const pages = r?.top_pages?.[domain] || [];
    if (!pages.length) continue;
    aoa.push([]);
    aoa.push([`Dominio: ${domain}`]);
    aoa.push(['URL', 'Title', 'Citaciones', 'Volumen total', 'ETV total']);
    for (const p of pages) {
      aoa.push([p.url, p.title, p.count, p.total_volume, p.total_etv]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Anchos aproximados: primera columna ancha, el resto 16.
  ws['!cols'] = [{ wch: 38 }, ...Array(20).fill({ wch: 16 })];
  return ws;
}

// ==================== ENTRY POINT ====================

export function exportAIOverviewToExcel(data: AIOverviewRawResponse): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  // 1) Resumen
  const summary = buildSummarySheet(data);
  XLSX.utils.book_append_sheet(wb, summary, sanitizeSheetName('Resumen', usedNames));

  // 2) Pestaña por dominio (target + competidores)
  const allDomains = [data.targetDomain, ...data.competitors];
  for (const domain of allDomains) {
    const entries = data.byDomain?.[domain];
    const sheet = entries
      ? buildDomainSheet(entries)
      : buildDomainFallbackSheet(domain, data.results);
    const isTarget = domain === data.targetDomain;
    const sheetName = sanitizeSheetName(`${isTarget ? '★ ' : ''}${domain}`, usedNames);
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  }

  // Nombre de archivo
  const date = new Date(data.timestamp).toISOString().slice(0, 10);
  const safeDomain = data.targetDomain.replace(/[^a-z0-9.-]/gi, '_');
  const filename = `ai-overview_${safeDomain}_${date}.xlsx`;

  XLSX.writeFile(wb, filename);
}
