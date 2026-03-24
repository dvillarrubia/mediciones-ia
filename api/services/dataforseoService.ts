/**
 * DataForSEO API Client
 * Conecta directamente a la API REST de DataForSEO Labs
 * para obtener datos de AI Overview references por dominio.
 */

export interface DataForSEOCredentials {
  login: string;
  password: string;
}

export interface DataForSEORequest {
  target: string;
  location_code: number;
  language_code: string;
  item_types: string[];
  limit: number;
  offset?: number;
  order_by?: string[];
  filters?: any[];
}

export interface DataForSEORankedKeywordItem {
  keyword_data: {
    keyword: string;
    keyword_info: {
      search_volume: number;
      cpc: number;
      competition: number;
      competition_level: string;
      monthly_searches: Record<string, number>;
      search_volume_trend: Record<string, number>;
    };
    keyword_properties: {
      keyword_difficulty: number;
    };
    search_intent_info: {
      main_intent: string;
    };
    serp_info: {
      serp_item_types: string[];
      se_results_count: number;
    };
  };
  ranked_serp_element: {
    serp_item: {
      type: string;
      rank_group: number;
      rank_absolute: number;
      domain: string;
      title: string;
      url: string;
      text: string;
      main_domain: string;
      relative_url: string;
      etv: number;
      estimated_paid_traffic_cost: number;
      rank_info: {
        page_rank: number;
        main_domain_rank: number;
      };
      backlinks_info?: {
        referring_domains: number;
      };
      rank_changes?: {
        previous_rank_absolute: number;
        is_new: boolean;
        is_up: boolean;
        is_down: boolean;
      };
    };
  };
}

export interface DataForSEOTaskResult {
  se_type: string;
  target: string;
  location_code: number;
  language_code: string;
  total_count: number;
  items_count: number;
  metrics: Record<string, any>;
  items: DataForSEORankedKeywordItem[];
}

export interface DataForSEOResponse {
  version: string;
  status_code: number;
  status_message: string;
  time: string;
  cost: number;
  tasks_count: number;
  tasks_error: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    time: string;
    cost: number;
    result_count: number;
    result: DataForSEOTaskResult[];
  }>;
}

// Mapeo de códigos de país de la app a location_code de DataForSEO
export const COUNTRY_TO_LOCATION_CODE: Record<string, { location_code: number; language_code: string }> = {
  'ES': { location_code: 2724, language_code: 'es' },
  'MX': { location_code: 2484, language_code: 'es' },
  'AR': { location_code: 2032, language_code: 'es' },
  'CO': { location_code: 2170, language_code: 'es' },
  'CL': { location_code: 2152, language_code: 'es' },
  'PE': { location_code: 2604, language_code: 'es' },
  'EC': { location_code: 2218, language_code: 'es' },
  'US': { location_code: 2840, language_code: 'en' },
  'US-ES': { location_code: 2840, language_code: 'es' },
  'BR': { location_code: 2076, language_code: 'pt' },
  'PT': { location_code: 2620, language_code: 'pt' },
  'GB': { location_code: 2826, language_code: 'en' },
  'DE': { location_code: 2276, language_code: 'de' },
  'FR': { location_code: 2250, language_code: 'fr' },
  'IT': { location_code: 2380, language_code: 'it' },
  'LATAM': { location_code: 2484, language_code: 'es' }, // Default Mexico para LATAM
  'GLOBAL': { location_code: 2840, language_code: 'en' }, // Default US para Global
};

const API_BASE = 'https://api.dataforseo.com/v3';

