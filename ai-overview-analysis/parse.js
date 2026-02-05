/**
 * parse.js - Parser de datos labs ranked_keywords (ai_overview_reference)
 *
 * Lee raw/labs_ai_ref_*.json y extrae datos normalizados por dominio.
 * Cada archivo contiene las keywords donde ese dominio es citado en AI Overviews.
 *
 * Output: parsed/parsed_all.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, 'raw');
const PARSED_DIR = join(__dirname, 'parsed');
const CONFIG_PATH = join(__dirname, 'config.json');

function extractDomain(url) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function parseLabsFile(filePath, domain) {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

  // MCP wrapper: [{"type":"text","text":"<json>"}]
  let apiResponse;
  if (Array.isArray(raw) && raw[0]?.text) {
    apiResponse = JSON.parse(raw[0].text);
  } else if (raw.items) {
    apiResponse = raw;
  } else {
    console.warn(`  WARN: Formato desconocido en ${filePath}`);
    return [];
  }

  const items = apiResponse.items || [];
  const parsed = [];

  for (const item of items) {
    const kd = item.keyword_data;
    const rse = item.ranked_serp_element;

    if (!kd || !rse) continue;

    const ki = kd.keyword_info || {};
    const si = kd.serp_info || {};
    const sei = kd.search_intent_info || {};
    const kp = kd.keyword_properties || {};
    const serpItem = rse.serp_item || {};

    parsed.push({
      keyword: kd.keyword,
      search_volume: ki.search_volume || 0,
      cpc: ki.cpc || 0,
      competition: ki.competition || 0,
      competition_level: ki.competition_level || null,
      keyword_difficulty: kp.keyword_difficulty ?? rse.keyword_difficulty ?? null,
      search_intent: sei.main_intent || null,
      // AI Overview reference data
      cited_domain: domain,
      cited_url: serpItem.url || null,
      cited_title: serpItem.title || null,
      cited_page_domain: extractDomain(serpItem.url) || serpItem.main_domain?.replace(/^www\./, '') || domain,
      ai_ref_position: serpItem.rank_group || null, // position within AI Overview references
      etv: serpItem.etv || 0,
      estimated_paid_traffic_cost: serpItem.estimated_paid_traffic_cost || 0,
      // SERP context
      serp_item_types: si.serp_item_types || rse.serp_item_types || [],
      se_results_count: si.se_results_count || rse.se_results_count || 0,
      // Monthly search data
      monthly_searches: ki.monthly_searches || {},
      search_volume_trend: ki.search_volume_trend || {},
      // Backlinks of cited page
      page_rank: serpItem.rank_info?.page_rank || null,
      domain_rank: serpItem.rank_info?.main_domain_rank || null,
      referring_domains: serpItem.backlinks_info?.referring_domains || 0,
    });
  }

  return parsed;
}

export function parse() {
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  const files = config.files || {};
  const allDomains = [config.target_domain, ...config.competitors];

  console.log(`Parseando datos de ${allDomains.length} dominios...`);

  const byDomain = {};
  let totalKeywords = 0;

  for (const domain of allDomains) {
    const fileName = files[domain];
    if (!fileName) {
      console.warn(`  WARN: No hay archivo configurado para ${domain}`);
      continue;
    }

    const filePath = join(RAW_DIR, fileName);
    if (!existsSync(filePath)) {
      console.warn(`  WARN: Archivo no encontrado: ${filePath}`);
      continue;
    }

    console.log(`  -> ${domain} (${fileName})`);
    const parsed = parseLabsFile(filePath, domain);
    byDomain[domain] = parsed;
    totalKeywords += parsed.length;
    console.log(`     ${parsed.length} keywords con AI Overview reference`);
  }

  // Construir indice por keyword (todas las keywords unicas)
  const keywordIndex = {};
  for (const [domain, entries] of Object.entries(byDomain)) {
    for (const entry of entries) {
      const kw = entry.keyword;
      if (!keywordIndex[kw]) {
        keywordIndex[kw] = {
          keyword: kw,
          search_volume: entry.search_volume,
          cpc: entry.cpc,
          competition_level: entry.competition_level,
          keyword_difficulty: entry.keyword_difficulty,
          search_intent: entry.search_intent,
          serp_item_types: entry.serp_item_types,
          domains_cited: {}
        };
      }
      // Actualizar search_volume con el mayor (pueden variar entre llamadas)
      if (entry.search_volume > keywordIndex[kw].search_volume) {
        keywordIndex[kw].search_volume = entry.search_volume;
      }
      keywordIndex[kw].domains_cited[domain] = {
        url: entry.cited_url,
        title: entry.cited_title,
        ai_ref_position: entry.ai_ref_position,
        etv: entry.etv,
        page_rank: entry.page_rank,
        referring_domains: entry.referring_domains
      };
    }
  }

  if (!existsSync(PARSED_DIR)) {
    mkdirSync(PARSED_DIR, { recursive: true });
  }

  const output = {
    metadata: {
      parsed_at: new Date().toISOString(),
      domains_processed: allDomains.length,
      total_entries: totalKeywords,
      unique_keywords: Object.keys(keywordIndex).length,
      target_domain: config.target_domain,
      competitors: config.competitors,
      entries_per_domain: Object.fromEntries(
        Object.entries(byDomain).map(([d, entries]) => [d, entries.length])
      )
    },
    by_domain: byDomain,
    keyword_index: keywordIndex
  };

  const outputPath = join(PARSED_DIR, 'parsed_all.json');
  writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(1);
  console.log(`\nResultado: ${outputPath} (${sizeMB} MB)`);
  console.log(`  Keywords unicas: ${Object.keys(keywordIndex).length}`);
  console.log(`  Entradas totales: ${totalKeywords}`);

  return output;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  parse();
}
