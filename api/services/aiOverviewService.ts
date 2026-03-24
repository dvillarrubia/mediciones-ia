/**
 * AI Overview Analysis Service
 *
 * Porta la lógica de ai-overview-analysis (parse.js + analyze.js) a TypeScript.
 * Orquesta: fetch de DataForSEO → parse → analyze → guardar resultados.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  dataforseoService,
  COUNTRY_TO_LOCATION_CODE,
  type DataForSEOCredentials,
  type DataForSEORankedKeywordItem,
} from './dataforseoService.js';

// ==================== TIPOS ====================

export interface AIOverviewConfig {
  targetDomain: string;
  targetAliases?: string[];
  competitors: string[];
  countryCode: string;
  keywordsLimit?: number; // default 1000
}

export interface ParsedEntry {
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

export interface KeywordIndexEntry {
  keyword: string;
  search_volume: number;
  cpc: number;
  competition_level: string | null;
  keyword_difficulty: number | null;
  search_intent: string | null;
  serp_item_types: string[];
  domains_cited: Record<string, {
    url: string | null;
    title: string | null;
    ai_ref_position: number | null;
    etv: number;
    page_rank: number | null;
    referring_domains: number;
  }>;
}

export interface ShareOfVoiceEntry {
  domain: string;
  is_target: boolean;
  keywords_count: number;
  share_by_count_pct: number;
  total_search_volume: number;
  share_by_volume_pct: number;
  total_etv: number;
  share_by_etv_pct: number;
}

export interface GapEntry {
  keyword: string;
  search_volume: number;
  search_intent: string | null;
  keyword_difficulty: number | null;
  competitors_present: Array<{
    domain: string;
    etv: number;
    url: string | null;
  }>;
  total_competitors: number;
}

export interface AIOverviewResult {
  metadata: {
    analyzed_at: string;
    unique_keywords: number;
    domains_analyzed: number;
    target_domain: string;
    competitors: string[];
    country_code: string;
    location_code: number;
    language_code: string;
    total_cost_usd: number;
    entries_per_domain: Record<string, number>;
  };
  share_of_voice: ShareOfVoiceEntry[];
  overlap_matrix: Record<string, Record<string, number>>;
  gap_analysis: {
    total_gaps: number;
    total_gap_volume: number;
    top_gaps: GapEntry[];
  };
  target_exclusive: {
    count: number;
    total_volume: number;
    top: Array<{
      keyword: string;
      search_volume: number;
      etv: number;
      search_intent: string | null;
      cited_url: string | null;
    }>;
  };
  exclusive_keywords: Record<string, {
    count: number;
    total_volume: number;
    top: Array<{
      keyword: string;
      search_volume: number;
      etv: number;
      search_intent: string | null;
    }>;
  }>;
  intent_distribution: Record<string, Record<string, { count: number; total_volume: number }>>;
  volume_distribution: Record<string, Record<string, number>>;
  top_keywords: Record<string, Array<{
    keyword: string;
    search_volume: number;
    etv: number;
    ai_ref_position: number | null;
    search_intent: string | null;
    cited_url: string | null;
  }>>;
  top_pages: Record<string, Array<{
    url: string;
    title: string | null;
    count: number;
    total_volume: number;
    total_etv: number;
  }>>;
}

// ==================== HELPERS ====================

function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function getBucket(vol: number): string {
  if (vol >= 100000) return '100k+';
  if (vol >= 10000) return '10k-100k';
  if (vol >= 1000) return '1k-10k';
  if (vol >= 100) return '100-1k';
  return '<100';
}

// ==================== SERVICIO ====================

class AIOverviewService {

  /**
   * Ejecutar análisis completo: fetch → parse → analyze
   */
  async executeAnalysis(
    credentials: DataForSEOCredentials,
    config: AIOverviewConfig,
    onProgress?: (stage: string, detail: string) => void
  ): Promise<AIOverviewResult> {
    const location = COUNTRY_TO_LOCATION_CODE[config.countryCode];
    if (!location) {
      throw new Error(`País no soportado: ${config.countryCode}`);
    }

    const { location_code, language_code } = location;
    const allDomains = [config.targetDomain, ...config.competitors];
    const keywordsLimit = config.keywordsLimit === 0 ? 0 : (config.keywordsLimit || 1000);

    // === FASE 1: FETCH desde DataForSEO ===
    const byDomain: Record<string, ParsedEntry[]> = {};
    let totalCost = 0;

    for (const domain of allDomains) {
      onProgress?.('fetch', `Obteniendo datos de ${domain}...`);
      console.log(`[AIOverview] Fetching AI Overview data for: "${domain}" (loc=${location_code}, lang=${language_code}, limit=${keywordsLimit})`);

      try {
        const { items, cost } = await dataforseoService.getRankedKeywords(
          credentials,
          domain,
          location_code,
          language_code,
          keywordsLimit
        );

        totalCost += cost;
        byDomain[domain] = this.parseItems(items, domain);
        console.log(`[AIOverview] ${domain}: ${byDomain[domain].length} AI Overview citations found`);
      } catch (err: any) {
        console.error(`[AIOverview] Error fetching ${domain}:`, err.message);
        byDomain[domain] = []; // Continue with empty data for this domain
      }

      onProgress?.('fetch', `${domain}: ${byDomain[domain].length} citaciones encontradas`);
    }

    // === FASE 2: CONSTRUIR ÍNDICE ===
    onProgress?.('parse', 'Construyendo índice de keywords...');
    const keywordIndex = this.buildKeywordIndex(byDomain);

    // === FASE 3: ANALIZAR ===
    onProgress?.('analyze', 'Calculando métricas de Share of Voice...');
    const result = this.analyze(byDomain, keywordIndex, config, location_code, language_code, totalCost);

    onProgress?.('done', 'Análisis completado');
    return result;
  }

  /**
   * Parsear items de la API de DataForSEO a formato normalizado
   */
  private parseItems(items: DataForSEORankedKeywordItem[], domain: string): ParsedEntry[] {
    const parsed: ParsedEntry[] = [];

    for (const item of items) {
      const kd = item.keyword_data;
      const rse = item.ranked_serp_element;
      if (!kd || !rse) continue;

      const ki = kd.keyword_info || {} as any;
      const si = kd.serp_info || {} as any;
      const sei = kd.search_intent_info || {} as any;
      const kp = kd.keyword_properties || {} as any;
      const serpItem = rse.serp_item || {} as any;

      parsed.push({
        keyword: kd.keyword,
        search_volume: ki.search_volume || 0,
        cpc: ki.cpc || 0,
        competition: ki.competition || 0,
        competition_level: ki.competition_level || null,
        keyword_difficulty: kp.keyword_difficulty ?? null,
        search_intent: sei.main_intent || null,
        cited_domain: domain,
        cited_url: serpItem.url || null,
        cited_title: serpItem.title || null,
        cited_page_domain: extractDomain(serpItem.url) || serpItem.main_domain?.replace(/^www\./, '') || domain,
        ai_ref_position: serpItem.rank_group || null,
        etv: serpItem.etv || 0,
        estimated_paid_traffic_cost: serpItem.estimated_paid_traffic_cost || 0,
        serp_item_types: si.serp_item_types || [],
        se_results_count: si.se_results_count || 0,
        monthly_searches: ki.monthly_searches || {},
        search_volume_trend: ki.search_volume_trend || {},
        page_rank: serpItem.rank_info?.page_rank || null,
        domain_rank: serpItem.rank_info?.main_domain_rank || null,
        referring_domains: serpItem.backlinks_info?.referring_domains || 0,
      });
    }

    return parsed;
  }

  /**
   * Construir índice de keywords (todas las keywords únicas con sus dominios)
   */
  private buildKeywordIndex(byDomain: Record<string, ParsedEntry[]>): Record<string, KeywordIndexEntry> {
    const keywordIndex: Record<string, KeywordIndexEntry> = {};

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
            domains_cited: {},
          };
        }
        if (entry.search_volume > keywordIndex[kw].search_volume) {
          keywordIndex[kw].search_volume = entry.search_volume;
        }
        keywordIndex[kw].domains_cited[domain] = {
          url: entry.cited_url,
          title: entry.cited_title,
          ai_ref_position: entry.ai_ref_position,
          etv: entry.etv,
          page_rank: entry.page_rank,
          referring_domains: entry.referring_domains,
        };
      }
    }

    return keywordIndex;
  }

  /**
   * Analizar datos y calcular todas las métricas
   */
  private analyze(
    byDomain: Record<string, ParsedEntry[]>,
    keywordIndex: Record<string, KeywordIndexEntry>,
    config: AIOverviewConfig,
    locationCode: number,
    languageCode: string,
    totalCost: number
  ): AIOverviewResult {
    const { targetDomain, competitors } = config;
    const allDomains = [targetDomain, ...competitors];

    // === 1. Share of Voice ===
    const sovByCount: Record<string, number> = {};
    const sovByVolume: Record<string, number> = {};
    const sovByEtv: Record<string, number> = {};

    for (const domain of allDomains) {
      const entries = byDomain[domain] || [];
      sovByCount[domain] = entries.length;
      sovByVolume[domain] = entries.reduce((sum, e) => sum + (e.search_volume || 0), 0);
      sovByEtv[domain] = entries.reduce((sum, e) => sum + (e.etv || 0), 0);
    }

    const totalCount = Object.values(sovByCount).reduce((a, b) => a + b, 0);
    const totalVolume = Object.values(sovByVolume).reduce((a, b) => a + b, 0);
    const totalEtv = Object.values(sovByEtv).reduce((a, b) => a + b, 0);

    const shareOfVoice: ShareOfVoiceEntry[] = allDomains.map(domain => ({
      domain,
      is_target: domain === targetDomain,
      keywords_count: sovByCount[domain] || 0,
      share_by_count_pct: totalCount > 0 ? round((sovByCount[domain] / totalCount) * 100) : 0,
      total_search_volume: sovByVolume[domain] || 0,
      share_by_volume_pct: totalVolume > 0 ? round((sovByVolume[domain] / totalVolume) * 100) : 0,
      total_etv: sovByEtv[domain] || 0,
      share_by_etv_pct: totalEtv > 0 ? round((sovByEtv[domain] / totalEtv) * 100) : 0,
    }));

    // === 2. Overlap matrix ===
    const overlapMatrix: Record<string, Record<string, number>> = {};
    for (const d1 of allDomains) {
      overlapMatrix[d1] = {};
      const kws1 = new Set((byDomain[d1] || []).map(e => e.keyword));
      for (const d2 of allDomains) {
        const kws2 = new Set((byDomain[d2] || []).map(e => e.keyword));
        let overlap = 0;
        for (const k of kws1) {
          if (kws2.has(k)) overlap++;
        }
        overlapMatrix[d1][d2] = overlap;
      }
    }

    // === 3. Exclusive keywords per domain ===
    const exclusiveKeywords: Record<string, { count: number; total_volume: number; top: Array<{ keyword: string; search_volume: number; etv: number; search_intent: string | null }> }> = {};
    for (const domain of allDomains) {
      const entries = byDomain[domain] || [];
      const exclusive = entries
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
        .sort((a, b) => b.search_volume - a.search_volume);

      exclusiveKeywords[domain] = {
        count: exclusive.length,
        total_volume: exclusive.reduce((s, e) => s + e.search_volume, 0),
        top: exclusive.slice(0, 25),
      };
    }

    // === 4. Gap analysis ===
    const targetKeywords = new Set((byDomain[targetDomain] || []).map(e => e.keyword));
    const gapsByKeyword: Record<string, GapEntry> = {};

    for (const comp of competitors) {
      const compEntries = byDomain[comp] || [];
      for (const entry of compEntries) {
        if (!targetKeywords.has(entry.keyword)) {
          if (!gapsByKeyword[entry.keyword]) {
            gapsByKeyword[entry.keyword] = {
              keyword: entry.keyword,
              search_volume: entry.search_volume,
              search_intent: entry.search_intent,
              keyword_difficulty: entry.keyword_difficulty,
              competitors_present: [],
              total_competitors: 0,
            };
          }
          gapsByKeyword[entry.keyword].competitors_present.push({
            domain: comp,
            etv: entry.etv,
            url: entry.cited_url,
          });
          gapsByKeyword[entry.keyword].total_competitors = gapsByKeyword[entry.keyword].competitors_present.length;
        }
      }
    }

    const gapList = Object.values(gapsByKeyword).sort((a, b) => b.search_volume - a.search_volume);

    // === 5. Target exclusive (vs all competitors) ===
    const competitorKeywords = new Set<string>();
    for (const comp of competitors) {
      for (const entry of (byDomain[comp] || [])) {
        competitorKeywords.add(entry.keyword);
      }
    }

    const targetExclusive = (byDomain[targetDomain] || [])
      .filter(e => !competitorKeywords.has(e.keyword))
      .map(e => ({
        keyword: e.keyword,
        search_volume: e.search_volume,
        etv: e.etv,
        search_intent: e.search_intent,
        cited_url: e.cited_url,
      }))
      .sort((a, b) => b.search_volume - a.search_volume);

    // === 6. Intent distribution ===
    const intentDistribution: Record<string, Record<string, { count: number; total_volume: number }>> = {};
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

    // === 7. Top keywords per domain ===
    const topKeywords: Record<string, Array<{ keyword: string; search_volume: number; etv: number; ai_ref_position: number | null; search_intent: string | null; cited_url: string | null }>> = {};
    for (const domain of allDomains) {
      topKeywords[domain] = (byDomain[domain] || [])
        .sort((a, b) => b.search_volume - a.search_volume)
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

    // === 8. Volume distribution ===
    const volumeDistByDomain: Record<string, Record<string, number>> = {};
    const defaultBuckets = { '100k+': 0, '10k-100k': 0, '1k-10k': 0, '100-1k': 0, '<100': 0 };
    for (const domain of allDomains) {
      volumeDistByDomain[domain] = { ...defaultBuckets };
      for (const entry of (byDomain[domain] || [])) {
        volumeDistByDomain[domain][getBucket(entry.search_volume)]++;
      }
    }

    // === 9. Top pages ===
    const topPages: Record<string, Array<{ url: string; title: string | null; count: number; total_volume: number; total_etv: number }>> = {};
    for (const domain of allDomains) {
      const urlCounts: Record<string, { url: string; title: string | null; count: number; total_volume: number; total_etv: number }> = {};
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

    // === Compilar resultado ===
    return {
      metadata: {
        analyzed_at: new Date().toISOString(),
        unique_keywords: Object.keys(keywordIndex).length,
        domains_analyzed: allDomains.length,
        target_domain: targetDomain,
        competitors,
        country_code: config.countryCode,
        location_code: locationCode,
        language_code: languageCode,
        total_cost_usd: round(totalCost),
        entries_per_domain: Object.fromEntries(
          Object.entries(byDomain).map(([d, entries]) => [d, entries.length])
        ),
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
        total_volume: targetExclusive.reduce((s, e) => s + e.search_volume, 0),
        top: targetExclusive.slice(0, 50),
      },
      exclusive_keywords: exclusiveKeywords,
      intent_distribution: intentDistribution,
      volume_distribution: volumeDistByDomain,
      top_keywords: topKeywords,
      top_pages: topPages,
    };
  }
}

export const aiOverviewService = new AIOverviewService();