class DataForSEOService {
  /**
   * Llamar a la API una vez con retry automático si falla con 500
   */
  private async fetchPage(
    authString: string,
    requestBody: DataForSEORequest[],
    domain: string
  ): Promise<DataForSEOResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(`${API_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DataForSEO API error ${response.status}: ${errorText}`);
    }

    let data: DataForSEOResponse = await response.json();

    // Retry con limit menor si Internal Error (algunos dominios fallan con limit=1000)
    if (data.status_code === 50000 && requestBody[0].limit > 500) {
      console.log(`[DataForSEO] Internal error for ${domain} with limit=${requestBody[0].limit}, retrying with limit=500...`);
      requestBody[0].limit = 500;
      const retryResponse = await fetch(`${API_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      data = await retryResponse.json();
    }

    return data;
  }

  /**
   * Obtener keywords donde un dominio es citado en AI Overviews.
   * limit=0 significa traer TODAS las keywords disponibles (pagina automáticamente).
   */
  async getRankedKeywords(
    credentials: DataForSEOCredentials,
    domain: string,
    locationCode: number,
    languageCode: string,
    limit: number = 0
  ): Promise<{ items: DataForSEORankedKeywordItem[]; totalCount: number; cost: number }> {
    const allItems: DataForSEORankedKeywordItem[] = [];
    let totalCount = 0;
    let totalCost = 0;
    let offset = 0;
    const fetchAll = limit === 0;
    const authString = Buffer.from(`${credentials.login}:${credentials.password}`).toString('base64');

    while (true) {
      const batchLimit = fetchAll ? 1000 : Math.min(limit - allItems.length, 1000);
      if (batchLimit <= 0) break;

      const requestBody: DataForSEORequest[] = [{
        target: domain,
        location_code: locationCode,
        language_code: languageCode,
        item_types: ['ai_overview_reference'],
        limit: batchLimit,
        offset,
      }];

      const data = await this.fetchPage(authString, requestBody, domain);

      if (data.status_code !== 20000) {
        throw new Error(`DataForSEO error: ${data.status_message}`);
      }

      const task = data.tasks?.[0];
      if (!task || task.status_code !== 20000) {
        throw new Error(`DataForSEO task error: ${task?.status_message || 'Unknown error'}`);
      }

      totalCost += task.cost || 0;

      const result = task.result?.[0];
      if (!result || !result.items || result.items.length === 0) break;

      totalCount = result.total_count;
      allItems.push(...result.items);

      console.log(`[DataForSEO] ${domain}: page ${Math.floor(offset / 1000) + 1} — ${allItems.length}/${totalCount} items fetched`);

      // Si obtuvimos menos items de los pedidos, no hay más
      if (result.items.length < batchLimit) break;

      // Si ya tenemos todos, parar
      if (!fetchAll && allItems.length >= limit) break;

      offset += result.items.length;

      // Safety: máximo 20 páginas (20000 keywords)
      if (offset >= 20000) break;
    }

    return { items: allItems, totalCount, cost: totalCost };
  }

  /**
   * Estimar el coste de un análisis antes de ejecutar
   */
  estimateCost(domainCount: number, keywordsPerDomain: number = 1000): {
    estimatedCost: number;
    apiCalls: number;
    description: string;
  } {
    const callsPerDomain = Math.ceil(keywordsPerDomain / 1000);
    const totalCalls = domainCount * callsPerDomain;
    // $0.01 per call + $0.0001 per item
    const estimatedCost = totalCalls * 0.01 + domainCount * keywordsPerDomain * 0.0001;

    return {
      estimatedCost: Math.round(estimatedCost * 100) / 100,
      apiCalls: totalCalls,
      description: `${domainCount} dominios x ${keywordsPerDomain} keywords = ~$${estimatedCost.toFixed(2)} USD`,
    };
  }

  /**
   * Validar credenciales haciendo una llamada mínima
   */
  async validateCredentials(credentials: DataForSEOCredentials): Promise<boolean> {
    try {
      const authString = Buffer.from(`${credentials.login}:${credentials.password}`).toString('base64');

      const response = await fetch(`${API_BASE}/dataforseo_labs/google/ranked_keywords/live`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{
          target: 'example.com',
          location_code: 2840,
          language_code: 'en',
          item_types: ['ai_overview_reference'],
          limit: 1,
        }]),
      });

      const data = await response.json();
      // Even if there are no results, a 20000 status means credentials are valid
      return data.status_code === 20000;
    } catch {
      return false;
    }
  }
}

export const dataforseoService = new DataForSEOService();
